import { Injectable } from '@nestjs/common';
import type { Prisma, ProductStatus } from '../generated/prisma/client.js';
import { LiveService } from '../notifications/live.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkListing, type ListingInput, type Reason } from './rules.js';
import { ModerationSettings } from './settings.service.js';

type Db = Prisma.TransactionClient;

/** Categories with fewer approved products than this have no reliable median price. */
const MEDIAN_MIN_SAMPLE = 5;

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ModerationSettings,
    private readonly notifications: NotificationsService,
    private readonly live: LiveService,
  ) {}

  /** Runs the rules on a listing before it is saved. `excludeId` is the product being edited. */
  async precheck(shopId: number, input: ListingInput, excludeId?: number): Promise<{ block: Reason[]; flag: Reason[] }> {
    const [settings, keywords, siblings, median] = await Promise.all([
      this.settings.get(),
      this.prisma.bannedKeyword.findMany({ select: { phrase: true, severity: true } }),
      this.prisma.product.findMany({ where: { shopId, ...(excludeId && { id: { not: excludeId } }) }, select: { name: true } }),
      this.prisma.$queryRaw<{ median: number | null; n: number }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float AS median, count(*)::int AS n
        FROM "Product" WHERE category = ${input.category} AND "adminStatus" = 'approved' AND id <> ${excludeId ?? 0}`,
    ]);
    const m = median[0];
    return checkListing(input, {
      keywords,
      medianPrice: m && m.n >= MEDIAN_MIN_SAMPLE && m.median ? m.median : undefined,
      siblingNames: siblings.map((s) => s.name),
      settings,
    });
  }

  /**
   * Decides a product the shop just saved (status `pending`), from the rule flags of its precheck.
   * A product an admin suspended goes to `review` instead, so an edit never undoes an admin decision.
   * An open flag raised by reports, the AI or the backup standard keeps the product demoted until an admin
   * decides; a flag raised by the rules alone closes once the shop fixes what the rules found.
   */
  async decide(productId: number, flags: Reason[], previous: ProductStatus | null): Promise<void> {
    const status = await this.prisma.$transaction(async (tx) => {
      if (previous === 'suspended') {
        await this.setStatus(tx, productId, 'review', flags);
        await this.openFlag(tx, productId, 'fallback', [{ code: 'edited_after_suspension', message: 'The shop edited a suspended product.' }, ...flags]);
        return 'review' as const;
      }
      const open = await tx.productFlag.findFirst({ where: { productId, status: 'open' } });
      if (open && open.source === 'rules' && !flags.length) {
        await tx.productFlag.update({ where: { id: open.id }, data: { status: 'dismissed', note: 'Fixed by the shop', decidedBy: 'system', decidedAt: new Date() } });
      }
      const keepsFlag = !!open && open.source !== 'rules';
      const next: ProductStatus = flags.length || keepsFlag ? 'limited' : 'approved';
      await this.setStatus(tx, productId, next, flags);
      if (flags.length) await this.openFlag(tx, productId, 'rules', flags);
      await tx.moderationCheck.create({ data: { productId, layer: 'rules', outcome: flags.length ? 'suspect' : 'clean', reasons: flags as unknown as Prisma.InputJsonValue } });
      return next;
    });
    await this.tellShop(productId, status, flags);
  }

  /** Demotes a live product and opens (or extends) its flag; used by reports and later by AI rechecks. */
  async demote(productId: number, source: 'report' | 'ai' | 'fallback', reasons: Reason[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { id: productId, adminStatus: 'approved' }, data: { adminStatus: 'limited', rankPenalty: 1 } });
      await this.openFlag(tx, productId, source, reasons);
    });
    await this.tellShop(productId, 'limited', reasons);
  }

  private setStatus(tx: Db, productId: number, status: ProductStatus, reasons: Reason[]) {
    return tx.product.update({
      where: { id: productId },
      data: { adminStatus: status, rankPenalty: status === 'limited' ? 1 : 0, provisional: false, moderationReasons: reasons as unknown as Prisma.InputJsonValue },
    });
  }

  /** One open flag per product: a new source adds its reasons to the open one. */
  private async openFlag(tx: Db, productId: number, source: 'rules' | 'ai' | 'report' | 'fallback', reasons: Reason[]) {
    const open = await tx.productFlag.findFirst({ where: { productId, status: 'open' } });
    if (!open) {
      await tx.productFlag.create({ data: { productId, source, reasons: reasons as unknown as Prisma.InputJsonValue } });
      return;
    }
    const known = (open.reasons as unknown as Reason[]) ?? [];
    const merged = [...known, ...reasons.filter((r) => !known.some((k) => k.code === r.code && k.message === r.message))];
    // reports, the AI and the backup standard outrank the rules as the flag's source
    await tx.productFlag.update({ where: { id: open.id }, data: { reasons: merged as unknown as Prisma.InputJsonValue, ...(open.source === 'rules' && source !== 'rules' && { source }) } });
  }

  private async tellShop(productId: number, status: ProductStatus, reasons: Reason[]) {
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { shopId: true, name: true } });
    if (!p) return;
    if (status === 'limited' || status === 'review') {
      const why = reasons.map((r) => r.message).join(' ') || 'An admin will check it.';
      await this.notifications.notify({
        targetRole: 'shop', targetId: p.shopId, type: 'warning',
        title: status === 'limited' ? 'Product shown lower in search' : 'Product waiting for review',
        message: `"${p.name}": ${why}`,
      });
    }
    this.live.emit({ userId: p.shopId, type: 'product', data: { productId, status, reasons } });
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma, ProductStatus } from '../generated/prisma/client.js';
import { LiveService } from '../notifications/live.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AiVerdict } from './ai-reviewer.js';
import { AiGate } from './ai-gate.js';
import { checkListing, type ListingInput, type Reason } from './rules.js';
import { ModerationSettings } from './settings.service.js';

type Db = Prisma.TransactionClient;
type FlagFrom = 'rules' | 'ai' | 'report' | 'fallback';

/** Categories with fewer approved products than this have no reliable median price. */
const MEDIAN_MIN_SAMPLE = 5;
/** AI verdicts severe enough to refuse a listing without waiting for an admin. */
const REJECT_CODES = ['prohibited', 'counterfeit'];

const json = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class ModerationService {
  /** Set by the worker; pokes it when a new job is queued. */
  kick: () => void = () => {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ModerationSettings,
    private readonly gate: AiGate,
    private readonly notifications: NotificationsService,
    private readonly live: LiveService,
  ) {}

  /** Runs the rules on a listing before it is saved. `excludeId` is the product being edited. */
  async precheck(shopId: number, input: ListingInput, excludeId?: number): Promise<{ block: Reason[]; flag: Reason[] }> {
    const [settings, keywords, siblings, median] = await Promise.all([
      this.settings.get(),
      this.prisma.bannedKeyword.findMany({ select: { phrase: true, severity: true } }),
      this.prisma.product.findMany({ where: { shopId, ...(excludeId && { id: { not: excludeId } }) }, select: { name: true } }),
      this.medianPrice(input.category, excludeId),
    ]);
    return checkListing(input, { keywords, medianPrice: median, siblingNames: siblings.map((s) => s.name), settings });
  }

  async medianPrice(category: string, excludeId?: number): Promise<number | undefined> {
    const [m] = await this.prisma.$queryRaw<{ median: number | null; n: number }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float AS median, count(*)::int AS n
      FROM "Product" WHERE category = ${category} AND "adminStatus" = 'approved' AND id <> ${excludeId ?? 0}`;
    return m && m.n >= MEDIAN_MIN_SAMPLE && m.median ? m.median : undefined;
  }

  /**
   * Decides a product the shop just saved (status `pending`) from the rule flags of its precheck.
   * With the AI switched on, the product waits in `pending` and the worker finishes the decision.
   * A product an admin suspended goes to `review` instead, so an edit never undoes an admin decision.
   */
  async decide(productId: number, flags: Reason[], previous: ProductStatus | null): Promise<void> {
    if (previous === 'suspended') {
      await this.prisma.$transaction(async (tx) => {
        await this.setStatus(tx, productId, 'review', flags);
        await this.openFlag(tx, productId, 'fallback', [{ code: 'edited_after_suspension', message: 'The shop edited a suspended product.' }, ...flags]);
      });
      await this.tellShop(productId, 'review', flags);
      return;
    }
    if ((await this.gate.state()) !== 'off') {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: productId }, data: { moderationReasons: json(flags), provisional: false } });
        await tx.moderationCheck.create({ data: { productId, layer: 'rules', outcome: flags.length ? 'suspect' : 'clean', reasons: json(flags) } });
        await tx.moderationJob.upsert({
          where: { productId },
          create: { productId, trigger: previous === null ? 'create' : 'edit' },
          update: { trigger: previous === null ? 'create' : 'edit', attempts: 0, nextAttemptAt: now, lockedUntil: null, firstQueuedAt: now },
        });
      });
      this.live.emit({ userId: (await this.shopOf(productId))!, type: 'product', data: { productId, status: 'pending', reasons: flags } });
      this.kick();
      return;
    }
    await this.prisma.moderationCheck.create({ data: { productId, layer: 'rules', outcome: flags.length ? 'suspect' : 'clean', reasons: json(flags) } });
    await this.finalize(productId, flags, null);
  }

  /**
   * Final status from the rule flags and, when there is one, the AI verdict.
   * An open flag raised by reports, the AI or the backup standard keeps the product demoted until an admin
   * decides; a flag raised by the rules alone closes once the listing passes.
   */
  async finalize(productId: number, ruleFlags: Reason[], ai: AiVerdict | null, provisional = false): Promise<ProductStatus> {
    const aiIssues = ai && ai.verdict !== 'clean' ? ai.reasons : [];
    const status = await this.prisma.$transaction(async (tx) => {
      await tx.moderationJob.deleteMany({ where: { productId } });
      if (ai?.verdict === 'severe' && ai.reasons.some((r) => REJECT_CODES.includes(r.code))) {
        await this.setStatus(tx, productId, 'rejected', [...ruleFlags, ...aiIssues]);
        await this.openFlag(tx, productId, 'ai', aiIssues);
        return 'rejected' as const;
      }
      const open = await tx.productFlag.findFirst({ where: { productId, status: 'open' } });
      const issues = [...ruleFlags, ...aiIssues];
      if (open && open.source === 'rules' && !issues.length) {
        await tx.productFlag.update({ where: { id: open.id }, data: { status: 'dismissed', note: 'Fixed by the shop', decidedBy: 'system', decidedAt: new Date() } });
      }
      const keepsFlag = !!open && open.source !== 'rules';
      const next: ProductStatus = issues.length || keepsFlag ? 'limited' : 'approved';
      await this.setStatus(tx, productId, next, issues, provisional && next === 'approved');
      if (aiIssues.length) await this.openFlag(tx, productId, 'ai', aiIssues);
      if (ruleFlags.length) await this.openFlag(tx, productId, 'rules', ruleFlags);
      return next;
    });
    await this.tellShop(productId, status, [...ruleFlags, ...aiIssues]);
    return status;
  }

  /** The backup standard gave up: the product waits for an admin. */
  async sendToReview(productId: number, ruleFlags: Reason[]): Promise<void> {
    const reason: Reason = { code: 'ai_unavailable', message: 'The automatic check was not available in time; an admin will review the listing.' };
    await this.prisma.$transaction(async (tx) => {
      await tx.moderationJob.deleteMany({ where: { productId } });
      await this.setStatus(tx, productId, 'review', [...ruleFlags, reason]);
      await this.openFlag(tx, productId, 'fallback', [reason, ...ruleFlags]);
      await tx.moderationCheck.create({ data: { productId, layer: 'fallback', outcome: 'review', reasons: json([reason]) } });
    });
    await this.tellShop(productId, 'review', [reason]);
  }

  /** Demotes a live product and opens (or extends) its flag; used by reports and AI rechecks. */
  async demote(productId: number, source: 'report' | 'ai' | 'fallback', reasons: Reason[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { id: productId, adminStatus: 'approved' }, data: { adminStatus: 'limited', rankPenalty: 1, provisional: false } });
      await this.openFlag(tx, productId, source, reasons);
    });
    await this.tellShop(productId, 'limited', reasons);
  }

  private setStatus(tx: Db, productId: number, status: ProductStatus, reasons: Reason[], provisional = false) {
    return tx.product.update({
      where: { id: productId },
      data: { adminStatus: status, rankPenalty: status === 'limited' ? 1 : 0, provisional, moderationReasons: json(reasons) },
    });
  }

  /** One open flag per product: a new source adds its reasons to the open one. */
  private async openFlag(tx: Db, productId: number, source: FlagFrom, reasons: Reason[]) {
    const open = await tx.productFlag.findFirst({ where: { productId, status: 'open' } });
    if (!open) {
      await tx.productFlag.create({ data: { productId, source, reasons: json(reasons) } });
      return;
    }
    const known = (open.reasons as unknown as Reason[]) ?? [];
    const merged = [...known, ...reasons.filter((r) => !known.some((k) => k.code === r.code && k.message === r.message))];
    // reports, the AI and the backup standard outrank the rules as the flag's source
    await tx.productFlag.update({ where: { id: open.id }, data: { reasons: json(merged), ...(open.source === 'rules' && source !== 'rules' && { source }) } });
  }

  private async shopOf(productId: number) {
    return (await this.prisma.product.findUnique({ where: { id: productId }, select: { shopId: true } }))?.shopId;
  }

  private async tellShop(productId: number, status: ProductStatus, reasons: Reason[]) {
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { shopId: true, name: true } });
    if (!p) return;
    const titles: Partial<Record<ProductStatus, string>> = {
      limited: 'Product shown lower in search',
      review: 'Product waiting for review',
      rejected: 'Product refused',
    };
    if (titles[status]) {
      await this.notifications.notify({
        targetRole: 'shop', targetId: p.shopId, type: 'warning', title: titles[status]!,
        message: `"${p.name}": ${reasons.map((r) => r.message).join(' ') || 'An admin will check it.'}`,
      });
    }
    this.live.emit({ userId: p.shopId, type: 'product', data: { productId, status, reasons } });
  }
}

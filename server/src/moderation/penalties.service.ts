import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AppealDto, AppealsQuery, DecideAppealDto } from './dto/moderation.dto.js';
import { ModerationSettings } from './settings.service.js';

type Db = Prisma.TransactionClient;
export type GuardedAction = 'createProduct' | 'editProduct' | 'createCoupon';

const VN_OFFSET_MS = 7 * 3_600_000;

/** The last moment of the quarter that `at` falls in, Vietnam time (UTC+7): 31 Mar, 30 Jun, 30 Sep or 31 Dec, 23:59:59.999. */
export function quarterEnd(at: Date): Date {
  const local = new Date(at.getTime() + VN_OFFSET_MS);
  const firstMonthOfNext = Math.floor(local.getUTCMonth() / 3) * 3 + 3;
  // midnight (UTC+7) on the first day of the next quarter, minus one millisecond
  return new Date(Date.UTC(local.getUTCFullYear(), firstMonthOfNext, 1) - VN_OFFSET_MS - 1);
}

@Injectable()
export class PenaltiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ModerationSettings,
    private readonly notifications: NotificationsService,
  ) {}

  /** Points that count today: not revoked by an appeal and not past their quarter. */
  async current(shopId: number, db: Db = this.prisma): Promise<number> {
    const r = await db.shopPenalty.aggregate({ where: { shopId, revokedAt: null, expiresAt: { gt: new Date() } }, _sum: { points: true } });
    return r._sum.points ?? 0;
  }

  /** Adds points inside the caller's transaction; reaching `suspendAt` suspends the shop. */
  async add(db: Db, shopId: number, points: number, reason: string, refs: { flagId?: number; productId?: number }, by: string): Promise<{ total: number; suspended: boolean }> {
    await db.shopPenalty.create({ data: { shopId, points, reason, ...refs, createdBy: by, expiresAt: quarterEnd(new Date()) } });
    const total = await this.current(shopId, db);
    const { suspendAt } = await this.settings.get();
    const suspended = total >= suspendAt;
    if (suspended) await db.user.updateMany({ where: { id: shopId, shopStatus: 'active' }, data: { shopStatus: 'suspended' } });
    return { total, suspended };
  }

  /** Tells the shop about a penalty, after the transaction that added it. */
  async announce(shopId: number, points: number, reason: string, result: { total: number; suspended: boolean }) {
    await this.notifications.notify({
      targetRole: 'shop', targetId: shopId, type: 'warning', title: `Penalty: ${points} point${points > 1 ? 's' : ''}`,
      message: `${reason} You now have ${result.total} penalty point${result.total === 1 ? '' : 's'} this quarter.` +
        (result.suspended ? ' Your shop is suspended until an admin reviews it.' : ' You can appeal from your penalty page.'),
    });
  }

  /** Refuses what a shop may not do at its current points (spec 3.8). */
  async assertCan(shopId: number, action: GuardedAction): Promise<void> {
    const [points, s] = await Promise.all([this.current(shopId), this.settings.get()]);
    if (action === 'createCoupon' && points >= s.noCouponsAt) {
      throw new ForbiddenException(`With ${points} penalty points you cannot create vouchers this quarter.`);
    }
    if ((action === 'createProduct' || action === 'editProduct') && points >= s.freezeAt) {
      const latest = await this.prisma.shopPenalty.findFirst({ where: { shopId, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      const until = latest && new Date(latest.createdAt.getTime() + s.freezeDays * 86_400_000);
      if (until && until > new Date()) {
        throw new ForbiddenException(`With ${points} penalty points you cannot add or edit products until ${until.toISOString().slice(0, 10)}.`);
      }
    }
    if (action === 'createProduct' && points >= s.capProductsAt) {
      const live = await this.prisma.product.count({ where: { shopId, adminStatus: { in: ['pending', 'approved', 'limited', 'review'] } } });
      if (live >= s.productLimit) throw new ForbiddenException(`With ${points} penalty points you can list at most ${s.productLimit} products.`);
    }
  }

  // ---- shop side

  async listForShop(shopId: number) {
    const items = await this.prisma.shopPenalty.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, include: { appeal: true } });
    const now = new Date();
    return {
      current: await this.current(shopId),
      items: items.map((p) => ({ ...p, counts: !p.revokedAt && p.expiresAt > now })),
    };
  }

  async appeal(shopId: number, penaltyId: number, dto: AppealDto) {
    const penalty = await this.prisma.shopPenalty.findFirst({ where: { id: penaltyId, shopId } });
    if (!penalty) throw new NotFoundException('Penalty not found');
    if (penalty.revokedAt) throw new ConflictException('This penalty was already removed');
    try {
      return await this.prisma.penaltyAppeal.create({ data: { penaltyId, message: dto.message.trim() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You already appealed this penalty');
      throw e;
    }
  }

  // ---- admin side

  listForAdmin(shopId: number) {
    return this.prisma.shopPenalty.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, include: { appeal: true } });
  }

  appeals(q: AppealsQuery) {
    return this.prisma.penaltyAppeal.findMany({
      where: { status: q.status ?? 'open' },
      orderBy: { createdAt: 'asc' },
      include: { penalty: { include: { shop: { select: { id: true, shopName: true } } } } },
    });
  }

  /** Accepting an appeal revokes the penalty; a suspended shop stays suspended until an admin restores it. */
  async decideAppeal(id: number, admin: string, dto: DecideAppealDto) {
    const appeal = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.penaltyAppeal.updateMany({
        where: { id, status: 'open' },
        data: { status: dto.accept ? 'accepted' : 'refused', note: dto.note.trim(), decidedBy: admin, decidedAt: new Date() },
      });
      if (!count) {
        if (await tx.penaltyAppeal.findUnique({ where: { id }, select: { id: true } })) throw new ConflictException('This appeal was already decided');
        throw new NotFoundException('Appeal not found');
      }
      const a = await tx.penaltyAppeal.findUniqueOrThrow({ where: { id }, include: { penalty: true } });
      if (dto.accept) await tx.shopPenalty.update({ where: { id: a.penaltyId }, data: { revokedAt: new Date(), revokeNote: dto.note.trim() } });
      return a;
    });
    await this.notifications.notify({
      targetRole: 'shop', targetId: appeal.penalty.shopId, type: dto.accept ? 'info' : 'warning',
      title: dto.accept ? 'Appeal accepted' : 'Appeal refused',
      message: dto.accept
        ? `The ${appeal.penalty.points}-point penalty was removed. ${dto.note.trim()}`
        : `The ${appeal.penalty.points}-point penalty stays. ${dto.note.trim()}`,
    });
    return { id, status: dto.accept ? 'accepted' : 'refused' };
  }
}

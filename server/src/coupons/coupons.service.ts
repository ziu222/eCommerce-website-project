import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toCents } from '../common/money.js';
import { Prisma, type Coupon } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminCreateCouponDto, AdminUpdateCouponDto, CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto.js';

export interface ShopSubtotal {
  shopId: number;
  subtotalCents: number;
}

export interface CouponEvaluation {
  coupon: Coupon;
  applicableCents: number;
  discountCents: number;
  /** discount per shop order, in cents; sums to discountCents */
  perShop: Map<number, number>;
}

export interface CouponDto {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder: number;
  usageLimit: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  shopId: number | null;
  shop?: { id: number; shopName: string };
  createdAt: Date;
}

type WithShop = Coupon & { shop?: { id: number; shopName: string | null } | null };
const WITH_SHOP = { shop: { select: { id: true, shopName: true } } } as const;

/** Splits a discount across shop orders in proportion to their subtotals; leftover cents go to the biggest shops first. */
export function allocateDiscount(discountCents: number, groups: ShopSubtotal[]): Map<number, number> {
  const total = groups.reduce((s, g) => s + g.subtotalCents, 0);
  const out = new Map<number, number>();
  let assigned = 0;
  for (const g of groups) {
    const share = total ? Math.floor((discountCents * g.subtotalCents) / total) : 0;
    out.set(g.shopId, share);
    assigned += share;
  }
  const biggestFirst = [...groups].sort((a, b) => b.subtotalCents - a.subtotalCents || a.shopId - b.shopId);
  for (let i = 0; assigned < discountCents; i = (i + 1) % biggestFirst.length) {
    const id = biggestFirst[i].shopId;
    out.set(id, out.get(id)! + 1);
    assigned++;
  }
  return out;
}

export function toCouponDto(c: WithShop): CouponDto {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: Number(c.value),
    minOrder: Number(c.minOrder),
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : null,
    isActive: c.isActive,
    shopId: c.shopId,
    ...(c.shop && { shop: { id: c.shop.id, shopName: c.shop.shopName ?? '' } }),
    createdAt: c.createdAt,
  };
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- checkout side

  /** Works out the discount for a cart grouped by shop. Throws 400 with a human-readable reason when the coupon cannot apply. */
  async evaluate(db: Prisma.TransactionClient, rawCode: string, groups: ShopSubtotal[]): Promise<CouponEvaluation> {
    const coupon = await db.coupon.findUnique({ where: { code: rawCode.trim().toUpperCase() } });
    if (!coupon) throw new BadRequestException('Invalid coupon code');
    if (!coupon.isActive) throw new BadRequestException('Coupon is inactive');
    const today = new Date().toISOString().slice(0, 10);
    if (coupon.expiresAt && today > coupon.expiresAt.toISOString().slice(0, 10)) throw new BadRequestException('Coupon has expired');
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw new BadRequestException('Coupon usage limit reached');

    const scope = coupon.shopId === null ? groups : groups.filter((g) => g.shopId === coupon.shopId);
    if (!scope.length) throw new BadRequestException('No items from this shop in your cart');
    const applicableCents = scope.reduce((s, g) => s + g.subtotalCents, 0);

    const minOrder = Number(coupon.minOrder);
    if (minOrder > 0 && applicableCents < toCents(minOrder)) throw new BadRequestException(`Minimum order $${minOrder} required`);

    const value = Number(coupon.value);
    const discountCents =
      coupon.type === 'percent' ? Math.round((applicableCents * value) / 100) : Math.min(toCents(value), applicableCents);

    const perShop = allocateDiscount(discountCents, scope);
    for (const g of groups) if (!perShop.has(g.shopId)) perShop.set(g.shopId, 0);
    return { coupon, applicableCents, discountCents, perShop };
  }

  /** Counts one use. The conditional update is what stops two checkouts from taking the last use. */
  async consume(tx: Prisma.TransactionClient, couponId: number): Promise<void> {
    const rows = await tx.$queryRaw<{ id: number }[]>`
      UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
      WHERE id = ${couponId} AND ("usageLimit" = 0 OR "usedCount" < "usageLimit")
      RETURNING id`;
    if (!rows.length) throw new ConflictException('Coupon usage limit reached');
  }

  // ---- management

  async listForShop(shopId: number): Promise<CouponDto[]> {
    const rows = await this.prisma.coupon.findMany({ where: { shopId }, orderBy: { id: 'asc' } });
    return rows.map(toCouponDto);
  }

  async listAll(): Promise<CouponDto[]> {
    const rows = await this.prisma.coupon.findMany({ orderBy: { id: 'asc' }, include: WITH_SHOP });
    return rows.map(toCouponDto);
  }

  private data(dto: Partial<CreateCouponDto>) {
    if (dto.type === 'percent' && dto.value !== undefined && dto.value > 100) {
      throw new BadRequestException('A percent coupon cannot exceed 100');
    }
    const { expiresAt, ...rest } = dto;
    return {
      ...rest,
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00.000Z`) : null }),
    };
  }

  /** `scope` is the shop id for a shop's own coupons, or undefined when an admin manages any coupon. */
  async create(dto: CreateCouponDto | AdminCreateCouponDto, forcedShopId?: number): Promise<CouponDto> {
    const shopId = forcedShopId ?? (dto as AdminCreateCouponDto).shopId ?? null;
    if (shopId !== null) await this.assertShop(shopId);
    const created = await this.guardDuplicate(() =>
      this.prisma.coupon.create({ data: { ...this.data(dto), shopId } as Prisma.CouponUncheckedCreateInput, include: WITH_SHOP }),
    );
    return toCouponDto(created);
  }

  async update(id: number, dto: UpdateCouponDto | AdminUpdateCouponDto, ownerShopId?: number): Promise<CouponDto> {
    await this.findManaged(id, ownerShopId);
    const shopId = (dto as AdminUpdateCouponDto).shopId;
    if (shopId) await this.assertShop(shopId);
    // Bound to its current shop for shop owners: the shop DTO has no shopId field at all.
    const updated = await this.guardDuplicate(() =>
      this.prisma.coupon.update({ where: { id }, data: this.data(dto) as Prisma.CouponUncheckedUpdateInput, include: WITH_SHOP }),
    );
    return toCouponDto(updated);
  }

  async remove(id: number, ownerShopId?: number): Promise<void> {
    await this.findManaged(id, ownerShopId);
    await this.prisma.coupon.delete({ where: { id } });
  }

  private async findManaged(id: number, ownerShopId?: number) {
    const row = await this.prisma.coupon.findFirst({ where: { id, ...(ownerShopId !== undefined && { shopId: ownerShopId }) } });
    if (!row) throw new NotFoundException('Coupon not found');
    return row;
  }

  private async assertShop(shopId: number) {
    const shop = await this.prisma.user.findFirst({ where: { id: shopId, role: 'shop' }, select: { id: true } });
    if (!shop) throw new BadRequestException('shopId must be an existing shop');
  }

  private async guardDuplicate<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Coupon code already exists');
      throw e;
    }
  }
}


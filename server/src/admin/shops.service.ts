import { Injectable, NotFoundException } from '@nestjs/common';
import { toCents } from '../common/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ShopStatusDto, UpdateShopDto } from './dto/admin.dto.js';
import { toUserSummary } from './users.service.js';

@Injectable()
export class AdminShopsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Revenue and order counts per shop. Cancelled orders do not count, matching the old dashboard. */
  private async totals(shopId?: number) {
    const rows = await this.prisma.order.groupBy({
      by: ['shopId'],
      where: { status: { not: 'cancelled' }, ...(shopId && { shopId }) },
      _sum: { total: true },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.shopId, { revenue: toCents(r._sum.total ?? 0) / 100, orders: r._count._all }]));
  }

  async list() {
    const [shops, totals] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'shop' }, orderBy: { id: 'asc' }, include: { _count: { select: { products: true } } } }),
      this.totals(),
    ]);
    return shops.map((s) => ({ ...toUserSummary(s), productCount: s._count.products, revenue: totals.get(s.id)?.revenue ?? 0 }));
  }

  async detail(id: number) {
    const shop = await this.shopOrThrow(id);
    const [products, totals, orderCount] = await Promise.all([
      this.prisma.product.findMany({ where: { shopId: id }, orderBy: { id: 'asc' }, select: { id: true, name: true, category: true, price: true, stock: true, adminStatus: true } }),
      this.totals(id),
      this.prisma.order.count({ where: { shopId: id } }),
    ]);
    return {
      ...toUserSummary(shop),
      orderCount,
      revenue: totals.get(id)?.revenue ?? 0,
      products: products.map((p) => ({ ...p, price: Number(p.price) })),
    };
  }

  async update(id: number, dto: UpdateShopDto) {
    await this.shopOrThrow(id);
    return toUserSummary(await this.prisma.user.update({ where: { id }, data: dto }));
  }

  async setStatus(id: number, dto: ShopStatusDto) {
    await this.shopOrThrow(id);
    return toUserSummary(await this.prisma.user.update({ where: { id }, data: { shopStatus: dto.shopStatus } }));
  }

  private async shopOrThrow(id: number) {
    const shop = await this.prisma.user.findFirst({ where: { id, role: 'shop' } });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }
}

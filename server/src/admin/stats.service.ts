import { Injectable } from '@nestjs/common';
import { toCents } from '../common/money.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FinanceQuery } from './dto/admin.dto.js';

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;
const dollars = (value: { toString(): string } | null | undefined) => toCents(value ?? 0) / 100;

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the overview and reports tabs show. Revenue is every order that is not cancelled. */
  async dashboard() {
    const notCancelled: Prisma.OrderWhereInput = { status: { not: 'cancelled' } };
    const [shops, products, orders, customers, revenue, statuses, sold, categories, recent] = await Promise.all([
      this.prisma.user.count({ where: { role: 'shop' } }),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.user.count({ where: { role: 'customer' } }),
      this.prisma.order.aggregate({ where: notCancelled, _sum: { total: true } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: notCancelled },
        _sum: { qty: true },
        orderBy: [{ _sum: { qty: 'desc' } }, { productId: 'asc' }],
        take: 5,
      }),
      this.prisma.product.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } }),
      this.prisma.order.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        include: { customer: { select: { name: true } }, shop: { select: { shopName: true } } },
      }),
    ]);

    const topProducts = await this.prisma.product.findMany({
      where: { id: { in: sold.map((s) => s.productId) } },
      select: { id: true, name: true, category: true },
    });
    const byId = new Map(topProducts.map((p) => [p.id, p]));

    return {
      shops,
      products,
      orders,
      customers,
      revenue: dollars(revenue._sum.total),
      statusCounts: Object.fromEntries(ORDER_STATUSES.map((s) => [s, statuses.find((r) => r.status === s)?._count._all ?? 0])),
      topProducts: sold.map((s) => ({ product: byId.get(s.productId)!, sold: s._sum.qty ?? 0 })),
      categoryCounts: Object.fromEntries(categories.map((c) => [c.category, c._count._all])),
      recentOrders: recent.map((o) => ({
        id: o.id,
        total: Number(o.total),
        status: o.status,
        createdAt: o.createdAt,
        customer: o.customer,
        shop: o.shop,
      })),
    };
  }

  /** Finance only counts delivered orders, optionally for one shop and a date range. */
  async finance(q: FinanceQuery) {
    const where: Prisma.OrderWhereInput = {
      status: 'delivered',
      ...(q.shopId && { shopId: q.shopId }),
      ...((q.dateFrom || q.dateTo) && {
        createdAt: { ...(q.dateFrom && { gte: new Date(q.dateFrom) }), ...(q.dateTo && { lte: new Date(q.dateTo) }) },
      }),
    };
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      include: {
        customer: { select: { name: true } },
        shop: { select: { id: true, shopName: true, shopStatus: true } },
        _count: { select: { items: true } },
      },
    });

    const totalCents = orders.reduce((s, o) => s + toCents(o.total), 0);
    const perShop = new Map<number, { shopId: number; shopName: string; orderCount: number; revenueCents: number }>();
    for (const o of orders) {
      const row = perShop.get(o.shopId) ?? { shopId: o.shopId, shopName: o.shop.shopName ?? `Shop #${o.shopId}`, orderCount: 0, revenueCents: 0 };
      row.orderCount++;
      row.revenueCents += toCents(o.total);
      perShop.set(o.shopId, row);
    }

    return {
      summary: {
        totalRevenue: totalCents / 100,
        paidOrders: orders.length,
        avgOrderValue: orders.length ? Math.round(totalCents / 100 / orders.length) : 0,
        activeShops: new Set(orders.filter((o) => o.shop.shopStatus === 'active').map((o) => o.shopId)).size,
      },
      revenueByShop: [...perShop.values()]
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .map((r) => ({
          shopId: r.shopId,
          shopName: r.shopName,
          orderCount: r.orderCount,
          revenue: r.revenueCents / 100,
          percentage: totalCents ? Math.round((r.revenueCents / totalCents) * 1000) / 10 : 0,
        })),
      transactions: orders.map((o) => ({
        id: o.id,
        customer: o.customer,
        shop: { id: o.shop.id, shopName: o.shop.shopName },
        itemCount: o._count.items,
        total: Number(o.total),
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
  }
}

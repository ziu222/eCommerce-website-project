import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { centsToString, toCents } from '../common/money.js';
import { CouponsService } from '../coupons/coupons.service.js';
import type { Order, OrderStatus, Prisma } from '../generated/prisma/client.js';
import { LiveService } from '../notifications/live.service.js';
import { NotificationsService, type SystemNotification } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressLine } from '../users/account.service.js';
import { ProductsService } from '../products/products.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { AdminOrdersQuery, CheckoutDto } from './dto/order.dto.js';

type Role = 'customer' | 'shop' | 'admin';
type Actor = { role: Role; id: number };

const INCLUDE = {
  items: { include: { product: { select: { name: true, imageUrl: true } } }, orderBy: { id: 'asc' } },
  history: { orderBy: { id: 'asc' } },
  customer: { select: { id: true, name: true, email: true } },
  shop: { select: { id: true, shopName: true } },
} as const satisfies Prisma.OrderInclude;

type FullOrder = Prisma.OrderGetPayload<{ include: typeof INCLUDE }>;

// Who may move an order from one status to which. delivered and cancelled are final.
const TRANSITIONS: Record<Role, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  customer: { pending: ['cancelled'] },
  shop: { pending: ['confirmed', 'cancelled'], confirmed: ['shipped'], shipped: ['delivered'] },
  admin: { pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered', 'cancelled'] },
};

export function toOrderDto(o: FullOrder) {
  return {
    id: o.id,
    customerId: o.customerId,
    customer: o.customer,
    shopId: o.shopId,
    shop: { id: o.shop.id, shopName: o.shop.shopName ?? '' },
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    total: Number(o.total),
    couponCode: o.couponCode,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    shipping: o.shipAddress ? { name: o.shipName, phone: o.shipPhone, address: o.shipAddress } : null,
    createdAt: o.createdAt,
    items: o.items.map((i) => ({
      productId: i.productId,
      name: i.product.name,
      imageUrl: i.product.imageUrl,
      qty: i.qty,
      price: Number(i.price),
    })),
    statusHistory: o.history.map((h) => ({ status: h.status, changedBy: h.changedBy, changedAt: h.changedAt })),
  };
}

const ORDER_NOTICE: Partial<Record<OrderStatus, { title: string; message: string; type: 'info' | 'warning' }>> = {
  confirmed: { title: 'Order confirmed', message: 'The seller confirmed your order #{id} and is preparing it.', type: 'info' },
  shipped: { title: 'Order on its way', message: 'Your order #{id} has been shipped.', type: 'info' },
  delivered: { title: 'Order delivered', message: 'Your order #{id} was delivered. Enjoy!', type: 'info' },
  cancelled: { title: 'Order cancelled', message: 'Your order #{id} was cancelled. Any wallet payment has been refunded.', type: 'warning' },
};

function orderNotice(customerId: number, orderId: number, status: OrderStatus): SystemNotification {
  const n = ORDER_NOTICE[status] ?? { title: 'Order updated', message: 'Your order #{id} changed to ' + status + '.', type: 'info' as const };
  return { targetRole: 'customer', targetId: customerId, type: n.type, title: n.title, message: n.message.replace('{id}', String(orderId)) };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly coupons: CouponsService,
    private readonly notifications: NotificationsService,
    private readonly wallet: WalletService,
    private readonly live: LiveService,
  ) {}

  /**
   * One order per shop, all in one transaction: stock, coupon use and wallet debit either all happen or none do.
   * Prices, discounts and totals are computed here from the database; the client only names products and quantities.
   */
  async checkout(customerId: number, dto: CheckoutDto) {
    const orders = await this.prisma.$transaction(
      async (tx) => {
        let ship: { shipName: string; shipPhone: string; shipAddress: string } | null = null;
        if (dto.addressId) {
          const a = await tx.address.findFirst({ where: { id: dto.addressId, userId: customerId } });
          if (!a) throw new NotFoundException('Address not found');
          ship = { shipName: a.recipient, shipPhone: a.phone, shipAddress: addressLine(a) };
        }
        const lines = await this.products.priceLines(tx, dto.items, true);
        for (const l of lines) {
          if (l.stock < l.qty) throw new ConflictException(`Not enough stock for ${l.name}`);
        }

        const subtotals = new Map<number, number>();
        for (const l of lines) subtotals.set(l.shopId, (subtotals.get(l.shopId) ?? 0) + l.unitCents * l.qty);
        const groups = [...subtotals].map(([shopId, subtotalCents]) => ({ shopId, subtotalCents })).sort((a, b) => a.shopId - b.shopId);

        let discounts = new Map<number, number>();
        let couponCode: string | null = null;
        if (dto.couponCode) {
          const applied = await this.coupons.evaluate(tx, dto.couponCode, groups);
          await this.coupons.consume(tx, applied.coupon.id);
          discounts = applied.perShop;
          couponCode = applied.coupon.code;
        }

        const created: number[] = [];
        for (const g of groups) {
          const discount = discounts.get(g.shopId) ?? 0;
          const totalCents = g.subtotalCents - discount;
          const order = await tx.order.create({
            data: {
              customerId,
              shopId: g.shopId,
              subtotal: centsToString(g.subtotalCents),
              discount: centsToString(discount),
              total: centsToString(totalCents),
              couponCode: discount > 0 ? couponCode : null,
              paymentMethod: dto.paymentMethod,
              paymentStatus: dto.paymentMethod === 'wallet' ? 'paid' : 'pending',
              ...ship,
              items: {
                create: lines
                  .filter((l) => l.shopId === g.shopId)
                  .map((l) => ({ productId: l.productId, qty: l.qty, price: centsToString(l.unitCents) })),
              },
              history: { create: [{ status: 'pending', changedBy: 'customer' }] },
            },
          });
          created.push(order.id);
          if (dto.paymentMethod === 'wallet' && totalCents > 0) await this.wallet.debit(tx, customerId, totalCents, order.id);
        }

        for (const l of lines) await tx.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.qty } } });
        return tx.order.findMany({ where: { id: { in: created } }, include: INCLUDE, orderBy: { shopId: 'asc' } });
      },
      { timeout: 20000 },
    );

    return { orders: orders.map(toOrderDto), total: orders.reduce((s, o) => s + toCents(o.total), 0) / 100 };
  }

  async listForCustomer(customerId: number) {
    return (await this.prisma.order.findMany({ where: { customerId }, include: INCLUDE, orderBy: { id: 'desc' } })).map(toOrderDto);
  }

  async getForCustomer(customerId: number, id: number) {
    const order = await this.prisma.order.findFirst({ where: { id, customerId }, include: INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    return toOrderDto(order);
  }

  async listForShop(shopId: number) {
    return (await this.prisma.order.findMany({ where: { shopId }, include: INCLUDE, orderBy: { id: 'desc' } })).map(toOrderDto);
  }

  async listForAdmin(q: AdminOrdersQuery) {
    const where: Prisma.OrderWhereInput = { ...(q.status && { status: q.status }), ...(q.shopId && { shopId: q.shopId }) };
    return (await this.prisma.order.findMany({ where, include: INCLUDE, orderBy: { id: 'desc' }, take: q.limit })).map(toOrderDto);
  }

  /** Customers and shops only reach their own orders; anything else is a 404, not a 403. */
  async changeStatus(actor: Actor, orderId: number, to: OrderStatus) {
    const parties = await this.prisma.$transaction(async (tx) => {
      const scope: Prisma.OrderWhereInput = actor.role === 'customer' ? { customerId: actor.id } : actor.role === 'shop' ? { shopId: actor.id } : {};
      const order = await tx.order.findFirst({ where: { id: orderId, ...scope }, include: { items: true } });
      if (!order) throw new NotFoundException('Order not found');

      if (!TRANSITIONS[actor.role][order.status]?.includes(to)) {
        throw new ConflictException(`Cannot change an order from ${order.status} to ${to}`);
      }
      // The status in the WHERE makes this atomic: of two racing changes only one matches.
      const moved = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: to } });
      if (!moved.count) throw new ConflictException('Order was changed by someone else');
      await tx.orderStatusHistory.create({ data: { orderId, status: to, changedBy: actor.role } });

      if (to === 'cancelled') await this.cancelEffects(tx, order);
      // the customer hears about changes made by the shop or an admin
      if (actor.role !== 'customer') await this.notifications.notify(orderNotice(order.customerId, orderId, to), tx);
      if (to === 'delivered' && order.paymentMethod === 'cod') {
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'paid' } });
      }
      return [order.customerId, order.shopId];
    });
    // only after the commit, so a page that reloads on the event already reads the new status;
    // whoever made the change already sees it
    for (const userId of parties) if (userId !== actor.id) this.live.emit({ userId, type: 'order', data: { orderId, status: to } });
    return toOrderDto(await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: INCLUDE }));
  }

  /** Cancelling gives the stock back and refunds a wallet payment. */
  private async cancelEffects(tx: Prisma.TransactionClient, order: Order & { items: { productId: number; qty: number }[] }) {
    for (const i of [...order.items].sort((a, b) => a.productId - b.productId)) {
      await tx.product.update({ where: { id: i.productId }, data: { stock: { increment: i.qty } } });
    }
    if (order.paymentMethod === 'wallet' && order.paymentStatus === 'paid') {
      await this.wallet.credit(tx, order.customerId, toCents(order.total), 'refund', order.id);
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'refunded' } });
    }
  }
}


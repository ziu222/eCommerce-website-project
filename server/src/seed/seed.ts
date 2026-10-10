import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import type { PrismaClient } from '../generated/prisma/client.js';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'prisma/seed-data', name), 'utf8')) as T;

const LEGACY_PRODUCT_COUNT = 28;

// Idempotent: every row is upserted by id, existing rows are left as they are.
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const users = load<any[]>('users.json');
  const legacy = load<any[]>('products.legacy.json');
  const modern = load<any[]>('products.modern.json');
  const orders = load<any[]>('orders.json');
  const coupons = load<any[]>('coupons.json');
  const notifications = load<any[]>('notifications.json');

  for (const u of users) {
    const { password, walletBalance, createdAt, ...rest } = u;
    const data = { ...rest, walletBalance: walletBalance ?? 0, createdAt: new Date(createdAt) };
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...data, passwordHash: await argon2.hash(password) },
    });
  }

  const products = [
    ...legacy,
    ...modern.map((p, i) => ({ ...p, id: LEGACY_PRODUCT_COUNT + i + 1, adminStatus: 'approved' })),
  ];
  for (const p of products) {
    const { createdAt, ...rest } = p;
    const reviewed = rest.adminStatus !== 'pending';
    const data = {
      ...rest,
      createdAt: new Date(createdAt),
      reviewedBy: reviewed ? 'seed' : null,
      reviewedAt: reviewed ? new Date(createdAt) : null,
    };
    await prisma.product.upsert({ where: { id: p.id }, update: {}, create: data });
  }

  for (const o of orders) {
    const { items, createdAt, ...rest } = o;
    await prisma.order.upsert({
      where: { id: o.id },
      update: {},
      create: {
        ...rest,
        createdAt: new Date(createdAt),
        items: { create: items.map((i: any) => ({ productId: i.productId, qty: i.qty, price: i.price })) },
        history: { create: [{ status: o.status, changedBy: 'seed', changedAt: new Date(createdAt) }] },
      },
    });
  }

  for (const c of coupons) {
    const { expiresAt, createdAt, ...rest } = c;
    await prisma.coupon.upsert({
      where: { id: c.id },
      update: {},
      create: { ...rest, expiresAt: new Date(expiresAt), createdAt: new Date(createdAt) },
    });
  }

  for (const n of notifications) {
    const { readBy, createdAt, ...rest } = n;
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {},
      create: {
        ...rest,
        createdAt: new Date(createdAt),
        reads: { create: readBy.map((userId: number) => ({ userId })) },
      },
    });
  }

  // Explicit ids were inserted, so move each serial past the highest seeded id.
  for (const table of ['User', 'Product', 'Order', 'Coupon', 'Notification']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
    );
  }
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'prisma/seed-data', name), 'utf8')) as T;

interface U { id: number; role: string; password: string; shopStatus?: string; adminRole?: string }
interface P { id: number; shopId: number; category: string; adminStatus: string }
interface O { id: number; customerId: number; shopId: number; items: { productId: number }[] }
interface C { code: string; shopId: number | null }
interface N { id: number; targetRole: string; targetId: number | null }

describe('legacy seed fixtures', () => {
  const users = load<U[]>('users.json');
  const products = load<P[]>('products.legacy.json');
  const orders = load<O[]>('orders.json');
  const coupons = load<C[]>('coupons.json');
  const notifications = load<N[]>('notifications.json');
  const shopIds = new Set(users.filter((u) => u.role === 'shop').map((u) => u.id));

  it('keeps the 28 legacy products with ids 1..28', () => {
    expect(products.map((p) => p.id)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it('defaults a missing product status to approved and keeps rejected ones', () => {
    expect(products.find((p) => p.id === 4)?.adminStatus).toBe('approved');
    expect(products.find((p) => p.id === 12)?.adminStatus).toBe('rejected');
  });

  it('points every product, order and shop coupon at a real shop user', () => {
    expect(products.every((p) => shopIds.has(p.shopId))).toBe(true);
    expect(orders.every((o) => shopIds.has(o.shopId))).toBe(true);
    expect(coupons.every((c) => c.shopId === null || shopIds.has(c.shopId))).toBe(true);
  });

  it('only orders products that exist, from customers that exist', () => {
    const productIds = new Set(products.map((p) => p.id));
    const customerIds = new Set(users.filter((u) => u.role === 'customer').map((u) => u.id));
    expect(orders.every((o) => o.items.every((i) => productIds.has(i.productId)))).toBe(true);
    expect(orders.every((o) => customerIds.has(o.customerId))).toBe(true);
  });

  it('uses the shop statuses and admin roles the schema knows', () => {
    expect(users.filter((u) => u.role === 'shop').every((u) => ['pending', 'active', 'suspended'].includes(u.shopStatus!))).toBe(true);
    expect(users.filter((u) => u.role === 'admin').every((u) => ['super_admin', 'pm', 'ba', 'hr', 'staff'].includes(u.adminRole!))).toBe(true);
  });

  it('has no notification with the string "all" as a target', () => {
    expect(notifications.every((n) => n.targetId === null || typeof n.targetId === 'number')).toBe(true);
  });
});

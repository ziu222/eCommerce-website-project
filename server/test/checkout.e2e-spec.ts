import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { CouponsModule } from '../src/coupons/coupons.module.js';
import { OrdersModule } from '../src/orders/orders.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';
import { WalletModule } from '../src/wallet/wallet.module.js';

describe('checkout', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const buyer = (name: 'nguyenvana' | 'tranthib' | 'levanc') => login(name, 'user123'); // ids 2, 3, 4

  // Fresh products per test so stock assertions stay independent: A is Apple's (shop 5), B is Samsung's (shop 6).
  let A: number, B: number;
  async function product(shopId: number, price: string, stock: number, extra: Record<string, unknown> = {}) {
    return (await prisma.product.create({
      data: { shopId, name: `Test ${shopId}-${Math.random().toString(36).slice(2, 7)}`, price, imageUrl: 'x.png', category: 'audio', stock, adminStatus: 'approved', ...extra },
    })).id;
  }
  const stockOf = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const balanceOf = async (id: number) => Number((await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalance);
  const orderCount = () => prisma.order.count();
  const checkout = (agent: ReturnType<typeof request.agent>, body: Record<string, unknown>) => agent.post('/api/orders/checkout').send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ProductsModule, WalletModule, CouponsModule, OrdersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
    await prisma.coupon.deleteMany();
  }, 120000);

  beforeEach(async () => {
    A = await product(5, '100.00', 5);
    B = await product(6, '50.50', 10);
    await prisma.user.updateMany({ where: { id: { in: [2, 3, 4] } }, data: { walletBalance: 1000 } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('splits a mixed cart into one order per shop with prices from the database', async () => {
    const agent = await buyer('nguyenvana');
    const res = await checkout(agent, { paymentMethod: 'cod', items: [{ productId: A, qty: 2 }, { productId: B, qty: 3 }] }).expect(201);
    expect(res.body.orders).toHaveLength(2);
    const [shop5, shop6] = res.body.orders;
    expect(shop5).toMatchObject({ shopId: 5, subtotal: 200, discount: 0, total: 200, status: 'pending', paymentMethod: 'cod', paymentStatus: 'pending', customerId: 2 });
    expect(shop6).toMatchObject({ shopId: 6, total: 151.5 });
    expect(shop5.items[0]).toMatchObject({ productId: A, qty: 2, price: 100 });
    expect(shop5.statusHistory).toHaveLength(1);
    expect(res.body.total).toBe(351.5);
    expect(await stockOf(A)).toBe(3);
    expect(await stockOf(B)).toBe(7);
  });

  it('merges repeated lines and refuses any client-supplied money field', async () => {
    const agent = await buyer('nguyenvana');
    const merged = await checkout(agent, { paymentMethod: 'cod', items: [{ productId: A, qty: 1 }, { productId: A, qty: 2 }] }).expect(201);
    expect(merged.body.orders[0].items).toEqual([expect.objectContaining({ productId: A, qty: 3, price: 100 })]);
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: B, qty: 1, price: 1 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', total: 1, items: [{ productId: B, qty: 1 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', discount: 999, items: [{ productId: B, qty: 1 }] }).expect(400);
  });

  it('rejects empty carts, bad quantities and unknown payment methods', async () => {
    const agent = await buyer('nguyenvana');
    const before = await orderCount();
    await checkout(agent, { paymentMethod: 'cod', items: [] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: A, qty: 0 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: A, qty: -2 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: A, qty: 1.5 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'bitcoin', items: [{ productId: A, qty: 1 }] }).expect(400);
    await checkout(agent, { items: [{ productId: A, qty: 1 }] }).expect(400);
    expect(await orderCount()).toBe(before);
  });

  it('is for customers only', async () => {
    const body = { paymentMethod: 'cod', items: [{ productId: A, qty: 1 }] };
    await request(server()).post('/api/orders/checkout').send(body).expect(401);
    await checkout(await login('apple', 'shop123'), body).expect(403);
    await checkout(await login('admin1', '123'), body).expect(403);
  });

  it('refuses unavailable products and over-ordering, leaving stock untouched', async () => {
    const agent = await buyer('nguyenvana');
    const pending = await product(5, '10', 5, { adminStatus: 'pending' });
    const ghost = await product(11, '10', 5); // shop 11 is not active
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: pending, qty: 1 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: ghost, qty: 1 }] }).expect(400);
    await checkout(agent, { paymentMethod: 'cod', items: [{ productId: 12, qty: 1 }] }).expect(400); // rejected product
    const tooMany = await checkout(agent, { paymentMethod: 'cod', items: [{ productId: B, qty: 99 }] }).expect(409);
    expect(tooMany.body.message).toContain('Not enough stock');
    expect(await stockOf(B)).toBe(10);
  });

  it('pays from the wallet: one ledger line per order, order marked paid', async () => {
    const agent = await buyer('nguyenvana');
    const res = await checkout(agent, { paymentMethod: 'wallet', items: [{ productId: A, qty: 1 }, { productId: B, qty: 2 }] }).expect(201);
    expect(res.body.orders.every((o: { paymentStatus: string }) => o.paymentStatus === 'paid')).toBe(true);
    expect(await balanceOf(2)).toBe(1000 - 100 - 101);
    const ledger = await prisma.walletTransaction.findMany({ where: { userId: 2, type: 'payment' }, orderBy: { id: 'asc' } });
    expect(ledger.map((t) => [t.orderId, Number(t.amount)])).toEqual(res.body.orders.map((o: { id: number; total: number }) => [o.id, o.total]));
    expect(Number(ledger[1].balanceAfter)).toBe(799);
  });

  it('rolls everything back when the wallet is too low', async () => {
    await prisma.user.update({ where: { id: 3 }, data: { walletBalance: 120 } });
    const agent = await buyer('tranthib');
    const before = await orderCount();
    // order for shop 5 (100) would fit, the shop 6 order (101) would not
    await checkout(agent, { paymentMethod: 'wallet', items: [{ productId: A, qty: 1 }, { productId: B, qty: 2 }] }).expect(409);
    expect(await orderCount()).toBe(before);
    expect(await balanceOf(3)).toBe(120);
    expect(await stockOf(A)).toBe(5);
    expect(await stockOf(B)).toBe(10);
  });

  describe('coupons', () => {
    const tomorrow = new Date(Date.now() + 86400000);
    const makeCoupon = (data: Record<string, unknown>) =>
      prisma.coupon.create({ data: { type: 'percent', value: '10', usageLimit: 0, isActive: true, expiresAt: tomorrow, ...data } as never });

    it('shares a global discount between the shop orders and counts one use', async () => {
      const coupon = await makeCoupon({ code: 'ALLSHOPS', value: '10' });
      const agent = await buyer('nguyenvana');
      const res = await checkout(agent, { paymentMethod: 'cod', couponCode: 'allshops', items: [{ productId: A, qty: 2 }, { productId: B, qty: 3 }] }).expect(201);
      const [o5, o6] = res.body.orders;
      expect(o5).toMatchObject({ subtotal: 200, discount: 20, total: 180, couponCode: 'ALLSHOPS' });
      expect(o6).toMatchObject({ subtotal: 151.5, discount: 15.15, total: 136.35 });
      expect(res.body.total).toBe(316.35);
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
    });

    it('applies a shop coupon only to that shop\'s order', async () => {
      await makeCoupon({ code: 'ONLY5', shopId: 5, value: '25' });
      const agent = await buyer('nguyenvana');
      const res = await checkout(agent, { paymentMethod: 'cod', couponCode: 'ONLY5', items: [{ productId: A, qty: 2 }, { productId: B, qty: 1 }] }).expect(201);
      expect(res.body.orders.find((o: { shopId: number }) => o.shopId === 5)).toMatchObject({ discount: 50, total: 150 });
      expect(res.body.orders.find((o: { shopId: number }) => o.shopId === 6)).toMatchObject({ discount: 0, total: 50.5, couponCode: null });
    });

    it('charges the discounted amount to the wallet', async () => {
      await makeCoupon({ code: 'WALLETDEAL', type: 'fixed', value: '30' });
      const agent = await buyer('nguyenvana');
      const res = await checkout(agent, { paymentMethod: 'wallet', couponCode: 'WALLETDEAL', items: [{ productId: A, qty: 1 }] }).expect(201);
      expect(res.body.total).toBe(70);
      expect(await balanceOf(2)).toBe(930);
    });

    it('creates nothing when the coupon is unusable', async () => {
      await makeCoupon({ code: 'DEAD', isActive: false });
      const agent = await buyer('nguyenvana');
      const before = await orderCount();
      const res = await checkout(agent, { paymentMethod: 'cod', couponCode: 'DEAD', items: [{ productId: A, qty: 1 }] }).expect(400);
      expect(res.body.message).toBe('Coupon is inactive');
      await checkout(agent, { paymentMethod: 'cod', couponCode: 'MISSING', items: [{ productId: A, qty: 1 }] }).expect(400);
      expect(await orderCount()).toBe(before);
      expect(await stockOf(A)).toBe(5);
    });

    it('lets only one of two simultaneous checkouts take the last use of a coupon', async () => {
      const coupon = await makeCoupon({ code: 'LASTONE', usageLimit: 1 });
      const [a, b] = await Promise.all([buyer('nguyenvana'), buyer('tranthib')]);
      const stockBefore = await stockOf(A);
      const results = await Promise.all([
        checkout(a, { paymentMethod: 'cod', couponCode: 'LASTONE', items: [{ productId: A, qty: 1 }] }),
        checkout(b, { paymentMethod: 'cod', couponCode: 'LASTONE', items: [{ productId: A, qty: 1 }] }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses[0]).toBe(201);
      expect([400, 409]).toContain(statuses[1]);
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
      expect(await stockOf(A)).toBe(stockBefore - 1); // the loser's stock change was rolled back
    });
  });

  it('never oversells: two simultaneous buyers of the last unit get one order and one 409', async () => {
    const last = await product(5, '99.00', 1);
    const [a, b] = await Promise.all([buyer('nguyenvana'), buyer('levanc')]);
    const results = await Promise.all([
      checkout(a, { paymentMethod: 'cod', items: [{ productId: last, qty: 1 }] }),
      checkout(b, { paymentMethod: 'cod', items: [{ productId: last, qty: 1 }] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(last)).toBe(0);
    expect(await prisma.orderItem.count({ where: { productId: last } })).toBe(1);
  });

  it('survives a double-click: the same wallet cart submitted twice never overdraws', async () => {
    await prisma.user.update({ where: { id: 4 }, data: { walletBalance: 150 } });
    const agent = await buyer('levanc');
    const cart = { paymentMethod: 'wallet', items: [{ productId: A, qty: 1 }] }; // $100 each
    const results = await Promise.all([checkout(agent, cart), checkout(agent, cart)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await balanceOf(4)).toBe(50);
  });
});

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { allocateDiscount } from '../src/coupons/coupons.service.js';
import { CouponsModule } from '../src/coupons/coupons.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

describe('allocateDiscount', () => {
  it('splits proportionally and hands leftover cents to the biggest groups first', () => {
    const out = allocateDiscount(31, [
      { shopId: 1, subtotalCents: 100 },
      { shopId: 2, subtotalCents: 200 },
    ]);
    expect(out.get(1)).toBe(10);
    expect(out.get(2)).toBe(21);
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(31);
  });

  it('never allocates more than the discount or a negative amount', () => {
    const out = allocateDiscount(1, [
      { shopId: 1, subtotalCents: 1 },
      { shopId: 2, subtotalCents: 1 },
      { shopId: 3, subtotalCents: 1 },
    ]);
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(1);
    expect([...out.values()].every((v) => v >= 0)).toBe(true);
    expect([...allocateDiscount(0, [{ shopId: 1, subtotalCents: 500 }]).values()]).toEqual([0]);
  });
});

describe('coupons', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const validate = (code: string, items: { productId: number; qty: number }[]) =>
    request(server()).post('/api/coupons/validate').send({ code, items });

  // product 1: Apple (shop 5) $1199, product 2: Samsung (shop 6) $1299
  const apple = [{ productId: 1, qty: 1 }];
  const both = [{ productId: 1, qty: 1 }, { productId: 2, qty: 1 }];

  async function makeCoupon(data: Record<string, unknown>) {
    return prisma.coupon.create({
      data: { type: 'percent', value: '10', usageLimit: 0, usedCount: 0, isActive: true, expiresAt: new Date(`${isoDay(30)}T00:00:00Z`), ...data } as never,
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ProductsModule, CouponsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
    await prisma.coupon.deleteMany();
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  describe('validation', () => {
    it('applies a percent coupon to the whole cart, case-insensitively, without a login', async () => {
      await makeCoupon({ code: 'PCT10' });
      const res = await validate('pct10', both).expect(201);
      expect(res.body).toMatchObject({ discount: 249.8, applicableTotal: 2498 });
      expect(res.body.coupon).toMatchObject({ code: 'PCT10', type: 'percent', value: 10 });
    });

    it('caps a fixed coupon at the cart total', async () => {
      await makeCoupon({ code: 'BIG', type: 'fixed', value: '5000' });
      expect((await validate('BIG', apple).expect(201)).body.discount).toBe(1199);
    });

    it('only discounts the items of the shop a shop coupon belongs to', async () => {
      await makeCoupon({ code: 'APPLE10', shopId: 5 });
      const res = await validate('APPLE10', both).expect(201);
      expect(res.body).toMatchObject({ applicableTotal: 1199, discount: 119.9 });
      const none = await validate('APPLE10', [{ productId: 2, qty: 1 }]).expect(400);
      expect(none.body.message).toBe('No items from this shop in your cart');
    });

    it('explains every way a coupon can be refused', async () => {
      await makeCoupon({ code: 'OFF', isActive: false });
      await makeCoupon({ code: 'OLD', expiresAt: new Date(`${isoDay(-2)}T00:00:00Z`) });
      await makeCoupon({ code: 'USEDUP', usageLimit: 5, usedCount: 5 });
      await makeCoupon({ code: 'MIN5K', minOrder: '5000' });
      const message = async (code: string) => (await validate(code, apple).expect(400)).body.message;
      expect(await message('NOPE')).toBe('Invalid coupon code');
      expect(await message('OFF')).toBe('Coupon is inactive');
      expect(await message('OLD')).toBe('Coupon has expired');
      expect(await message('USEDUP')).toBe('Coupon usage limit reached');
      expect(await message('MIN5K')).toBe('Minimum order $5000 required');
    });

    it('treats the expiry day itself as still valid', async () => {
      await makeCoupon({ code: 'TODAY', expiresAt: new Date(`${isoDay(0)}T00:00:00Z`) });
      await validate('TODAY', apple).expect(201);
    });

    it('prices from the database, rejects unknown products and bad quantities', async () => {
      await validate('PCT10', [{ productId: 999999, qty: 1 }]).expect(400);
      await validate('PCT10', [{ productId: 1, qty: 0 }]).expect(400);
      await validate('PCT10', [{ productId: 1, qty: 1.5 }]).expect(400);
      await validate('PCT10', []).expect(400);
      await request(server()).post('/api/coupons/validate').send({ code: 'PCT10', items: [{ productId: 1, qty: 1, price: 1 }] }).expect(400);
    });

    it('does not price products that are not on sale', async () => {
      await validate('PCT10', [{ productId: 12, qty: 1 }]).expect(400); // rejected product
    });
  });

  describe('shop coupons', () => {
    const body = { code: 'shop-deal', type: 'percent', value: 15, minOrder: 0, usageLimit: 10, expiresAt: isoDay(20), isActive: true };

    it('creates a coupon bound to the logged-in shop with an upper-cased code', async () => {
      const res = await (await login('apple', 'shop123')).post('/api/shop/coupons').send(body).expect(201);
      expect(res.body).toMatchObject({ code: 'SHOP-DEAL', shopId: 5, usedCount: 0, expiresAt: isoDay(20) });
    });

    it('rejects duplicates, a forged shopId, and out-of-range values', async () => {
      const shop = await login('apple', 'shop123');
      await shop.post('/api/shop/coupons').send(body).expect(409);
      await shop.post('/api/shop/coupons').send({ ...body, code: 'OTHER', shopId: 6 }).expect(400);
      await shop.post('/api/shop/coupons').send({ ...body, code: 'OVER', value: 150 }).expect(400);
      await shop.post('/api/shop/coupons').send({ ...body, code: 'ZERO', value: 0 }).expect(400);
      await shop.post('/api/shop/coupons').send({ ...body, code: 'NEG', minOrder: -1 }).expect(400);
      await shop.post('/api/shop/coupons').send({ ...body, code: 'DATE', expiresAt: 'tomorrow' }).expect(400);
    });

    it('lists only its own coupons and cannot touch another shop\'s', async () => {
      const mine = (await (await login('apple', 'shop123')).get('/api/shop/coupons').expect(200)).body;
      expect(mine.every((c: { shopId: number }) => c.shopId === 5)).toBe(true);
      const id = mine.find((c: { code: string }) => c.code === 'SHOP-DEAL').id;
      const other = await login('samsung', 'shop123');
      await other.patch(`/api/shop/coupons/${id}`).send({ isActive: false }).expect(404);
      await other.delete(`/api/shop/coupons/${id}`).expect(404);
      expect((await prisma.coupon.findUnique({ where: { id } }))?.isActive).toBe(true);
    });

    it('updates and deletes its own coupon, and allows clearing the expiry', async () => {
      const shop = await login('apple', 'shop123');
      const id = (await prisma.coupon.findFirstOrThrow({ where: { code: 'SHOP-DEAL' } })).id;
      const res = await shop.patch(`/api/shop/coupons/${id}`).send({ value: 20, expiresAt: null }).expect(200);
      expect(res.body).toMatchObject({ value: 20, expiresAt: null });
      await shop.delete(`/api/shop/coupons/${id}`).expect(204);
      expect(await prisma.coupon.findUnique({ where: { id } })).toBeNull();
    });

    it('is closed to customers and guests', async () => {
      await request(server()).get('/api/shop/coupons').expect(401);
      await (await login('nguyenvana', 'user123')).get('/api/shop/coupons').expect(403);
    });
  });

  describe('admin coupons', () => {
    const body = { code: 'ADMIN5', type: 'fixed', value: 5, minOrder: 0, usageLimit: 0, isActive: true };

    it('lets any admin read, but only roles that manage orders write', async () => {
      await (await login('ba_user', '123')).get('/api/admin/coupons').expect(200);
      await (await login('ba_user', '123')).post('/api/admin/coupons').send(body).expect(403);
      await (await login('apple', 'shop123')).get('/api/admin/coupons').expect(403);
      await request(server()).get('/api/admin/coupons').expect(401);
    });

    it('creates global and shop-scoped coupons, and refuses a scope that is not a shop', async () => {
      const pm = await login('pm_user', '123');
      const global = await pm.post('/api/admin/coupons').send(body).expect(201);
      expect(global.body.shopId).toBeNull();
      const scoped = await pm.post('/api/admin/coupons').send({ ...body, code: 'ADMIN6', shopId: 6 }).expect(201);
      expect(scoped.body).toMatchObject({ shopId: 6, shop: { shopName: 'Samsung Store' } });
      await pm.post('/api/admin/coupons').send({ ...body, code: 'ADMIN7', shopId: 2 }).expect(400); // user 2 is a customer
      await pm.post('/api/admin/coupons').send({ ...body, code: 'ADMIN7', shopId: 999 }).expect(400);
    });

    it('updates and deletes any coupon', async () => {
      const pm = await login('pm_user', '123');
      const id = (await prisma.coupon.findFirstOrThrow({ where: { code: 'ADMIN6' } })).id;
      await pm.patch(`/api/admin/coupons/${id}`).send({ isActive: false }).expect(200);
      expect((await prisma.coupon.findUnique({ where: { id } }))?.isActive).toBe(false);
      await pm.delete(`/api/admin/coupons/${id}`).expect(204);
      await pm.delete(`/api/admin/coupons/${id}`).expect(404);
    });
  });
});

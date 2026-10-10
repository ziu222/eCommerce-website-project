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

describe('order lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productId: number;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const customer = () => login('nguyenvana', 'user123'); // id 2
  const otherCustomer = () => login('tranthib', 'user123');
  const apple = () => login('apple', 'shop123'); // shop 5
  const samsung = () => login('samsung', 'shop123');
  const pm = () => login('pm_user', '123'); // orders.view + orders.manage
  const analyst = () => login('ba_user', '123'); // orders.view only

  /** Buys 2 units of a $100 Apple product. */
  async function placeOrder(paymentMethod: 'cod' | 'wallet' = 'cod') {
    const res = await (await customer()).post('/api/orders/checkout').send({ paymentMethod, items: [{ productId, qty: 2 }] }).expect(201);
    return res.body.orders[0] as { id: number; total: number };
  }
  const status = async (id: number) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
  const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;
  const balance = async () => Number((await prisma.user.findUniqueOrThrow({ where: { id: 2 } })).walletBalance);

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
  }, 120000);

  beforeEach(async () => {
    productId = (await prisma.product.create({
      data: { shopId: 5, name: 'Lifecycle Phone', price: '100', imageUrl: 'x.png', category: 'smartphone', stock: 10, adminStatus: 'approved' },
    })).id;
    await prisma.user.update({ where: { id: 2 }, data: { walletBalance: 1000 } });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('customer', () => {
    it('lists only their own orders, newest first, and reads one by id', async () => {
      const mine = await placeOrder();
      const list = (await (await customer()).get('/api/orders').expect(200)).body;
      expect(list[0].id).toBe(mine.id);
      expect(list.every((o: { customerId: number }) => o.customerId === 2)).toBe(true);
      const one = (await (await customer()).get(`/api/orders/${mine.id}`).expect(200)).body;
      expect(one.items[0]).toMatchObject({ name: 'Lifecycle Phone', qty: 2, price: 100 });
      expect(one.shop).toEqual({ id: 5, shopName: 'Apple Store' });
    });

    it('cannot see or cancel someone else\'s order', async () => {
      const mine = await placeOrder();
      const intruder = await otherCustomer();
      await intruder.get(`/api/orders/${mine.id}`).expect(404);
      await intruder.post(`/api/orders/${mine.id}/cancel`).expect(404);
      expect(await status(mine.id)).toBe('pending');
    });

    it('cancels a pending COD order, returns the stock and records history', async () => {
      const order = await placeOrder();
      expect(await stock()).toBe(8);
      const res = await (await customer()).post(`/api/orders/${order.id}/cancel`).expect(201);
      expect(res.body.status).toBe('cancelled');
      expect(res.body.statusHistory.map((h: { status: string; changedBy: string }) => [h.status, h.changedBy])).toEqual([['pending', 'customer'], ['cancelled', 'customer']]);
      expect(await stock()).toBe(10);
      expect(await balance()).toBe(1000);
    });

    it('refunds a wallet-paid order exactly once', async () => {
      const order = await placeOrder('wallet');
      expect(await balance()).toBe(800);
      await (await customer()).post(`/api/orders/${order.id}/cancel`).expect(201);
      expect(await balance()).toBe(1000);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('refunded');
      const refunds = await prisma.walletTransaction.findMany({ where: { orderId: order.id, type: 'refund' } });
      expect(refunds).toHaveLength(1);
      expect(Number(refunds[0].amount)).toBe(200);
      await (await customer()).post(`/api/orders/${order.id}/cancel`).expect(409);
      expect(await balance()).toBe(1000);
    });

    it('two simultaneous cancels refund once', async () => {
      const order = await placeOrder('wallet');
      const agent = await customer();
      const results = await Promise.all([agent.post(`/api/orders/${order.id}/cancel`), agent.post(`/api/orders/${order.id}/cancel`)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await balance()).toBe(1000);
      expect(await stock()).toBe(10);
    });

    it('cannot cancel once the shop confirmed', async () => {
      const order = await placeOrder();
      await (await apple()).patch(`/api/shop/orders/${order.id}/status`).send({ status: 'confirmed' }).expect(200);
      await (await customer()).post(`/api/orders/${order.id}/cancel`).expect(409);
      expect(await status(order.id)).toBe('confirmed');
    });
  });

  describe('shop', () => {
    it('lists only its own orders', async () => {
      await placeOrder();
      const list = (await (await apple()).get('/api/shop/orders').expect(200)).body;
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((o: { shopId: number }) => o.shopId === 5)).toBe(true);
      expect((await (await samsung()).get('/api/shop/orders').expect(200)).body.every((o: { shopId: number }) => o.shopId === 6)).toBe(true);
    });

    it('walks an order through confirm, ship and deliver, and marks COD paid on delivery', async () => {
      const order = await placeOrder('cod');
      const shop = await apple();
      for (const next of ['confirmed', 'shipped', 'delivered']) {
        await shop.patch(`/api/shop/orders/${order.id}/status`).send({ status: next }).expect(200);
      }
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { history: true } });
      expect(row).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
      expect(row.history.map((h) => h.changedBy)).toEqual(['customer', 'shop', 'shop', 'shop']);
    });

    it('rejects skipping steps, going backwards and acting on another shop\'s order', async () => {
      const order = await placeOrder();
      const shop = await apple();
      await shop.patch(`/api/shop/orders/${order.id}/status`).send({ status: 'shipped' }).expect(409);
      await shop.patch(`/api/shop/orders/${order.id}/status`).send({ status: 'delivered' }).expect(409);
      await shop.patch(`/api/shop/orders/${order.id}/status`).send({ status: 'confirmed' }).expect(200);
      await shop.patch(`/api/shop/orders/${order.id}/status`).send({ status: 'pending' }).expect(409);
      await shop.patch(`/api/shop/orders/${order.id}/status`).send({ status: 'banana' }).expect(400);
      await (await samsung()).patch(`/api/shop/orders/${order.id}/status`).send({ status: 'shipped' }).expect(404);
    });

    it('can cancel a pending order, which refunds the customer', async () => {
      const order = await placeOrder('wallet');
      await (await apple()).patch(`/api/shop/orders/${order.id}/status`).send({ status: 'cancelled' }).expect(200);
      expect(await balance()).toBe(1000);
      expect(await stock()).toBe(10);
    });
  });

  describe('admin', () => {
    it('lets a viewer list with filters but not change anything', async () => {
      const order = await placeOrder();
      const ba = await analyst();
      const all = (await ba.get('/api/admin/orders').expect(200)).body;
      expect(all.find((o: { id: number }) => o.id === order.id)).toMatchObject({ customer: { id: 2, email: 'nguyenvana@gmail.com' }, shop: { id: 5 } });
      const filtered = (await ba.get('/api/admin/orders?status=pending&shopId=5').expect(200)).body;
      expect(filtered.every((o: { status: string; shopId: number }) => o.status === 'pending' && o.shopId === 5)).toBe(true);
      await ba.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'confirmed' }).expect(403);
      await request(server()).get('/api/admin/orders').expect(401);
      await (await customer()).get('/api/admin/orders').expect(403);
    });

    it('moves an order forward and can cancel it from shipped with a refund', async () => {
      const order = await placeOrder('wallet');
      const admin = await pm();
      await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'confirmed' }).expect(200);
      await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'shipped' }).expect(200);
      await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled' }).expect(200);
      expect(await balance()).toBe(1000);
      expect(await stock()).toBe(10);
      const history = (await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { id: 'asc' } })).map((h) => h.changedBy);
      expect(history).toEqual(['customer', 'admin', 'admin', 'admin']);
    });

    it('treats delivered and cancelled as final', async () => {
      const order = await placeOrder();
      const admin = await pm();
      for (const next of ['confirmed', 'shipped', 'delivered']) await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: next }).expect(200);
      await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled' }).expect(409);
      await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'pending' }).expect(409);
      await admin.patch('/api/admin/orders/999999/status').send({ status: 'confirmed' }).expect(404);
    });
  });
});

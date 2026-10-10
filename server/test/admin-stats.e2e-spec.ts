import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import orders from '../prisma/seed-data/orders.json' with { type: 'json' };
import { AdminModule } from '../src/admin/admin.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('dashboard and finance', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  async function login(identifier: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password: '123' }).expect(200);
    return agent;
  }
  const analyst = () => login('ba_user'); // dashboard.view + dashboard.finance
  const pm = () => login('pm_user'); // dashboard.view, no finance

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, AdminModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  describe('dashboard', () => {
    it('counts shops, products, customers and orders, with revenue from every non-cancelled order', async () => {
      const res = (await (await pm()).get('/api/admin/dashboard').expect(200)).body;
      const expectedRevenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
      expect(res).toMatchObject({ shops: 6, products: 139, orders: orders.length, customers: 3, revenue: expectedRevenue });
      expect(res.statusCounts).toEqual({ pending: 2, confirmed: 1, shipped: 1, delivered: 2, cancelled: 1 });
    });

    it('ranks the top products by units sold, ignoring cancelled orders', async () => {
      const sold = new Map<number, number>();
      for (const o of orders.filter((o) => o.status !== 'cancelled')) for (const i of o.items) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty);
      const best = Math.max(...sold.values());
      const res = (await (await pm()).get('/api/admin/dashboard').expect(200)).body;
      expect(res.topProducts).toHaveLength(5);
      expect(res.topProducts[0].sold).toBe(best);
      expect(res.topProducts.map((t: { sold: number }) => t.sold)).toEqual(res.topProducts.map((t: { sold: number }) => t.sold).sort((a, b) => b - a));
      expect(res.topProducts.every((t: { product: { id: number }; sold: number }) => sold.get(t.product.id) === t.sold)).toBe(true);
      expect(res.topProducts[0].product).toEqual({ id: expect.any(Number), name: expect.any(String), category: expect.any(String) });
    });

    it('breaks products down by category and lists the five newest orders with names', async () => {
      const res = (await (await pm()).get('/api/admin/dashboard').expect(200)).body;
      expect(Object.keys(res.categoryCounts).sort()).toEqual(['audio', 'cameras', 'gaming', 'laptops', 'smartphone', 'wearables']);
      expect(Object.values<number>(res.categoryCounts).reduce((a, b) => a + b, 0)).toBe(139);
      expect(res.recentOrders.map((o: { id: number }) => o.id)).toEqual([7, 6, 5, 4, 3]);
      expect(res.recentOrders[0]).toMatchObject({ customer: { name: 'Nguyen Van A' }, shop: { shopName: 'Audiverse' }, total: 329, status: 'pending' });
    });

    it('needs dashboard.view', async () => {
      await request(server()).get('/api/admin/dashboard').expect(401);
      await (await login('hr_user')).get('/api/admin/dashboard').expect(200);
      await request(server()).post('/api/auth/login').send({ identifier: 'apple', password: 'shop123' }).expect(200);
      const shop = request.agent(server());
      await shop.post('/api/auth/login').send({ identifier: 'apple', password: 'shop123' });
      await shop.get('/api/admin/dashboard').expect(403);
    });
  });

  describe('finance', () => {
    it('summarises delivered orders only', async () => {
      const res = (await (await analyst()).get('/api/admin/finance').expect(200)).body;
      expect(res.summary).toEqual({ totalRevenue: 3226, paidOrders: 2, avgOrderValue: 1613, activeShops: 2 });
      expect(res.transactions.map((t: { id: number }) => t.id)).toEqual([6, 1]);
      expect(res.transactions[0]).toMatchObject({ customer: { name: 'Le Van C' }, shop: { shopName: 'Samsung Store' }, itemCount: 2, total: 1698, status: 'delivered' });
    });

    it('splits revenue by shop, biggest first, with percentages', async () => {
      const rows = (await (await analyst()).get('/api/admin/finance').expect(200)).body.revenueByShop;
      expect(rows).toEqual([
        { shopId: 6, shopName: 'Samsung Store', orderCount: 1, revenue: 1698, percentage: 52.6 },
        { shopId: 5, shopName: 'Apple Store', orderCount: 1, revenue: 1528, percentage: 47.4 },
      ]);
    });

    it('filters by shop and by date range', async () => {
      const agent = await analyst();
      const shop6 = (await agent.get('/api/admin/finance?shopId=6').expect(200)).body;
      expect(shop6.transactions.map((t: { id: number }) => t.id)).toEqual([6]);
      const late = (await agent.get('/api/admin/finance?dateFrom=2025-11-01').expect(200)).body; // order 1 is from December
      expect(late.transactions.map((t: { id: number }) => t.id)).toEqual([1]);
      const early = (await agent.get('/api/admin/finance?dateTo=2025-10-31T23:59:59.999Z').expect(200)).body; // order 6 is from October
      expect(early.transactions.map((t: { id: number }) => t.id)).toEqual([6]);
      const none = (await agent.get('/api/admin/finance?shopId=9').expect(200)).body;
      expect(none.summary).toEqual({ totalRevenue: 0, paidOrders: 0, avgOrderValue: 0, activeShops: 0 });
      expect(none.revenueByShop).toEqual([]);
    });

    it('rejects malformed filters and needs dashboard.finance', async () => {
      await (await analyst()).get('/api/admin/finance?shopId=abc').expect(400);
      await (await analyst()).get('/api/admin/finance?dateFrom=yesterday').expect(400);
      await (await pm()).get('/api/admin/finance').expect(403);
      await request(server()).get('/api/admin/finance').expect(401);
    });
  });
});

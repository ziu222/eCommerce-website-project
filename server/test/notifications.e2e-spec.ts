import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { NotificationsModule } from '../src/notifications/notifications.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('notifications', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const hr = () => login('hr_user', '123'); // notifications.send + view
  const analyst = () => login('ba_user', '123'); // notifications.view only
  const staff = () => login('admin1', '123'); // notifications.view only, products.manage
  const customer = (n: 'nguyenvana' | 'tranthib' = 'nguyenvana') => login(n, 'user123'); // ids 2, 3
  const apple = () => login('apple', 'shop123'); // shop 5

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ProductsModule, NotificationsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
    await prisma.notification.deleteMany();
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  const send = (agent: ReturnType<typeof request.agent>, body: Record<string, unknown>) => agent.post('/api/admin/notifications').send(body);
  const base = { targetRole: 'customer', type: 'promo', title: 'Flash sale', message: 'Everything is cheaper today.' };

  describe('sending', () => {
    it('broadcasts to every customer with one row and reaches only that role', async () => {
      const res = await send(await hr(), base).expect(201);
      expect(res.body.count).toBe(1);
      expect(await prisma.notification.count({ where: { batchId: res.body.batchId } })).toBe(1);
      expect((await (await customer()).get('/api/notifications').expect(200)).body.map((n: { title: string }) => n.title)).toContain('Flash sale');
      expect((await (await apple()).get('/api/notifications').expect(200)).body.map((n: { title: string }) => n.title)).not.toContain('Flash sale');
    });

    it('sends to chosen users only, one row each, under one batch', async () => {
      const res = await send(await hr(), { ...base, title: 'Just for you', userIds: [2] }).expect(201);
      expect(res.body.count).toBe(1);
      expect((await (await customer('nguyenvana')).get('/api/notifications').expect(200)).body.map((n: { title: string }) => n.title)).toContain('Just for you');
      expect((await (await customer('tranthib')).get('/api/notifications').expect(200)).body.map((n: { title: string }) => n.title)).not.toContain('Just for you');
    });

    it('refuses recipients that are not users of the target role', async () => {
      await send(await hr(), { ...base, userIds: [5] }).expect(400); // 5 is a shop, not a customer
      await send(await hr(), { ...base, userIds: [999] }).expect(400);
      await send(await hr(), { ...base, targetRole: 'admin' }).expect(400);
      await send(await hr(), { ...base, type: 'spam' }).expect(400);
      await send(await hr(), { ...base, title: '' }).expect(400);
      await send(await hr(), { ...base, message: 'x'.repeat(2001) }).expect(400);
    });

    it('needs the send permission', async () => {
      await send(await analyst(), base).expect(403);
      await send(await customer(), base).expect(403);
      await request(server()).post('/api/admin/notifications').send(base).expect(401);
    });

    it('lists possible recipients by role for the send form', async () => {
      const res = await (await hr()).get('/api/admin/notifications/recipients?role=shop').expect(200);
      expect(res.body.map((u: { id: number }) => u.id)).toEqual(expect.arrayContaining([5, 6, 7, 8, 9]));
      expect(res.body[0]).toEqual({ id: expect.any(Number), name: expect.any(String), email: expect.any(String) });
      await (await hr()).get('/api/admin/notifications/recipients?role=admin').expect(400);
      await (await analyst()).get('/api/admin/notifications/recipients?role=shop').expect(403);
    });
  });

  describe('history', () => {
    it('groups manual sends by batch, newest first, and hides automatic ones', async () => {
      await send(await hr(), { targetRole: 'shop', type: 'info', title: 'Policy', message: 'New terms.', userIds: [5, 6] }).expect(201);
      await prisma.notification.create({ data: { targetRole: 'shop', targetId: 5, type: 'info', title: 'Auto one', message: 'm', sentBy: 'system', source: 'auto' } });
      const res = await (await analyst()).get('/api/admin/notifications').expect(200);
      const titles = res.body.map((b: { title: string }) => b.title);
      expect(titles).not.toContain('Auto one');
      const policy = res.body.find((b: { title: string }) => b.title === 'Policy');
      expect(policy).toMatchObject({ targetRole: 'shop', type: 'info', recipients: { all: false, count: 2 }, sentBy: 'hr_user' });
      expect(res.body.find((b: { title: string }) => b.title === 'Flash sale').recipients).toEqual({ all: true, count: 1 });
      expect(titles.indexOf('Policy')).toBeLessThan(titles.indexOf('Flash sale'));
    });

    it('filters by role and type', async () => {
      const shops = (await (await analyst()).get('/api/admin/notifications?role=shop').expect(200)).body;
      expect(shops.every((b: { targetRole: string }) => b.targetRole === 'shop')).toBe(true);
      const promos = (await (await analyst()).get('/api/admin/notifications?type=promo').expect(200)).body;
      expect(promos.every((b: { type: string }) => b.type === 'promo')).toBe(true);
      await (await analyst()).get('/api/admin/notifications?type=spam').expect(400);
    });

    it('is closed to guests and non-admins', async () => {
      await request(server()).get('/api/admin/notifications').expect(401);
      await (await apple()).get('/api/admin/notifications').expect(403);
    });
  });

  describe('inbox', () => {
    it('counts unread, marks one as read for that user only, and marks all', async () => {
      const a = await customer('nguyenvana');
      const b = await customer('tranthib');
      const before = (await a.get('/api/notifications/unread-count').expect(200)).body.count;
      expect(before).toBeGreaterThanOrEqual(2);

      const first = (await a.get('/api/notifications').expect(200)).body[0];
      expect(first.isRead).toBe(false);
      await a.post(`/api/notifications/${first.id}/read`).expect(204);
      expect((await a.get('/api/notifications/unread-count').expect(200)).body.count).toBe(before - 1);

      // someone else's read state is separate, and a repeated read is harmless
      const sameForB = (await b.get('/api/notifications').expect(200)).body.find((n: { id: number }) => n.id === first.id);
      if (sameForB) expect(sameForB.isRead).toBe(false);
      await a.post(`/api/notifications/${first.id}/read`).expect(204);

      await a.post('/api/notifications/read-all').expect(204);
      expect((await a.get('/api/notifications/unread-count').expect(200)).body.count).toBe(0);
    });

    it('will not mark a notification that is not addressed to the caller', async () => {
      const mine = await prisma.notification.create({ data: { targetRole: 'customer', targetId: 3, type: 'info', title: 'For 3', message: 'm', sentBy: 'admin', source: 'manual' } });
      await (await customer('nguyenvana')).post(`/api/notifications/${mine.id}/read`).expect(404);
      await (await apple()).post(`/api/notifications/${mine.id}/read`).expect(404);
    });

    it('is not available to admins or guests', async () => {
      await request(server()).get('/api/notifications').expect(401);
      await (await hr()).get('/api/notifications').expect(403);
    });
  });

  describe('automatic product notifications', () => {
    it('tells the shop when its product is approved, rejected, suspended and restored', async () => {
      const product = await prisma.product.create({ data: { shopId: 5, name: 'Notify Me', price: '10', imageUrl: 'x', category: 'audio', adminStatus: 'pending' } });
      const admin = await staff();
      await admin.post(`/api/admin/products/${product.id}/review`).send({ decision: 'approved' }).expect(201);
      await admin.post(`/api/admin/products/${product.id}/suspend`).send({ note: 'Fake reviews' }).expect(201);
      await admin.post(`/api/admin/products/${product.id}/restore`).send({}).expect(201);

      const inbox = (await (await apple()).get('/api/notifications').expect(200)).body;
      const titles = inbox.filter((n: { message: string }) => n.message.includes('Notify Me')).map((n: { title: string }) => n.title);
      expect(titles).toEqual(['Product restored', 'Product suspended', 'Product approved']);
      const suspended = inbox.find((n: { title: string }) => n.title === 'Product suspended');
      expect(suspended.message).toContain('Fake reviews');
      expect(suspended.type).toBe('warning');
      expect(await prisma.notification.count({ where: { source: 'auto', targetId: 5 } })).toBeGreaterThanOrEqual(3);
    });

    it('includes the rejection reason', async () => {
      const product = await prisma.product.create({ data: { shopId: 6, name: 'Reject Notify', price: '10', imageUrl: 'x', category: 'audio', adminStatus: 'pending' } });
      await (await staff()).post(`/api/admin/products/${product.id}/review`).send({ decision: 'rejected', note: 'Photos are blurry' }).expect(201);
      const inbox = (await (await login('samsung', 'shop123')).get('/api/notifications').expect(200)).body;
      expect(inbox.find((n: { title: string }) => n.title === 'Product rejected').message).toContain('Photos are blurry');
    });
  });
});

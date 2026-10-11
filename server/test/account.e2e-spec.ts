import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { CouponsModule } from '../src/coupons/coupons.module.js';
import { NotificationsModule } from '../src/notifications/notifications.module.js';
import { OrdersModule } from '../src/orders/orders.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';
import { UsersModule } from '../src/users/users.module.js';
import { WalletModule } from '../src/wallet/wallet.module.js';

describe('customer account: addresses, wishlist, membership, sessions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const levanc = () => login('levanc', 'user123'); // id 4
  const tranthib = () => login('tranthib', 'user123'); // id 3
  const apple = () => login('apple', 'shop123'); // shop 5

  const home = { label: 'Home', recipient: 'Le Van C', phone: '0901 234 567', line1: '12 Nguyen Hue', ward: 'Phuong Sai Gon', city: 'Ho Chi Minh City' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, UsersModule, ProductsModule, WalletModule, CouponsModule, NotificationsModule, OrdersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  describe('address book', () => {
    beforeEach(async () => {
      await prisma.address.deleteMany();
    });

    it('makes the first address the default and keeps exactly one default', async () => {
      const agent = await levanc();
      const first = (await agent.post('/api/users/me/addresses').send(home).expect(201)).body;
      expect(first).toMatchObject({ ...home, isDefault: true });
      const office = (await agent.post('/api/users/me/addresses').send({ ...home, label: 'Office', line1: '1 Le Loi' }).expect(201)).body;
      expect(office.isDefault).toBe(false);

      await agent.patch(`/api/users/me/addresses/${office.id}`).send({ isDefault: true }).expect(200);
      const list = (await agent.get('/api/users/me/addresses').expect(200)).body;
      expect(list.map((a: { id: number; isDefault: boolean }) => [a.id, a.isDefault])).toEqual([[office.id, true], [first.id, false]]);
      // the default cannot simply be switched off, another one has to be chosen
      await agent.patch(`/api/users/me/addresses/${office.id}`).send({ isDefault: false }).expect(400);
    });

    it('hands the default on when the default address is removed', async () => {
      const agent = await levanc();
      const a = (await agent.post('/api/users/me/addresses').send(home).expect(201)).body;
      const b = (await agent.post('/api/users/me/addresses').send({ ...home, line1: '2 Le Loi' }).expect(201)).body;
      await agent.delete(`/api/users/me/addresses/${a.id}`).expect(204);
      const list = (await agent.get('/api/users/me/addresses').expect(200)).body;
      expect(list).toEqual([expect.objectContaining({ id: b.id, isDefault: true })]);
    });

    it('validates fields, caps the book at ten and keeps other people out', async () => {
      const agent = await levanc();
      await agent.post('/api/users/me/addresses').send({ ...home, phone: 'call me' }).expect(400);
      await agent.post('/api/users/me/addresses').send({ ...home, recipient: '' }).expect(400);
      await agent.post('/api/users/me/addresses').send({ ...home, userId: 3 }).expect(400);
      for (let i = 0; i < 10; i++) await agent.post('/api/users/me/addresses').send({ ...home, line1: `${i} Street` }).expect(201);
      await agent.post('/api/users/me/addresses').send(home).expect(400);

      const mine = (await agent.get('/api/users/me/addresses').expect(200)).body[0];
      const other = await tranthib();
      await other.patch(`/api/users/me/addresses/${mine.id}`).send({ city: 'Hanoi' }).expect(404);
      await other.delete(`/api/users/me/addresses/${mine.id}`).expect(404);
      expect(await prisma.address.count({ where: { userId: 4 } })).toBe(10);
      await request(server()).get('/api/users/me/addresses').expect(401);
      await (await apple()).get('/api/users/me/addresses').expect(403);
    });

    it('copies the chosen address onto the orders of a checkout, and refuses someone else\'s', async () => {
      const agent = await levanc();
      const addr = (await agent.post('/api/users/me/addresses').send(home).expect(201)).body;
      const productId = (await prisma.product.create({ data: { shopId: 5, name: 'Ship test', price: '10.00', imageUrl: 'x.png', category: 'audio', stock: 5, adminStatus: 'approved' } })).id;

      const res = await agent.post('/api/orders/checkout').send({ paymentMethod: 'cod', addressId: addr.id, items: [{ productId, qty: 1 }] }).expect(201);
      expect(res.body.orders[0].shipping).toEqual({ name: 'Le Van C', phone: '0901 234 567', address: '12 Nguyen Hue, Phuong Sai Gon, Ho Chi Minh City' });

      // editing the address book later does not rewrite the order
      await agent.patch(`/api/users/me/addresses/${addr.id}`).send({ city: 'Da Nang' }).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: res.body.orders[0].id } })).shipAddress).toBe('12 Nguyen Hue, Phuong Sai Gon, Ho Chi Minh City');

      await (await tranthib()).post('/api/orders/checkout').send({ paymentMethod: 'cod', addressId: addr.id, items: [{ productId, qty: 1 }] }).expect(404);
    });
  });

  describe('wishlist', () => {
    it('saves, lists and removes products, once each, and only approved ones', async () => {
      const agent = await levanc();
      const approved = (await prisma.product.findFirstOrThrow({ where: { adminStatus: 'approved' } })).id;
      const pending = (await prisma.product.create({ data: { shopId: 5, name: 'Not yet', price: '1.00', imageUrl: 'x.png', category: 'audio', stock: 1, adminStatus: 'pending' } })).id;

      await agent.put(`/api/users/me/wishlist/${approved}`).expect(204);
      await agent.put(`/api/users/me/wishlist/${approved}`).expect(204);
      await agent.put(`/api/users/me/wishlist/${pending}`).expect(404);
      await agent.put('/api/users/me/wishlist/999999').expect(404);

      const list = (await agent.get('/api/users/me/wishlist').expect(200)).body;
      expect(list.map((p: { id: number }) => p.id)).toEqual([approved]);
      expect((await agent.get('/api/users/me/wishlist/ids').expect(200)).body).toEqual([approved]);
      expect((await (await tranthib()).get('/api/users/me/wishlist').expect(200)).body).toEqual([]);

      await agent.delete(`/api/users/me/wishlist/${approved}`).expect(204);
      expect((await agent.get('/api/users/me/wishlist').expect(200)).body).toEqual([]);
    });
  });

  describe('membership', () => {
    it('counts only delivered orders and shows what is left to the next tier', async () => {
      const agent = await levanc();
      await prisma.order.deleteMany({ where: { customerId: 4 } });
      const before = (await agent.get('/api/users/me/membership').expect(200)).body;
      expect(before).toMatchObject({ tier: { key: 'member' }, spent: 0, next: { key: 'silver', remaining: 200 } });

      const base = { customerId: 4, shopId: 5, subtotal: '0', paymentMethod: 'cod' as const };
      await prisma.order.create({ data: { ...base, total: '250.00', status: 'delivered' } });
      await prisma.order.create({ data: { ...base, total: '5000.00', status: 'cancelled' } });
      await prisma.order.create({ data: { ...base, total: '5000.00', status: 'pending' } });

      const after = (await agent.get('/api/users/me/membership').expect(200)).body;
      expect(after).toMatchObject({ tier: { key: 'silver' }, spent: 250, next: { key: 'gold', remaining: 750 } });
      expect(after.perks).toContain('Early access to weekly deals');
    });
  });

  describe('order updates', () => {
    it('tells the customer when the shop moves their order on, but not about their own cancellation', async () => {
      const agent = await levanc();
      const productId = (await prisma.product.create({ data: { shopId: 5, name: 'Notice test', price: '10.00', imageUrl: 'x.png', category: 'audio', stock: 5, adminStatus: 'approved' } })).id;
      const order = (await agent.post('/api/orders/checkout').send({ paymentMethod: 'cod', items: [{ productId, qty: 1 }] }).expect(201)).body.orders[0];
      const count = () => prisma.notification.count({ where: { targetRole: 'customer', targetId: 4, title: { startsWith: 'Order' } } });
      const start = await count();

      await (await apple()).patch(`/api/shop/orders/${order.id}/status`).send({ status: 'confirmed' }).expect(200);
      expect(await count()).toBe(start + 1);
      const inbox = (await agent.get('/api/notifications').expect(200)).body;
      expect(JSON.stringify(inbox)).toContain(`order #${order.id}`);

      const second = (await agent.post('/api/orders/checkout').send({ paymentMethod: 'cod', items: [{ productId, qty: 1 }] }).expect(201)).body.orders[0];
      await agent.post(`/api/orders/${second.id}/cancel`).expect(201);
      expect(await count()).toBe(start + 1);
    });

    it('pushes the new status to the customer over server-sent events', async () => {
      await request(server()).get('/api/notifications/stream').expect(401);

      const login = await request(server()).post('/api/auth/login').send({ identifier: 'levanc', password: 'user123' }).expect(200);
      const cookie = [login.headers['set-cookie']].flat().map((c) => String(c).split(';')[0]).join('; ');
      const productId = (await prisma.product.create({ data: { shopId: 5, name: 'Live test', price: '10.00', imageUrl: 'x.png', category: 'audio', stock: 5, adminStatus: 'approved' } })).id;
      const order = (await request(server()).post('/api/orders/checkout').set('Cookie', cookie).send({ paymentMethod: 'cod', items: [{ productId, qty: 1 }] }).expect(201)).body.orders[0];

      await new Promise<void>((done) => server().listen(0, done));
      const { port } = server().address() as { port: number };
      const abort = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/notifications/stream`, { headers: { Cookie: cookie }, signal: abort.signal });
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      await (await apple()).patch(`/api/shop/orders/${order.id}/status`).send({ status: 'confirmed' }).expect(200);
      const reader = res.body!.getReader();
      let text = '';
      while (!text.includes(`"orderId":${order.id}`)) text += new TextDecoder().decode((await reader.read()).value);
      abort.abort();
      expect(text).toContain('event: order');
      expect(text).toContain('"status":"confirmed"');
    });

    it('tells the shop about a new order and about the customer cancelling it', async () => {
      const shopLogin = await request(server()).post('/api/auth/login').send({ identifier: 'apple', password: 'shop123' }).expect(200);
      const cookie = [shopLogin.headers['set-cookie']].flat().map((c) => String(c).split(';')[0]).join('; ');
      if (!server().listening) await new Promise<void>((done) => server().listen(0, done));
      const { port } = server().address() as { port: number };
      const abort = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/notifications/stream`, { headers: { Cookie: cookie }, signal: abort.signal });
      const reader = res.body!.getReader();
      let text = '';
      const until = async (s: string) => { while (!text.includes(s)) text += new TextDecoder().decode((await reader.read()).value); };

      const customer = await levanc();
      const productId = (await prisma.product.create({ data: { shopId: 5, name: 'Shop live test', price: '10.00', imageUrl: 'x.png', category: 'audio', stock: 5, adminStatus: 'approved' } })).id;
      const order = (await customer.post('/api/orders/checkout').send({ paymentMethod: 'cod', items: [{ productId, qty: 1 }] }).expect(201)).body.orders[0];
      await until(`{"orderId":${order.id},"status":"pending"}`);
      await customer.post(`/api/orders/${order.id}/cancel`).expect(201);
      await until(`{"orderId":${order.id},"status":"cancelled"}`);
      abort.abort();
    });
  });

  describe('sign out everywhere', () => {
    it('ends the sessions on other devices and keeps this one signed in', async () => {
      const phone = await levanc();
      const laptop = await levanc();
      await phone.get('/api/users/me').expect(200);

      await laptop.post('/api/auth/logout-all').expect(204);
      await phone.get('/api/users/me').expect(401);
      await laptop.get('/api/users/me').expect(200);

      const me = (await laptop.get('/api/users/me').expect(200)).body;
      expect(me.lastLoginAt).toBeTruthy();
      await request(server()).post('/api/auth/logout-all').expect(401);
    });
  });
});

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminModule } from '../src/admin/admin.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('admin users and shops', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const hr = () => login('hr_user', '123'); // users.view / manage / admin
  const pm = () => login('pm_user', '123'); // shops.view / manage, no users.*
  const analyst = () => login('ba_user', '123'); // shops.view only
  const staff = () => login('admin1', '123'); // shops.view only

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, AdminModule] }).compile();
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

  describe('users', () => {
    it('lists every account without password data, and filters by role', async () => {
      const all = (await (await hr()).get('/api/admin/users').expect(200)).body;
      expect(all).toHaveLength(14);
      expect(JSON.stringify(all)).not.toMatch(/passwordHash|argon2|"password"/);
      expect(all.find((u: { id: number }) => u.id === 11)).toMatchObject({ role: 'shop', shopStatus: 'pending', shopName: 'Flagship Store' });
      const shops = (await (await hr()).get('/api/admin/users?role=shop').expect(200)).body;
      expect(shops.every((u: { role: string }) => u.role === 'shop')).toBe(true);
      await (await hr()).get('/api/admin/users?role=root').expect(400);
    });

    it('needs the users.view permission', async () => {
      await request(server()).get('/api/admin/users').expect(401);
      await (await pm()).get('/api/admin/users').expect(403);
      await (await login('nguyenvana', 'user123')).get('/api/admin/users').expect(403);
    });

    it('suspends a customer, who can then no longer log in, and restores them', async () => {
      const admin = await hr();
      await admin.patch('/api/admin/users/3/status').send({ status: 'suspended' }).expect(200);
      const blocked = await request(server()).post('/api/auth/login').send({ identifier: 'tranthib', password: 'user123' });
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toBe('suspended');
      await admin.patch('/api/admin/users/3/status').send({ status: 'active' }).expect(200);
      await request(server()).post('/api/auth/login').send({ identifier: 'tranthib', password: 'user123' }).expect(200);
    });

    it('approves, suspends and restores a shop through shopStatus', async () => {
      const admin = await hr();
      const approved = await admin.patch('/api/admin/users/11/status').send({ shopStatus: 'active' }).expect(200);
      expect(approved.body.shopStatus).toBe('active');
      await admin.patch('/api/admin/users/11/status').send({ shopStatus: 'suspended' }).expect(200);
      await request(server()).post('/api/auth/login').send({ identifier: 'flagshipstore', password: 'shop123' }).expect(403);
      await admin.patch('/api/admin/users/11/status').send({ status: 'active', shopStatus: 'active' }).expect(200);
      await request(server()).post('/api/auth/login').send({ identifier: 'flagshipstore', password: 'shop123' }).expect(200);
    });

    it('rejects nonsense: empty body, wrong field for the role, admin targets, unknown ids', async () => {
      const admin = await hr();
      await admin.patch('/api/admin/users/3/status').send({}).expect(400);
      await admin.patch('/api/admin/users/3/status').send({ status: 'deleted' }).expect(400);
      await admin.patch('/api/admin/users/3/status').send({ shopStatus: 'active' }).expect(400); // 3 is a customer
      await admin.patch('/api/admin/users/10/status').send({ status: 'banned' }).expect(409); // admin accounts are off limits
      await admin.patch('/api/admin/users/999/status').send({ status: 'banned' }).expect(404);
      await admin.patch('/api/admin/users/3/status').send({ status: 'banned', role: 'admin' }).expect(400);
    });

    it('lets only users.manage change a status', async () => {
      await (await pm()).patch('/api/admin/users/3/status').send({ status: 'suspended' }).expect(403);
      await (await analyst()).patch('/api/admin/users/3/status').send({ status: 'suspended' }).expect(403);
    });

    it('creates a shop with a password the owner can use', async () => {
      const body = { name: 'New Owner', shopName: 'Fresh Shop', email: 'fresh@shop.io', username: 'freshshop', password: 'secret1', shopStatus: 'active' };
      const res = await (await hr()).post('/api/admin/users/shops').send(body).expect(201);
      expect(res.body).toMatchObject({ role: 'shop', shopName: 'Fresh Shop', shopStatus: 'active' });
      await request(server()).post('/api/auth/login').send({ identifier: 'freshshop', password: 'secret1' }).expect(200);
      await (await hr()).post('/api/admin/users/shops').send(body).expect(409);
      await (await hr()).post('/api/admin/users/shops').send({ ...body, username: 'other1', email: 'o@x.io', password: '123' }).expect(400);
      await (await pm()).post('/api/admin/users/shops').send({ ...body, username: 'other2', email: 'o2@x.io' }).expect(403);
    });

    it('creates admins only for users.admin, with a known role', async () => {
      const body = { name: 'New Admin', email: 'newadmin@ecshop.com', username: 'newadmin', password: 'secret1', adminRole: 'ba' };
      await (await pm()).post('/api/admin/users/admins').send(body).expect(403);
      await (await staff()).post('/api/admin/users/admins').send(body).expect(403);
      await (await hr()).post('/api/admin/users/admins').send({ ...body, adminRole: 'owner' }).expect(400);
      const res = await (await hr()).post('/api/admin/users/admins').send(body).expect(201);
      expect(res.body).toMatchObject({ role: 'admin', adminRole: 'ba' });
      const session = await request(server()).post('/api/auth/login').send({ identifier: 'newadmin', password: 'secret1', portal: 'admin' }).expect(200);
      expect(session.body.permissions).toContain('orders.view');
      await (await hr()).post('/api/admin/users/admins').send(body).expect(409);
    });
  });

  describe('shops', () => {
    it('lists shops with product counts and revenue from non-cancelled orders', async () => {
      const res = await (await analyst()).get('/api/admin/shops').expect(200);
      const apple = res.body.find((s: { id: number }) => s.id === 5);
      // seeded orders 1, 2 and 4 belong to shop 5 (none cancelled): 1528 + 1399 + 799
      expect(apple).toMatchObject({ shopName: 'Apple Store', name: 'Tim Cook', shopStatus: 'active', revenue: 3726 });
      expect(apple.productCount).toBeGreaterThan(5);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
      await (await hr()).get('/api/admin/shops').expect(403);
    });

    it('shows one shop with its products, order count and revenue', async () => {
      const res = await (await analyst()).get('/api/admin/shops/5').expect(200);
      expect(res.body).toMatchObject({ id: 5, shopName: 'Apple Store', orderCount: 3, revenue: 3726 });
      expect(res.body.products[0]).toEqual(expect.objectContaining({ id: expect.any(Number), name: expect.any(String), category: expect.any(String), price: expect.any(Number), stock: expect.any(Number) }));
      await (await analyst()).get('/api/admin/shops/2').expect(404); // a customer, not a shop
      await (await analyst()).get('/api/admin/shops/999').expect(404);
    });

    it('edits shop details and status with shops.manage only', async () => {
      const admin = await pm();
      const res = await admin.patch('/api/admin/shops/6').send({ shopName: 'Samsung Official', shopPhone: '0900000000', shopAddress: 'Seoul', shopDescription: 'Galaxy' }).expect(200);
      expect(res.body).toMatchObject({ shopName: 'Samsung Official', shopPhone: '0900000000', shopAddress: 'Seoul' });
      await admin.patch('/api/admin/shops/6').send({ role: 'admin' }).expect(400);
      await admin.patch('/api/admin/shops/6/status').send({ shopStatus: 'suspended' }).expect(200);
      await admin.patch('/api/admin/shops/6/status').send({ shopStatus: 'active' }).expect(200);
      await admin.patch('/api/admin/shops/6/status').send({ shopStatus: 'rejected' }).expect(400);
      await (await analyst()).patch('/api/admin/shops/6').send({ shopName: 'X' }).expect(403);
      await (await analyst()).patch('/api/admin/shops/6/status').send({ shopStatus: 'suspended' }).expect(403);
    });

    it('adds a pending shop with a generated username and a one-time temporary password', async () => {
      const body = { name: 'Nguyen Van Z', shopName: 'Zeta Store', email: 'zeta@shop.io', shopPhone: '0911', shopAddress: 'Hanoi', shopDescription: 'Gadgets' };
      const res = await (await pm()).post('/api/admin/shops').send(body).expect(201);
      expect(res.body.shop).toMatchObject({ shopName: 'Zeta Store', shopStatus: 'pending', username: 'nguyenvanz' });
      const temporary: string = res.body.temporaryPassword;
      expect(temporary.length).toBeGreaterThanOrEqual(10);
      expect(JSON.stringify(res.body.shop)).not.toContain(temporary);

      // pending shops cannot enter; once approved the temporary password works
      const pending = await request(server()).post('/api/auth/login').send({ identifier: 'nguyenvanz', password: temporary });
      expect(pending.status).toBe(403);
      await (await pm()).patch(`/api/admin/shops/${res.body.shop.id}/status`).send({ shopStatus: 'active' }).expect(200);
      await request(server()).post('/api/auth/login').send({ identifier: 'nguyenvanz', password: temporary }).expect(200);

      // same owner name again gets a different username; the same email is refused
      const second = await (await pm()).post('/api/admin/shops').send({ ...body, email: 'zeta2@shop.io' }).expect(201);
      expect(second.body.shop.username).not.toBe('nguyenvanz');
      expect(second.body.temporaryPassword).not.toBe(temporary);
      await (await pm()).post('/api/admin/shops').send(body).expect(409);
      await (await analyst()).post('/api/admin/shops').send({ ...body, email: 'zeta3@shop.io' }).expect(403);
    });
  });
});

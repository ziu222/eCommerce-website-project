import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

describe('auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User" RESTART IDENTITY CASCADE');

    const passwordHash = await argon2.hash('secret1');
    const base = { passwordHash, name: 'Seeded' };
    await prisma.user.createMany({
      data: [
        { ...base, username: 'activeshop', email: 'a@shop.io', role: 'shop', shopName: 'A', shopStatus: 'active' },
        { ...base, username: 'pendingshop', email: 'p@shop.io', role: 'shop', shopName: 'P', shopStatus: 'pending' },
        { ...base, username: 'blockedshop', email: 'b@shop.io', role: 'shop', shopName: 'B', shopStatus: 'suspended' },
        { ...base, username: 'analyst', email: 'ba@x.io', role: 'admin', adminRole: 'ba' },
        { ...base, username: 'boss', email: 'boss@x.io', role: 'admin', adminRole: 'super_admin' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const customer = { name: 'Lan', username: 'lan', email: 'lan@x.io', password: 'abcdef' };

  it('registers a customer, sets an httpOnly cookie and returns the session', async () => {
    const res = await request(server()).post('/api/auth/register').send(customer).expect(201);
    expect(res.body).toMatchObject({ username: 'lan', role: 'customer', permissions: [] });
    expect(res.body.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('ecshop_token=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('returns the same user from /me with the cookie, and 401 without it', async () => {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier: 'lan@x.io', password: 'abcdef' }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.username).toBe('lan');
    await request(server()).get('/api/auth/me').expect(401);
  });

  it('rejects duplicate username and duplicate email with 409', async () => {
    await request(server()).post('/api/auth/register').send({ ...customer, email: 'other@x.io' }).expect(409);
    await request(server()).post('/api/auth/register').send({ ...customer, username: 'other' }).expect(409);
  });

  it('rejects a password shorter than 6 characters', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({ ...customer, username: 'short', email: 'short@x.io', password: '12345' })
      .expect(400);
  });

  it('refuses privilege fields in the register body', async () => {
    const body = { ...customer, username: 'evil', email: 'evil@x.io' };
    await request(server()).post('/api/auth/register').send({ ...body, role: 'admin' }).expect(400);
    await request(server()).post('/api/auth/register').send({ ...body, walletBalance: 9999 }).expect(400);
    await request(server()).post('/api/auth/register').send({ ...body, adminRole: 'super_admin' }).expect(400);
    expect(await prisma.user.count({ where: { username: 'evil' } })).toBe(0);
  });

  it('login accepts username or email and rejects bad credentials with the legacy messages', async () => {
    await request(server()).post('/api/auth/login').send({ identifier: 'lan', password: 'abcdef' }).expect(200);
    const unknown = await request(server()).post('/api/auth/login').send({ identifier: 'nobody', password: 'abcdef' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe('Tài khoản không tồn tại');
    const wrong = await request(server()).post('/api/auth/login').send({ identifier: 'lan', password: 'nope123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('Mật khẩu không đúng');
  });

  it('registers a shop as pending without logging it in', async () => {
    const res = await request(server())
      .post('/api/auth/register-shop')
      .send({ ...customer, username: 'newshop', email: 'newshop@x.io', shopName: 'New Shop' })
      .expect(201);
    expect(res.headers['set-cookie']).toBeUndefined();
    const row = await prisma.user.findUnique({ where: { username: 'newshop' } });
    expect(row).toMatchObject({ role: 'shop', shopStatus: 'pending' });
  });

  it('lets an active shop in but blocks pending and suspended shops with 403', async () => {
    await request(server()).post('/api/auth/login').send({ identifier: 'activeshop', password: 'secret1' }).expect(200);
    const pending = await request(server()).post('/api/auth/login').send({ identifier: 'pendingshop', password: 'secret1' });
    expect(pending.status).toBe(403);
    expect(pending.body.message).toBe('pending');
    const blocked = await request(server()).post('/api/auth/login').send({ identifier: 'blockedshop', password: 'secret1' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('suspended');
  });

  it('returns admin permissions from the server-side role table', async () => {
    const ba = await request(server()).post('/api/auth/login').send({ identifier: 'analyst', password: 'secret1' }).expect(200);
    expect(ba.body.adminRole).toBe('ba');
    expect(ba.body.permissions).toContain('orders.view');
    expect(ba.body.permissions).not.toContain('orders.manage');
    const boss = await request(server()).post('/api/auth/login').send({ identifier: 'boss', password: 'secret1' }).expect(200);
    expect(boss.body.permissions).toEqual(['*']);
  });

  it('refuses to log a non-admin in through the admin portal', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ identifier: 'lan', password: 'abcdef', portal: 'admin' });
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('logout clears the session', async () => {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier: 'lan', password: 'abcdef' }).expect(200);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('treats a tampered or forged token as logged out', async () => {
    await request(server()).get('/api/auth/me').set('Cookie', 'ecshop_token=not.a.jwt').expect(401);
  });
});

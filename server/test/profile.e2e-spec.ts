import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';
import { UsersModule } from '../src/users/users.module.js';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('own profile', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const customer = () => login('levanc', 'user123'); // id 4

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, UsersModule] }).compile();
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

  it('returns the profile without any password data, and nothing to guests', async () => {
    const res = (await (await customer()).get('/api/users/me').expect(200)).body;
    expect(res).toMatchObject({ id: 4, name: 'Le Van C', username: 'levanc', email: 'levanc@gmail.com', role: 'customer', avatar: '', coverPhoto: null });
    expect(JSON.stringify(res)).not.toMatch(/passwordHash|argon2|walletBalance/);
    await request(server()).get('/api/users/me').expect(401);
    await request(server()).patch('/api/users/me').send({ name: 'x' }).expect(401);
  });

  it('updates name and email', async () => {
    const res = await (await customer()).patch('/api/users/me').send({ name: 'Le Van Cuong', email: 'cuong@example.com' }).expect(200);
    expect(res.body).toMatchObject({ name: 'Le Van Cuong', email: 'cuong@example.com' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 4 } })).email).toBe('cuong@example.com');
  });

  it('refuses a malformed email, one that is taken, and fields a user must not set', async () => {
    const agent = await customer();
    await agent.patch('/api/users/me').send({ email: 'not-an-email' }).expect(400);
    await agent.patch('/api/users/me').send({ email: 'nguyenvana@gmail.com' }).expect(409);
    for (const field of [{ role: 'admin' }, { username: 'hacker' }, { walletBalance: 9999 }, { adminRole: 'super_admin' }, { status: 'active' }]) {
      await agent.patch('/api/users/me').send(field).expect(400);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 4 } })).role).toBe('customer');
  });

  it('changes the password only with the correct current one', async () => {
    const agent = await customer();
    await agent.patch('/api/users/me').send({ newPassword: 'brandnew1' }).expect(400);
    await agent.patch('/api/users/me').send({ currentPassword: 'wrong', newPassword: 'brandnew1' }).expect(400);
    await agent.patch('/api/users/me').send({ currentPassword: 'user123', newPassword: '123' }).expect(400);
    await request(server()).post('/api/auth/login').send({ identifier: 'levanc', password: 'user123' }).expect(200);

    await agent.patch('/api/users/me').send({ currentPassword: 'user123', newPassword: 'brandnew1' }).expect(200);
    await request(server()).post('/api/auth/login').send({ identifier: 'levanc', password: 'user123' }).expect(401);
    await request(server()).post('/api/auth/login').send({ identifier: 'levanc', password: 'brandnew1' }).expect(200);
  });

  it('stores an avatar and cover as image data, and clears them with null', async () => {
    const agent = await login('levanc', 'brandnew1');
    const res = await agent.patch('/api/users/me').send({ avatar: PIXEL, coverPhoto: PIXEL }).expect(200);
    expect(res.body).toMatchObject({ avatar: PIXEL, coverPhoto: PIXEL });
    const cleared = await agent.patch('/api/users/me').send({ avatar: null }).expect(200);
    expect(cleared.body).toMatchObject({ avatar: null, coverPhoto: PIXEL });
    expect((await agent.get('/api/auth/me').expect(200)).body.avatar).toBeUndefined();
  });

  it('rejects images that are not images or are too large', async () => {
    const agent = await login('levanc', 'brandnew1');
    await agent.patch('/api/users/me').send({ avatar: 'data:text/html;base64,PHNjcmlwdD4=' }).expect(400);
    await agent.patch('/api/users/me').send({ avatar: 'javascript:alert(1)' }).expect(400);
    await agent.patch('/api/users/me').send({ avatar: `data:image/png;base64,${'A'.repeat(360000)}` }).expect(400);
    await agent.patch('/api/users/me').send({ avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' }).expect(200);
  });
});

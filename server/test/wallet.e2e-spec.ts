import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';
import { WalletModule } from '../src/wallet/wallet.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';

describe('wallet', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let wallet: WalletService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const customer = () => login('nguyenvana', 'user123'); // id 2, seeded balance 200
  const balanceOf = async (id: number) => Number((await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalance);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, WalletModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    wallet = moduleRef.get(WalletService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
  }, 120000);

  beforeEach(() => {
    process.env.DEMO_TOPUP = 'true';
  });

  afterAll(async () => {
    delete process.env.DEMO_TOPUP;
    await app.close();
  });

  it('shows the balance and an empty history to the owner, and nothing to guests', async () => {
    const res = await (await customer()).get('/api/wallet').expect(200);
    expect(res.body).toEqual({ balance: 200, transactions: [] });
    await request(server()).get('/api/wallet').expect(401);
  });

  it('is closed to shops and admins', async () => {
    await (await login('apple', 'shop123')).get('/api/wallet').expect(403);
    await (await login('admin1', '123')).get('/api/wallet').expect(403);
  });

  it('tops up in demo mode and records the ledger line with the balance after', async () => {
    const agent = await customer();
    const res = await agent.post('/api/wallet/topup').send({ amount: 50.25, gateway: 'momo' }).expect(201);
    expect(res.body).toMatchObject({ balance: 250.25 });
    const history = (await agent.get('/api/wallet').expect(200)).body;
    expect(history.balance).toBe(250.25);
    expect(history.transactions[0]).toMatchObject({ type: 'topup', amount: 50.25, balanceAfter: 250.25, gateway: 'momo' });
  });

  it('refuses top-ups when demo mode is off', async () => {
    process.env.DEMO_TOPUP = 'false';
    const before = await balanceOf(2);
    await (await customer()).post('/api/wallet/topup').send({ amount: 10, gateway: 'momo' }).expect(403);
    expect(await balanceOf(2)).toBe(before);
  });

  it('rejects invalid amounts and gateways', async () => {
    const agent = await customer();
    for (const amount of [0, -5, 1000.01, 'abc', 10.123]) {
      await agent.post('/api/wallet/topup').send({ amount, gateway: 'momo' }).expect(400);
    }
    await agent.post('/api/wallet/topup').send({ amount: 10, gateway: '<script>' }).expect(400);
    await agent.post('/api/wallet/topup').send({ amount: 10 }).expect(400);
  });

  it('caps top-ups per user per day', async () => {
    const agent = await login('tranthib', 'user123');
    for (let i = 0; i < 5; i++) await agent.post('/api/wallet/topup').send({ amount: 1000, gateway: 'momo' }).expect(201);
    await agent.post('/api/wallet/topup').send({ amount: 1, gateway: 'momo' }).expect(403);
  });

  it('debit never overdraws: two racing debits that exceed the balance let exactly one through', async () => {
    await prisma.user.update({ where: { id: 4 }, data: { walletBalance: 200 } });
    const attempt = () =>
      prisma.$transaction((tx) => wallet.debit(tx, 4, 15000, null)).then(
        () => 'ok',
        () => 'insufficient',
      );
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.sort()).toEqual(['insufficient', 'ok']);
    expect(await balanceOf(4)).toBe(50);
    expect(await prisma.walletTransaction.count({ where: { userId: 4, type: 'payment' } })).toBe(1);
  });

  it('credit adds to the balance and writes the ledger line', async () => {
    await prisma.$transaction((tx) => wallet.credit(tx, 4, 2500, 'refund', null));
    expect(await balanceOf(4)).toBe(75);
    const last = await prisma.walletTransaction.findFirstOrThrow({ where: { userId: 4, type: 'refund' } });
    expect(Number(last.balanceAfter)).toBe(75);
  });
});

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { CouponsModule } from '../src/coupons/coupons.module.js';
import { ModerationModule } from '../src/moderation/moderation.module.js';
import { quarterEnd } from '../src/moderation/penalties.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('shop penalty points and appeals', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const apple = () => login('apple', 'shop123'); // shop 5
  const samsung = () => login('samsung', 'shop123'); // shop 6
  const staff = () => login('admin1', '123');
  let n = 0;
  const listing = (extra: Record<string, unknown> = {}) => ({
    name: `Penalty Test Speaker ${++n}`,
    price: 99,
    imageUrl: '../asset/img/placeholder/audio.svg',
    category: 'audio',
    stock: 3,
    description: 'Short text.', // too short: the rules flag it, so it lands in the admin queue
    ...extra,
  });
  const points = async (shopId: number) => (await prisma.shopPenalty.aggregate({ where: { shopId, revokedAt: null, expiresAt: { gt: new Date() } }, _sum: { points: true } }))._sum.points ?? 0;
  const give = (shopId: number, pts: number, expiresAt = quarterEnd(new Date())) =>
    prisma.shopPenalty.create({ data: { shopId, points: pts, reason: 'test', createdBy: 'test', expiresAt } });

  async function flaggedOf(agent: Awaited<ReturnType<typeof apple>>) {
    const { body } = await agent.post('/api/shop/products').send(listing()).expect(201);
    return (await prisma.productFlag.findFirstOrThrow({ where: { productId: body.id, status: 'open' } })).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, ProductsModule, ModerationModule, CouponsModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification", "BannedKeyword", "ModerationSetting" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.shopPenalty.deleteMany();
    await prisma.user.updateMany({ where: { role: 'shop' }, data: { shopStatus: 'active' } });
  });

  it('charges 1 point for a violation by default, 2 when asked, 3 for severe, and tells the shop', async () => {
    const admin = await staff();
    const shop = await apple();
    const r1 = (await admin.post(`/api/admin/moderation/flags/${await flaggedOf(shop)}/decide`).send({ decision: 'violation', note: 'Fake brand' }).expect(201)).body;
    expect(r1).toMatchObject({ points: 1, shopPoints: 1, shopSuspended: false });
    await admin.post(`/api/admin/moderation/flags/${await flaggedOf(shop)}/decide`).send({ decision: 'violation', note: 'Again', points: 2 }).expect(201);
    await admin.post(`/api/admin/moderation/flags/${await flaggedOf(shop)}/decide`).send({ decision: 'violation', note: 'x', points: 3 }).expect(400);
    expect(await points(5)).toBe(3);
    await admin.post(`/api/admin/moderation/flags/${await flaggedOf(await samsung())}/decide`).send({ decision: 'severe', note: 'Counterfeit' }).expect(201);
    expect(await points(6)).toBe(3);
    expect(await prisma.notification.count({ where: { targetId: 5, title: { startsWith: 'Penalty' } } })).toBe(2);
  });

  it('charges nothing for dismiss or minor', async () => {
    const admin = await staff();
    const shop = await apple();
    await admin.post(`/api/admin/moderation/flags/${await flaggedOf(shop)}/decide`).send({ decision: 'dismiss' }).expect(201);
    await admin.post(`/api/admin/moderation/flags/${await flaggedOf(shop)}/decide`).send({ decision: 'minor', note: 'Add a photo' }).expect(201);
    expect(await points(5)).toBe(0);
  });

  it('ignores points from past quarters and revoked ones', async () => {
    await give(5, 5, new Date(Date.now() - 1000));
    const revoked = await give(5, 4);
    await prisma.shopPenalty.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
    await give(5, 1);
    const body = (await (await apple()).get('/api/shop/penalties').expect(200)).body;
    expect(body.current).toBe(1);
    expect(body.items).toHaveLength(3);
    expect(body.items.filter((p: { counts: boolean }) => p.counts)).toHaveLength(1);
  });

  it('stops vouchers at 3 points', async () => {
    const shop = await apple();
    await shop.post('/api/shop/coupons').send({ code: 'PENOK1', type: 'percent', value: 10 }).expect(201);
    await give(5, 3);
    const res = await shop.post('/api/shop/coupons').send({ code: 'PENNO1', type: 'percent', value: 10 }).expect(403);
    expect(res.body.message).toContain('3 penalty points');
  });

  it('caps the number of products at 3 points', async () => {
    await (await staff()).put('/api/admin/moderation/settings').send({ productLimit: 1 }).expect(200);
    await give(5, 3);
    await (await apple()).post('/api/shop/products').send(listing({ description: 'A complete description of this small test speaker.' })).expect(403);
    await (await staff()).put('/api/admin/moderation/settings').send({ productLimit: 200 }).expect(200);
  });

  it('freezes adding and editing products for 14 days at 6 points', async () => {
    const shop = await apple();
    const { body } = await shop.post('/api/shop/products').send(listing({ description: 'A complete description of this small test speaker.' })).expect(201);
    await give(5, 6);
    await shop.post('/api/shop/products').send(listing()).expect(403);
    const res = await shop.patch(`/api/shop/products/${body.id}`).send({ price: 95 }).expect(403);
    expect(res.body.message).toMatch(/until \d{4}-\d{2}-\d{2}/);
    // a freeze ends 14 days after the latest penalty
    await prisma.shopPenalty.updateMany({ where: { shopId: 5 }, data: { createdAt: new Date(Date.now() - 15 * 86_400_000) } });
    await shop.patch(`/api/shop/products/${body.id}`).send({ price: 95 }).expect(200);
  });

  it('suspends the shop when a decision brings it to 9 points', async () => {
    // the flagged product comes first: at 7 points the shop can no longer add products
    const flagId = await flaggedOf(await apple());
    await give(5, 7);
    const r = (await (await staff()).post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'violation', note: 'Repeat', points: 2 }).expect(201)).body;
    expect(r).toMatchObject({ shopPoints: 9, shopSuspended: true });
    expect(await prisma.user.findUnique({ where: { id: 5 } })).toMatchObject({ shopStatus: 'suspended' });
  });

  describe('appeals', () => {
    it('lets a shop appeal once, and an accepted appeal removes the points', async () => {
      const p = await give(5, 2);
      const shop = await apple();
      await shop.post(`/api/shop/penalties/${p.id}/appeal`).send({ message: 'short' }).expect(400);
      const appeal = (await shop.post(`/api/shop/penalties/${p.id}/appeal`).send({ message: 'The photo was our own, here is the invoice.' }).expect(201)).body;
      await shop.post(`/api/shop/penalties/${p.id}/appeal`).send({ message: 'Please look at it again, thank you.' }).expect(409);
      await (await samsung()).post(`/api/shop/penalties/${p.id}/appeal`).send({ message: 'Not my penalty at all, but trying.' }).expect(404);

      const admin = await staff();
      const open = (await admin.get('/api/admin/penalty-appeals').expect(200)).body;
      expect(open.map((a: { id: number }) => a.id)).toContain(appeal.id);
      await admin.post(`/api/admin/penalty-appeals/${appeal.id}/decide`).send({ accept: true, note: 'Invoice checked' }).expect(201);
      await admin.post(`/api/admin/penalty-appeals/${appeal.id}/decide`).send({ accept: false, note: 'x' }).expect(409);
      expect(await points(5)).toBe(0);
      expect((await shop.get('/api/shop/penalties').expect(200)).body.current).toBe(0);
    });

    it('keeps the points when an appeal is refused, and only managers decide', async () => {
      const p = await give(5, 1);
      const appeal = (await (await apple()).post(`/api/shop/penalties/${p.id}/appeal`).send({ message: 'We think this was a mistake.' }).expect(201)).body;
      await (await login('ba_user', '123')).post(`/api/admin/penalty-appeals/${appeal.id}/decide`).send({ accept: true, note: 'x' }).expect(403);
      await (await staff()).post(`/api/admin/penalty-appeals/${appeal.id}/decide`).send({ accept: false, note: 'The listing was a copy' }).expect(201);
      expect(await points(5)).toBe(1);
      const list = (await (await staff()).get('/api/admin/penalties?shopId=5').expect(200)).body;
      expect(list[0].appeal).toMatchObject({ status: 'refused' });
    });
  });
});

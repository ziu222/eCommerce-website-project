import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { ModerationModule } from '../src/moderation/moderation.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('listing moderation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const apple = () => login('apple', 'shop123'); // shop 5
  const staff = () => login('admin1', '123'); // products.manage
  const analyst = () => login('ba_user', '123'); // products.view only
  const customers = ['nguyenvana', 'tranthib', 'levanc'];

  let n = 0;
  const listing = (extra: Record<string, unknown> = {}) => ({
    name: `Studio Monitor Headphones ${++n}`,
    price: 199,
    imageUrl: '../asset/img/placeholder/audio.svg',
    category: 'audio',
    stock: 5,
    description: 'Closed-back studio headphones with a detachable cable and soft ear pads.',
    ...extra,
  });
  const openFlag = (productId: number) => prisma.productFlag.findFirst({ where: { productId, status: 'open' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, ProductsModule, ModerationModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification", "BannedKeyword", "ModerationSetting" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
    await prisma.bannedKeyword.createMany({ data: [{ phrase: 'hang fake', severity: 'block', createdBy: 'test' }, { phrase: 'like new', severity: 'flag', createdBy: 'test' }] });
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  describe('publishing', () => {
    it('puts a clean listing live at once', async () => {
      const res = await (await apple()).post('/api/shop/products').send(listing()).expect(201);
      expect(res.body).toMatchObject({ adminStatus: 'approved', moderationReasons: [] });
      await request(server()).get(`/api/products/${res.body.id}`).expect(200);
      expect(await prisma.moderationCheck.count({ where: { productId: res.body.id, layer: 'rules', outcome: 'clean' } })).toBe(1);
    });

    it('refuses a listing with a blocked keyword, written without accents, and saves nothing', async () => {
      const before = await prisma.product.count();
      const res = await (await apple()).post('/api/shop/products').send(listing({ name: 'Tai nghe HÀNG FAKE loai 1' })).expect(400);
      expect(res.body.reasons[0].code).toBe('keyword');
      expect(await prisma.product.count()).toBe(before);
    });

    it('checks the product page details too, so a banned word cannot hide there', async () => {
      const res = await (await apple()).post('/api/shop/products').send(listing({ details: { overview: 'Same quality as the brand, hang fake loai 1.' } })).expect(400);
      expect(res.body.reasons[0].code).toBe('keyword');
    });

    it('refuses a phone number in the description', async () => {
      const res = await (await apple()).post('/api/shop/products').send(listing({ description: 'Great headphones, call 0912 345 678 for a better price.' })).expect(400);
      expect(res.body.reasons.map((r: { code: string }) => r.code)).toContain('offplatform');
    });

    it('lets a flagged listing go live demoted, after the normal ones, with an open rules flag', async () => {
      const shop = await apple();
      const res = await shop.post('/api/shop/products').send(listing({ description: 'Short text.' })).expect(201);
      expect(res.body.adminStatus).toBe('limited');
      expect(res.body.moderationReasons[0].code).toBe('incomplete');
      expect(await openFlag(res.body.id)).toMatchObject({ source: 'rules' });

      const page = (await request(server()).get('/api/products?category=audio&limit=60').expect(200)).body.items as { id: number; adminStatus: string }[];
      const at = page.findIndex((p) => p.id === res.body.id);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(page.slice(at).every((p) => p.adminStatus === 'limited')).toBe(true);
      expect(page[0]).not.toHaveProperty('moderationReasons');
    });

    it('clears a rules flag once the shop fixes the listing', async () => {
      const shop = await apple();
      const { body } = await shop.post('/api/shop/products').send(listing({ description: 'Short text.' })).expect(201);
      const fixed = await shop.patch(`/api/shop/products/${body.id}`).send({ description: 'Now with a full description of the drivers, cable and ear pads.' }).expect(200);
      expect(fixed.body.adminStatus).toBe('approved');
      expect(await openFlag(body.id)).toBeNull();
    });

    it('keeps the previous state when an edit is blocked', async () => {
      const shop = await apple();
      const { body } = await shop.post('/api/shop/products').send(listing()).expect(201);
      await shop.patch(`/api/shop/products/${body.id}`).send({ description: 'Contact zalo.me/0912345678 for a discount on these headphones.' }).expect(400);
      expect(await prisma.product.findUnique({ where: { id: body.id } })).toMatchObject({ adminStatus: 'approved' });
    });

    it('sends an edit of a suspended product to admin review instead of putting it back live', async () => {
      const shop = await apple();
      const { body } = await shop.post('/api/shop/products').send(listing()).expect(201);
      await (await staff()).post(`/api/admin/products/${body.id}/suspend`).send({ note: 'Fake brand' }).expect(201);
      const edited = await shop.patch(`/api/shop/products/${body.id}`).send({ price: 189 }).expect(200);
      expect(edited.body.adminStatus).toBe('review');
      await request(server()).get(`/api/products/${body.id}`).expect(404);
      expect(await openFlag(body.id)).toMatchObject({ source: 'fallback' });
    });
  });

  describe('customer reports', () => {
    it('demotes a product after three distinct reports, and keeps it demoted through an edit', async () => {
      const { body } = await (await apple()).post('/api/shop/products').send(listing()).expect(201);
      for (const c of customers) await (await login(c, 'user123')).post(`/api/products/${body.id}/report`).send({ reason: 'counterfeit' }).expect(201);
      const row = await prisma.product.findUnique({ where: { id: body.id } });
      expect(row).toMatchObject({ adminStatus: 'limited', rankPenalty: 1 });
      expect(await openFlag(body.id)).toMatchObject({ source: 'report' });

      const edited = await (await apple()).patch(`/api/shop/products/${body.id}`).send({ price: 195 }).expect(200);
      expect(edited.body.adminStatus).toBe('limited');
    });

    it('refuses a second report from the same customer, reports from shops, and unknown products', async () => {
      const { body } = await (await apple()).post('/api/shop/products').send(listing()).expect(201);
      const c = await login('nguyenvana', 'user123');
      await c.post(`/api/products/${body.id}/report`).send({ reason: 'misleading', note: 'Wrong photo' }).expect(201);
      await c.post(`/api/products/${body.id}/report`).send({ reason: 'misleading' }).expect(409);
      await (await apple()).post(`/api/products/${body.id}/report`).send({ reason: 'other' }).expect(403);
      await c.post('/api/products/999999/report').send({ reason: 'other' }).expect(404);
      await c.post(`/api/products/${body.id}/report`).send({ reason: 'nonsense' }).expect(400);
      expect(await prisma.productReport.count({ where: { productId: body.id } })).toBe(1);
    });
  });

  describe('admin queue', () => {
    async function flagged() {
      const { body } = await (await apple()).post('/api/shop/products').send(listing({ description: 'Short text.' })).expect(201);
      return { productId: body.id as number, flagId: (await openFlag(body.id))!.id };
    }

    it('lists open flags with their product for viewers, but only managers decide', async () => {
      const { flagId } = await flagged();
      const ba = await analyst();
      const list = (await ba.get('/api/admin/moderation/flags').expect(200)).body;
      expect(list.items.map((f: { id: number }) => f.id)).toContain(flagId);
      expect(list.items[0].product).toHaveProperty('moderationReasons');
      await ba.post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'dismiss' }).expect(403);
    });

    it('dismiss puts the product back to normal', async () => {
      const { productId, flagId } = await flagged();
      await (await staff()).post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'dismiss' }).expect(201);
      expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({ adminStatus: 'approved', rankPenalty: 0 });
      expect(await prisma.productFlag.findUnique({ where: { id: flagId } })).toMatchObject({ status: 'dismissed', decidedBy: 'admin1' });
    });

    it('violation needs a note, suspends and hides the product, and cannot be decided twice', async () => {
      const { productId, flagId } = await flagged();
      const admin = await staff();
      await admin.post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'violation' }).expect(400);
      await admin.post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'violation', note: 'Fake listing' }).expect(201);
      expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({ adminStatus: 'suspended', adminNote: 'Fake listing' });
      await request(server()).get(`/api/products/${productId}`).expect(404);
      await admin.post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'dismiss' }).expect(409);
      await admin.post('/api/admin/moderation/flags/999999/decide').send({ decision: 'dismiss' }).expect(404);
    });

    it('lets two admins race on one flag with exactly one winner', async () => {
      const { flagId } = await flagged();
      const [a, b] = await Promise.all([staff(), staff()]);
      const codes = (await Promise.all([
        a.post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'dismiss' }),
        b.post(`/api/admin/moderation/flags/${flagId}/decide`).send({ decision: 'minor', note: 'Add a photo' }),
      ])).map((r) => r.status).sort();
      expect(codes).toEqual([201, 409]);
    });

    it('manages keywords and settings', async () => {
      const admin = await staff();
      const kw = (await admin.post('/api/admin/moderation/keywords').send({ phrase: 'Hàng Nhái', severity: 'block' }).expect(201)).body;
      expect(kw.phrase).toBe('hang nhai');
      await admin.post('/api/admin/moderation/keywords').send({ phrase: 'hang nhai', severity: 'flag' }).expect(409);
      await (await apple()).post('/api/shop/products').send(listing({ name: 'Tai nghe hàng nhái' })).expect(400);
      await admin.delete(`/api/admin/moderation/keywords/${kw.id}`).expect(204);
      await (await apple()).post('/api/shop/products').send(listing({ name: 'Tai nghe hàng nhái' })).expect(201);

      const s = (await admin.put('/api/admin/moderation/settings').send({ reportThreshold: 5 }).expect(200)).body;
      expect(s).toMatchObject({ reportThreshold: 5, holdHours: 2 });
      await admin.put('/api/admin/moderation/settings').send({ reportThreshold: 0 }).expect(400);
      await (await analyst()).put('/api/admin/moderation/settings').send({ reportThreshold: 3 }).expect(403);
      await admin.put('/api/admin/moderation/settings').send({ reportThreshold: 3 }).expect(200);
    });
  });
});

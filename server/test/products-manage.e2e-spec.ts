import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('shop and admin product management', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const apple = () => login('apple', 'shop123');
  const samsung = () => login('samsung', 'shop123');
  const staff = () => login('admin1', '123'); // products.view + products.manage
  const analyst = () => login('ba_user', '123'); // products.view only

  const draft = {
    name: 'Test Gadget',
    price: 99.5,
    oldPrice: 120,
    imageUrl: '../asset/img/placeholder/audio.svg',
    category: 'audio',
    stock: 10,
    description: 'A small wireless gadget used by the automated tests.',
    specs: { Battery: '10h' },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, ProductsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE',
    );
    await runSeed(prisma);
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  describe('shop endpoints', () => {
    it('creates a product owned by the logged-in shop that goes live once the automatic check passes', async () => {
      const res = await (await apple()).post('/api/shop/products').send(draft).expect(201);
      expect(res.body).toMatchObject({ name: 'Test Gadget', shopId: 5, adminStatus: 'approved', price: 99.5, moderationReasons: [] });
      await request(server()).get(`/api/products/${res.body.id}`).expect(200);
    });

    it('saves the product page details and shows them publicly, refusing a malformed block', async () => {
      const details = {
        overview: 'A compact gadget for long trips.',
        features: [{ title: 'Long battery', body: 'Lasts a full day of use.', icon: 'battery_charging_full' }],
        specGroups: [{ group: 'Battery', items: [['Life', 'up to 20 h']] }],
        inTheBox: ['Gadget', 'USB-C cable'],
      };
      const shop = await apple();
      const res = await shop.post('/api/shop/products').send({ ...draft, details }).expect(201);
      expect(res.body.details).toEqual(details);
      expect((await request(server()).get(`/api/products/${res.body.id}`).expect(200)).body.details).toEqual(details);
      await shop.post('/api/shop/products').send({ ...draft, details: { features: [{ title: 'x', body: 'y', icon: 'rocket' }] } }).expect(400);
      await shop.post('/api/shop/products').send({ ...draft, details: { inTheBox: Array(11).fill('cable') } }).expect(400);
    });

    it('refuses fields a shop must not set and invalid values', async () => {
      const shop = await apple();
      await shop.post('/api/shop/products').send({ ...draft, adminStatus: 'approved' }).expect(400);
      await shop.post('/api/shop/products').send({ ...draft, shopId: 6 }).expect(400);
      await shop.post('/api/shop/products').send({ ...draft, price: -1 }).expect(400);
      await shop.post('/api/shop/products').send({ ...draft, price: 0 }).expect(400);
      await shop.post('/api/shop/products').send({ ...draft, stock: -3 }).expect(400);
      await shop.post('/api/shop/products').send({ ...draft, category: 'furniture' }).expect(400);
    });

    it('accepts only https or site-asset image links', async () => {
      const shop = await apple();
      for (const imageUrl of ['javascript:alert(1)', 'http://example.com/a.png', 'data:image/png;base64,AAAA', '//example.com/a.png', '../etc/passwd', 'a b.png']) {
        await shop.post('/api/shop/products').send({ ...draft, imageUrl }).expect(400);
      }
      await shop.post('/api/shop/products').send({ ...draft, imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }).expect(201);
      await shop.post('/api/shop/products').send({ ...draft, imageUrl: '../asset/img/placeholder/audio.svg' }).expect(201);
    });

    it('lists only its own products, in any status', async () => {
      const res = await (await samsung()).get('/api/shop/products').expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((p: { shopId: number }) => p.shopId === 6)).toBe(true);
    });

    it('cannot edit or delete another shop\'s product', async () => {
      await (await samsung()).patch('/api/shop/products/1').send({ price: 1 }).expect(404);
      await (await samsung()).delete('/api/shop/products/1').expect(404);
      expect((await prisma.product.findUnique({ where: { id: 1 } }))?.price.toString()).toBe('1199');
    });

    it('checks an edited product again and keeps it live when it still passes', async () => {
      await (await apple()).patch('/api/shop/products/1').send({ price: 1150 }).expect(200);
      const row = await prisma.product.findUnique({ where: { id: 1 } });
      expect(row).toMatchObject({ adminStatus: 'approved', reviewedAt: null });
      expect(row?.price.toString()).toBe('1150');
      await request(server()).get('/api/products/1').expect(200);
    });

    it('deletes an unsold product but not one that has orders', async () => {
      const shop = await apple();
      const created = await shop.post('/api/shop/products').send(draft).expect(201);
      await shop.delete(`/api/shop/products/${created.body.id}`).expect(204);
      await shop.delete('/api/shop/products/1').expect(409); // product 1 is in seeded order 1
    });

    it('is closed to customers and guests', async () => {
      await request(server()).get('/api/shop/products').expect(401);
      await (await login('nguyenvana', 'user123')).get('/api/shop/products').expect(403);
    });
  });

  describe('admin endpoints', () => {
    let pendingId: number;

    beforeAll(async () => {
      const row = await prisma.product.create({
        data: { shopId: 5, name: 'Review Me', price: '50', imageUrl: 'x', category: 'audio', adminStatus: 'pending' },
      });
      pendingId = row.id;
    });

    it('lets a viewer list every status and read stats, but not review', async () => {
      const ba = await analyst();
      const res = await ba.get('/api/admin/products?status=pending').expect(200);
      expect(res.body.items.every((p: { adminStatus: string }) => p.adminStatus === 'pending')).toBe(true);
      expect(res.body.items.map((p: { id: number }) => p.id)).toContain(pendingId);
      const stats = (await ba.get('/api/admin/products/stats').expect(200)).body;
      expect(stats.total).toBeGreaterThan(139);
      expect(stats.rejected).toBe(2);
      await ba.post(`/api/admin/products/${pendingId}/review`).send({ decision: 'approved' }).expect(403);
    });

    it('requires a login with product permissions', async () => {
      await request(server()).get('/api/admin/products').expect(401);
      await (await login('apple', 'shop123')).get('/api/admin/products').expect(403);
      await (await login('hr_user', '123')).get('/api/admin/products').expect(403);
    });

    it('approves a pending product, records the reviewer and makes it public', async () => {
      await (await staff()).post(`/api/admin/products/${pendingId}/review`).send({ decision: 'approved' }).expect(201);
      const row = await prisma.product.findUnique({ where: { id: pendingId } });
      expect(row).toMatchObject({ adminStatus: 'approved', reviewedBy: 'admin1' });
      expect(row?.reviewedAt).toBeInstanceOf(Date);
      await request(server()).get(`/api/products/${pendingId}`).expect(200);
    });

    it('requires a note to reject, and only pending products can be reviewed', async () => {
      const row = await prisma.product.create({
        data: { shopId: 5, name: 'Reject Me', price: '50', imageUrl: 'x', category: 'audio', adminStatus: 'pending' },
      });
      const admin = await staff();
      await admin.post(`/api/admin/products/${row.id}/review`).send({ decision: 'rejected' }).expect(400);
      await admin.post(`/api/admin/products/${row.id}/review`).send({ decision: 'rejected', note: '   ' }).expect(400);
      await admin.post(`/api/admin/products/${row.id}/review`).send({ decision: 'rejected', note: 'Blurry photos' }).expect(201);
      expect((await prisma.product.findUnique({ where: { id: row.id } }))?.adminNote).toBe('Blurry photos');
      await admin.post(`/api/admin/products/${row.id}/review`).send({ decision: 'approved' }).expect(409);
      await admin.post(`/api/admin/products/${row.id}/review`).send({ decision: 'banana' }).expect(400);
    });

    it('suspends an approved product with a note, hides it, and restores it', async () => {
      const admin = await staff();
      await admin.post('/api/admin/products/2/suspend').send({}).expect(400);
      await admin.post('/api/admin/products/2/suspend').send({ note: 'Counterfeit report' }).expect(201);
      await request(server()).get('/api/products/2').expect(404);
      await admin.post('/api/admin/products/2/suspend').send({ note: 'again' }).expect(409);
      await admin.post('/api/admin/products/2/restore').send({}).expect(201);
      expect(await prisma.product.findUnique({ where: { id: 2 } })).toMatchObject({ adminStatus: 'approved', adminNote: '' });
      await request(server()).get('/api/products/2').expect(200);
      await admin.post('/api/admin/products/2/restore').send({}).expect(409);
    });

    it('answers 404 for an unknown product', async () => {
      await (await staff()).post('/api/admin/products/999999/restore').send({}).expect(404);
    });
  });
});

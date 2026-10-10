import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

describe('public product endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();
  const list = (query = '') => request(server()).get(`/api/products${query}`);

  async function allIds(query = ''): Promise<number[]> {
    const ids: number[] = [];
    for (let page = 1; ; page++) {
      const res = await list(`?limit=60&page=${page}${query}`).expect(200);
      ids.push(...res.body.items.map((p: { id: number }) => p.id));
      if (ids.length >= res.body.total) return ids;
    }
  }

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

  it('lists approved products with pagination metadata and numeric prices', async () => {
    const res = await list().expect(200);
    expect(res.body).toMatchObject({ total: 137, page: 1, limit: 24 });
    expect(res.body.items).toHaveLength(24);
    const first = res.body.items[0];
    expect(typeof first.price).toBe('number');
    expect(first).toMatchObject({ id: 1, name: 'iPhone 15 Pro Max', price: 1199, oldPrice: 1499 });
    expect(first.shop).toEqual({ id: 5, shopName: 'Apple Store' });
  });

  it('never returns rejected, pending or suspended products', async () => {
    const ids = await allIds();
    expect(ids).toHaveLength(137);
    expect(ids).not.toContain(12);
    expect(ids).not.toContain(18);
    await prisma.product.update({ where: { id: 4 }, data: { adminStatus: 'suspended' } });
    await prisma.product.update({ where: { id: 5 }, data: { adminStatus: 'pending' } });
    const after = await allIds();
    expect(after).not.toContain(4);
    expect(after).not.toContain(5);
    await prisma.product.updateMany({ where: { id: { in: [4, 5] } }, data: { adminStatus: 'approved' } });
  });

  it('hides products of a shop that is not active', async () => {
    const product = await prisma.product.create({
      data: { shopId: 11, name: 'Ghost Phone', price: '10', imageUrl: 'x', category: 'smartphone', adminStatus: 'approved' },
    });
    expect(await allIds()).not.toContain(product.id);
    await request(server()).get(`/api/products/${product.id}`).expect(404);
  });

  it('filters by category and by case-insensitive name search', async () => {
    const cameras = await list('?category=cameras&limit=60').expect(200);
    expect(cameras.body.items.length).toBeGreaterThan(10);
    expect(cameras.body.items.every((p: { category: string }) => p.category === 'cameras')).toBe(true);
    const search = await list('?q=IPHONE%2017').expect(200);
    const names: string[] = search.body.items.map((p: { name: string }) => p.name);
    expect(names).toContain('iPhone 17 Pro Max');
    expect(names.every((n) => n.toLowerCase().includes('iphone 17'))).toBe(true);
  });

  it('filters by price range', async () => {
    const res = await list('?minPrice=100&maxPrice=200&limit=60').expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((p: { price: number }) => p.price >= 100 && p.price <= 200)).toBe(true);
  });

  it('sorts by price in both directions', async () => {
    const asc = (await list('?sort=price_asc&limit=60').expect(200)).body.items.map((p: { price: number }) => p.price);
    const desc = (await list('?sort=price_desc&limit=60').expect(200)).body.items.map((p: { price: number }) => p.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it('pages without overlap', async () => {
    const one = (await list('?limit=10&page=1').expect(200)).body.items.map((p: { id: number }) => p.id);
    const two = (await list('?limit=10&page=2').expect(200)).body.items.map((p: { id: number }) => p.id);
    expect(one.filter((id: number) => two.includes(id))).toEqual([]);
  });

  it('rejects out-of-range and malformed query values', async () => {
    await list('?limit=500').expect(400);
    await list('?limit=0').expect(400);
    await list('?page=0').expect(400);
    await list('?sort=cheapest').expect(400);
    await list('?minPrice=abc').expect(400);
    await list('?color=red').expect(400);
  });

  it('returns product detail with specs, and 404 for hidden or unknown ids', async () => {
    const res = await request(server()).get('/api/products/30').expect(200);
    expect(res.body.id).toBe(30);
    expect(res.body.specs).toBeTypeOf('object');
    await request(server()).get('/api/products/12').expect(404);
    await request(server()).get('/api/products/999999').expect(404);
    await request(server()).get('/api/products/abc').expect(400);
  });

  it('counts visible products per category', async () => {
    const res = await request(server()).get('/api/products/categories').expect(200);
    const total = res.body.reduce((s: number, c: { count: number }) => s + c.count, 0);
    expect(total).toBe(137);
    expect(res.body.map((c: { category: string }) => c.category).sort()).toEqual(
      ['audio', 'cameras', 'gaming', 'laptops', 'smartphone', 'wearables'],
    );
  });
});

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';
import { detectImageType } from '../src/uploads/image-type.js';
import { UploadsModule } from '../src/uploads/uploads.module.js';
import { UploadsService } from '../src/uploads/uploads.service.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);

describe('detectImageType', () => {
  it('recognises png, jpeg and webp by their first bytes', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(WEBP)).toBe('image/webp');
  });

  it('rejects everything else, including scripts and svg', () => {
    expect(detectImageType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from('RIFF....WAVE'))).toBeNull();
  });
});

describe('image upload', () => {
  let app: INestApplication;
  const uploaded: Buffer[] = [];
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const shop = () => login('apple', 'shop123');
  const staff = () => login('admin1', '123'); // products.manage
  const analyst = () => login('ba_user', '123'); // products.view only

  async function build(overrideStore: boolean) {
    const builder = Test.createTestingModule({ imports: [PrismaModule, AuthModule, UploadsModule] });
    if (overrideStore) {
      builder.overrideProvider(UploadsService).useValue({
        upload: async (buffer: Buffer) => {
          uploaded.push(buffer);
          return 'https://res.cloudinary.com/demo/image/upload/ecshop/products/fake.jpg';
        },
      });
    }
    const moduleRef = await builder.compile();
    const instance = moduleRef.createNestApplication();
    configureApp(instance);
    await instance.init();
    await moduleRef.get(PrismaService).$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE');
    await runSeed(moduleRef.get(PrismaService));
    return instance;
  }

  describe('with a storage backend', () => {
    beforeAll(async () => {
      app = await build(true);
    }, 120000);

    afterAll(async () => {
      await app.close();
    });

    it('stores a valid image and returns its url', async () => {
      const res = await (await shop()).post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(201);
      expect(res.body).toEqual({ url: 'https://res.cloudinary.com/demo/image/upload/ecshop/products/fake.jpg' });
      expect(uploaded.at(-1)?.equals(PNG)).toBe(true);
      await (await shop()).post('/api/uploads/image').attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(201);
      await (await shop()).post('/api/uploads/image').attach('file', WEBP, { filename: 'a.webp', contentType: 'image/webp' }).expect(201);
    });

    it('lets an admin with product management upload, but not a read-only admin', async () => {
      await (await staff()).post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(201);
      await (await analyst()).post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(403);
    });

    it('is closed to guests and customers', async () => {
      await request(server()).post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(401);
      await (await login('nguyenvana', 'user123')).post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(403);
    });

    it('refuses files that only pretend to be images', async () => {
      const before = uploaded.length;
      const agent = await shop();
      await agent.post('/api/uploads/image').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' }).expect(400);
      await agent.post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'text/plain' }).expect(400);
      await agent.post('/api/uploads/image').attach('file', PNG, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(400); // png bytes, jpeg label
      await agent.post('/api/uploads/image').attach('file', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/svg+xml' }).expect(400);
      expect(uploaded.length).toBe(before);
    });

    it('refuses an upload without a file, or with a file over 2 MB', async () => {
      const agent = await shop();
      await agent.post('/api/uploads/image').send({}).expect(400);
      const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10)]);
      await agent.post('/api/uploads/image').attach('file', big, { filename: 'big.png', contentType: 'image/png' }).expect(413);
    });
  });

  describe('without Cloudinary configured', () => {
    const saved = process.env.CLOUDINARY_URL;

    beforeAll(async () => {
      delete process.env.CLOUDINARY_URL;
      app = await build(false);
    }, 120000);

    afterAll(async () => {
      if (saved) process.env.CLOUDINARY_URL = saved;
      await app.close();
    });

    it('says so instead of failing obscurely', async () => {
      const res = await (await shop()).post('/api/uploads/image').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(503);
      expect(res.body.message).toBe('Image uploads are not configured');
    });
  });
});

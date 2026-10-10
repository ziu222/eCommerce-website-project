import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';

describe('database seed', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Product", "Order", "Coupon", "Notification" RESTART IDENTITY CASCADE',
    );
    await runSeed(prisma);
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads legacy and modern products, keeping legacy ids 1..28', async () => {
    expect(await prisma.product.count()).toBeGreaterThanOrEqual(125);
    const legacy = await prisma.product.findMany({ where: { id: { lte: 28 } }, select: { id: true } });
    expect(legacy).toHaveLength(28);
  });

  it('is idempotent when run twice', async () => {
    const counts = async () => [await prisma.product.count(), await prisma.user.count(), await prisma.order.count()];
    const before = await counts();
    await runSeed(prisma);
    expect(await counts()).toEqual(before);
  }, 120000);

  it('stores argon2 hashes, never the plaintext password', async () => {
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(15);
    expect(users.every((u) => u.passwordHash.startsWith('$argon2'))).toBe(true);
    expect(users.find((u) => u.username === 'admin1')?.adminRole).toBe('staff');
    expect(users.find((u) => u.username === 'hr_user')?.adminRole).toBe('hr');
  });

  it('seeds orders with items and history, and the shop coupon on a real shop', async () => {
    const order = await prisma.order.findUnique({ where: { id: 1 }, include: { items: true, history: true } });
    expect(order?.items).toHaveLength(2);
    expect(order?.total.toString()).toBe('1528');
    expect(order?.history).toHaveLength(1);
    const coupon = await prisma.coupon.findUnique({ where: { code: 'SHOP10' } });
    expect(coupon?.shopId).toBe(5);
  });

  it('maps broadcast notifications to a null target and keeps per-user read state', async () => {
    const broadcast = await prisma.notification.findUnique({ where: { id: 1001 } });
    expect(broadcast?.targetId).toBeNull();
    expect(await prisma.notificationRead.count()).toBeGreaterThan(0);
  });

  it('moves sequences past seeded ids so new rows do not collide', async () => {
    const maxId = (await prisma.product.aggregate({ _max: { id: true } }))._max.id!;
    const shop = await prisma.user.findFirstOrThrow({ where: { role: 'shop' } });
    const created = await prisma.product.create({
      data: { shopId: shop.id, name: 'Sequence probe', price: '1', imageUrl: 'x', category: 'audio' },
    });
    expect(created.id).toBe(maxId + 1);
  });
});

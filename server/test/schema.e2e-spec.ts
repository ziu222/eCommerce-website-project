import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('prisma schema', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRaw`TRUNCATE "User" RESTART IDENTITY CASCADE`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores an order with items and reads relations back', async () => {
    const customer = await prisma.user.create({
      data: { name: 'C', username: 'c1', email: 'c1@x.io', passwordHash: 'h', role: 'customer' },
    });
    const shop = await prisma.user.create({
      data: { name: 'S', username: 's1', email: 's1@x.io', passwordHash: 'h', role: 'shop', shopStatus: 'active' },
    });
    const product = await prisma.product.create({
      data: { shopId: shop.id, name: 'Phone', price: '799.99', imageUrl: 'x.png', category: 'smartphone', stock: 3 },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        shopId: shop.id,
        subtotal: '799.99',
        total: '799.99',
        paymentMethod: 'cod',
        items: { create: [{ productId: product.id, qty: 1, price: '799.99' }] },
      },
      include: { items: { include: { product: true } } },
    });
    expect(order.items[0].product.name).toBe('Phone');
    expect(order.total.toString()).toBe('799.99');
  });

  it('rejects a duplicate email', async () => {
    await expect(
      prisma.user.create({
        data: { name: 'D', username: 'other', email: 'c1@x.io', passwordHash: 'h', role: 'customer' },
      }),
    ).rejects.toThrow();
  });
});

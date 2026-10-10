import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { Roles } from '../src/auth/roles.decorator.js';
import { RequirePermission } from '../src/auth/permissions.decorator.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

@Controller('probe')
class ProbeController {
  @Get('admin')
  @Roles('admin')
  admin() {
    return { ok: true };
  }

  @Get('shop-or-admin')
  @Roles('shop', 'admin')
  shopOrAdmin() {
    return { ok: true };
  }

  @Get('manage-orders')
  @RequirePermission('orders.manage')
  manageOrders() {
    return { ok: true };
  }
}

describe('role and permission guards', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  async function login(identifier: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password: 'secret1' }).expect(200);
    return agent;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "User" RESTART IDENTITY CASCADE');
    const passwordHash = await argon2.hash('secret1');
    const base = { passwordHash, name: 'U' };
    await prisma.user.createMany({
      data: [
        { ...base, username: 'cust', email: 'c@x.io', role: 'customer' },
        { ...base, username: 'shop', email: 's@x.io', role: 'shop', shopStatus: 'active' },
        { ...base, username: 'pm', email: 'pm@x.io', role: 'admin', adminRole: 'pm' },
        { ...base, username: 'ba', email: 'ba@x.io', role: 'admin', adminRole: 'ba' },
        { ...base, username: 'root', email: 'root@x.io', role: 'admin', adminRole: 'super_admin' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 401 without a session and 403 for the wrong role', async () => {
    await request(server()).get('/api/probe/admin').expect(401);
    await (await login('cust')).get('/api/probe/admin').expect(403);
    await (await login('shop')).get('/api/probe/admin').expect(403);
    await (await login('root')).get('/api/probe/admin').expect(200);
  });

  it('accepts any of several allowed roles', async () => {
    await (await login('shop')).get('/api/probe/shop-or-admin').expect(200);
    await (await login('cust')).get('/api/probe/shop-or-admin').expect(403);
  });

  it('checks admin permissions from the role table', async () => {
    await (await login('pm')).get('/api/probe/manage-orders').expect(200);
    await (await login('root')).get('/api/probe/manage-orders').expect(200);
    await (await login('ba')).get('/api/probe/manage-orders').expect(403);
    await (await login('cust')).get('/api/probe/manage-orders').expect(403);
    await request(server()).get('/api/probe/manage-orders').expect(401);
  });
});

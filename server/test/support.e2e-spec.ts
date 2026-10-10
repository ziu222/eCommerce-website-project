import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';
import { SupportModule } from '../src/support/support.module.js';

describe('support conversations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const customer = (n: 'nguyenvana' | 'tranthib' | 'levanc' = 'nguyenvana') => login(n, 'user123'); // ids 2, 3, 4
  const agent = () => login('cskh_user', '123'); // CSKH: support.view + support.reply
  const superAdmin = () => login('admin2', '123');

  const open = async (who = customer(), message = 'My phone arrived scratched, what can I do?', extra: Record<string, unknown> = {}) => {
    const res = await (await who).post('/api/support/threads').send({ message, ...extra }).expect(201);
    return res.body as { id: number; status: string };
  };

  beforeAll(async () => {
    process.env.SUPPORT_RATE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, SupportModule] }).compile();
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

  describe('leaving a message', () => {
    it('starts a conversation for a signed-in customer, with the bot chat kept for the staff', async () => {
      const transcript = [
        { role: 'user', content: 'Can I return it?' },
        { role: 'assistant', content: 'Within 30 days.' },
      ];
      const created = await open(customer('levanc'), 'It arrived scratched', { transcript });
      expect(created).toMatchObject({ status: 'open', subject: 'It arrived scratched' });

      const row = await prisma.supportThread.findUniqueOrThrow({ where: { id: created.id }, include: { messages: true } });
      expect(row.customerId).toBe(4);
      expect(row.messages).toHaveLength(1);
      expect(row.messages[0]).toMatchObject({ authorType: 'customer', authorId: 4, body: 'It arrived scratched' });
      expect(JSON.parse(row.botTranscript!)).toEqual(transcript);
    });

    it('is only for customers who are signed in', async () => {
      await request(server()).post('/api/support/threads').send({ message: 'hello' }).expect(401);
      await (await login('apple', 'shop123')).post('/api/support/threads').send({ message: 'hello' }).expect(403);
      await (await agent()).post('/api/support/threads').send({ message: 'hello' }).expect(403);
    });

    it('validates the message, the transcript and unknown fields', async () => {
      const c = await customer('tranthib');
      await c.post('/api/support/threads').send({ message: '' }).expect(400);
      await c.post('/api/support/threads').send({ message: '   ' }).expect(400);
      await c.post('/api/support/threads').send({ message: 'x'.repeat(2001) }).expect(400);
      await c.post('/api/support/threads').send({ message: 'hi', status: 'closed' }).expect(400);
      await c.post('/api/support/threads').send({ message: 'hi', customerId: 2 }).expect(400);
      await c.post('/api/support/threads').send({ message: 'hi', transcript: [{ role: 'system', content: 'x' }] }).expect(400);
      await c.post('/api/support/threads').send({ message: 'hi', transcript: Array.from({ length: 11 }, () => ({ role: 'user', content: 'x' })) }).expect(400);
    });

    it('limits how many conversations a customer can have open at once', async () => {
      const c = customer('tranthib');
      for (let i = 0; i < 5; i++) await open(c, `question ${i}`);
      await (await c).post('/api/support/threads').send({ message: 'one more' }).expect(409);
    });
  });

  describe('the customer view', () => {
    it('lists only their own conversations, newest activity first', async () => {
      const mine = await open(customer('nguyenvana'), 'Where do I find my invoice?');
      const list = (await (await customer('nguyenvana')).get('/api/support/threads').expect(200)).body;
      expect(list.map((t: { id: number }) => t.id)).toContain(mine.id);
      expect(list.every((t: { customerId?: number }) => t.customerId === undefined)).toBe(true);
      expect(list[0]).toMatchObject({ id: mine.id, status: 'open', unread: 0 });
      const others = (await (await customer('levanc')).get('/api/support/threads').expect(200)).body;
      expect(others.map((t: { id: number }) => t.id)).not.toContain(mine.id);
    });

    it('hides other customers\' conversations', async () => {
      const mine = await open(customer('nguyenvana'), 'private question');
      const intruder = await customer('levanc');
      await intruder.get(`/api/support/threads/${mine.id}`).expect(404);
      await intruder.post(`/api/support/threads/${mine.id}/messages`).send({ body: 'hi' }).expect(404);
    });
  });

  describe('staff replies', () => {
    it('shows waiting conversations to CSKH and super admin, with the customer and the bot chat', async () => {
      const created = await open(customer('nguyenvana'), 'Need help with my refund', { transcript: [{ role: 'user', content: 'refund?' }, { role: 'assistant', content: 'See refunds.' }] });
      const list = (await (await agent()).get('/api/admin/support/threads?status=open').expect(200)).body;
      const row = list.find((t: { id: number }) => t.id === created.id);
      expect(row).toMatchObject({ status: 'open', subject: 'Need help with my refund', customer: { id: 2, name: 'Nguyen Van A' } });
      expect(row.lastMessage).toMatchObject({ body: 'Need help with my refund', authorType: 'customer' });
      expect(list.every((t: { status: string }) => t.status === 'open')).toBe(true);

      const detail = (await (await superAdmin()).get(`/api/admin/support/threads/${created.id}`).expect(200)).body;
      expect(detail.customer).toMatchObject({ id: 2, email: 'nguyenvana@gmail.com' });
      expect(detail.botTranscript).toEqual([{ role: 'user', content: 'refund?' }, { role: 'assistant', content: 'See refunds.' }]);
      expect(detail.messages).toHaveLength(1);
    });

    it('is closed to everyone without support permissions', async () => {
      await request(server()).get('/api/admin/support/threads').expect(401);
      for (const [who, pass] of [['pm_user', '123'], ['ba_user', '123'], ['hr_user', '123'], ['admin1', '123']] as const) {
        await (await login(who, pass)).get('/api/admin/support/threads').expect(403);
      }
      await (await customer()).get('/api/admin/support/threads').expect(403);
      await (await login('apple', 'shop123')).get('/api/admin/support/threads').expect(403);
    });

    it('moves the conversation to answered when staff reply, and the customer sees one unread reply', async () => {
      const c = await customer('nguyenvana');
      const created = await open(Promise.resolve(c), 'Question about warranty');
      const reply = await (await agent()).post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'Happy to help. Which product?' }).expect(201);
      expect(reply.body).toMatchObject({ authorType: 'agent', body: 'Happy to help. Which product?' });

      const row = await prisma.supportThread.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.status).toBe('answered');
      expect(row.assignedToId).toBe(15);

      const list = (await c.get('/api/support/threads').expect(200)).body;
      expect(list.find((t: { id: number }) => t.id === created.id)).toMatchObject({ status: 'answered', unread: 1 });
      expect((await c.get('/api/support/unread').expect(200)).body.count).toBeGreaterThanOrEqual(1);

      const opened = (await c.get(`/api/support/threads/${created.id}`).expect(200)).body;
      expect(opened.messages.map((m: { authorType: string }) => m.authorType)).toEqual(['customer', 'agent']);
      expect(opened.messages[1]).toMatchObject({ authorName: 'Support Agent' });
      expect((await c.get('/api/support/threads').expect(200)).body.find((t: { id: number }) => t.id === created.id).unread).toBe(0);
    });

    it('reopens the conversation when the customer answers back', async () => {
      const c = await customer('nguyenvana');
      const created = await open(Promise.resolve(c), 'Another question');
      await (await agent()).post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'Tell me more' }).expect(201);
      await c.post(`/api/support/threads/${created.id}/messages`).send({ body: 'It is the Galaxy S25' }).expect(201);
      expect((await prisma.supportThread.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('open');
    });

    it('closes a conversation, after which neither side can add to it', async () => {
      const c = await customer('nguyenvana');
      const created = await open(Promise.resolve(c), 'Last question');
      const staff = await agent();
      await staff.post(`/api/admin/support/threads/${created.id}/close`).expect(201);
      expect((await prisma.supportThread.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('closed');
      await c.post(`/api/support/threads/${created.id}/messages`).send({ body: 'wait' }).expect(409);
      await staff.post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'late reply' }).expect(409);
      await staff.post(`/api/admin/support/threads/${created.id}/close`).expect(409);
      await staff.get(`/api/admin/support/threads/99999`).expect(404);
    });

    it('validates staff replies', async () => {
      const created = await open(customer('levanc'), 'Validate me');
      const staff = await agent();
      await staff.post(`/api/admin/support/threads/${created.id}/messages`).send({ body: '' }).expect(400);
      await staff.post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'x'.repeat(2001) }).expect(400);
      await staff.post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'ok', authorType: 'customer' }).expect(400);
    });

    it('filters by status and counts what is waiting', async () => {
      const staff = await agent();
      const answered = (await staff.get('/api/admin/support/threads?status=answered').expect(200)).body;
      expect(answered.every((t: { status: string }) => t.status === 'answered')).toBe(true);
      const closed = (await staff.get('/api/admin/support/threads?status=closed').expect(200)).body;
      expect(closed.length).toBeGreaterThan(0);
      await staff.get('/api/admin/support/threads?status=banana').expect(400);
      const summary = (await staff.get('/api/admin/support/summary').expect(200)).body;
      const open = (await staff.get('/api/admin/support/threads?status=open').expect(200)).body;
      expect(summary.open).toBe(open.length);
      expect(summary.answered).toBe(answered.length);
    });
  });

  describe('keeping up to date', () => {
    it('returns only newer messages when asked with after=', async () => {
      const c = await customer('nguyenvana');
      const created = await open(Promise.resolve(c), 'Polling check');
      const staff = await agent();
      await staff.post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'first reply' }).expect(201);
      const all = (await c.get(`/api/support/threads/${created.id}`).expect(200)).body.messages;
      expect(all).toHaveLength(2);

      await staff.post(`/api/admin/support/threads/${created.id}/messages`).send({ body: 'second reply' }).expect(201);
      const fresh = (await c.get(`/api/support/threads/${created.id}?after=${all[1].id}`).expect(200)).body.messages;
      expect(fresh.map((m: { body: string }) => m.body)).toEqual(['second reply']);
      const none = (await c.get(`/api/support/threads/${created.id}?after=${fresh[0].id}`).expect(200)).body.messages;
      expect(none).toEqual([]);
      const staffView = (await staff.get(`/api/admin/support/threads/${created.id}?after=${all[0].id}`).expect(200)).body.messages;
      expect(staffView.map((m: { body: string }) => m.body)).toEqual(['first reply', 'second reply']);
    });

    it('reports whether staff are available from their heartbeats', async () => {
      const guest = request(server());
      expect((await guest.get('/api/support/availability').expect(200)).body).toEqual({ online: false });
      await (await agent()).post('/api/admin/support/presence').expect(204);
      expect((await guest.get('/api/support/availability').expect(200)).body).toEqual({ online: true });
      await (await login('pm_user', '123')).post('/api/admin/support/presence').expect(403);
    });
  });
});

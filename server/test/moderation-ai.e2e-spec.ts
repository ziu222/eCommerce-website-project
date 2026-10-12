import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { AiGate } from '../src/moderation/ai-gate.js';
import { AiReviewer, AiUnavailable, type AiVerdict } from '../src/moderation/ai-reviewer.js';
import { ModerationModule } from '../src/moderation/moderation.module.js';
import { ModerationService } from '../src/moderation/moderation.service.js';
import { ModerationWorker } from '../src/moderation/moderation.worker.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductsModule } from '../src/products/products.module.js';
import { runSeed } from '../src/seed/seed.js';
import { configureApp } from '../src/setup.js';

// The real OpenAI is never called: the reviewer is replaced and answers what each test asks for.
describe('listing moderation with the AI check', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let worker: ModerationWorker;
  let gate: AiGate;
  const alerts = (title: string) => prisma.notification.count({ where: { type: 'ai_alert', title } });
  const server = () => app.getHttpServer();
  const savedKey = process.env.OPENAI_API_KEY;

  let answer: () => Promise<Omit<AiVerdict, 'model' | 'latencyMs' | 'imageChecked'>> = async () => ({ verdict: 'clean', reasons: [], inputTokens: 600, outputTokens: 30 });
  const reviewer = { review: vi.fn(async () => ({ ...(await answer()), model: 'test', latencyMs: 5, imageChecked: false })) };
  const failing = async (): Promise<never> => {
    throw new AiUnavailable('down');
  };

  async function login(identifier: string, password: string) {
    const agent = request.agent(server());
    await agent.post('/api/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }
  const apple = () => login('apple', 'shop123');
  const staff = () => login('admin1', '123');
  let n = 0;
  const listing = () => ({
    name: `Portable Speaker Model ${++n}`,
    price: 149,
    imageUrl: '../asset/img/placeholder/audio.svg',
    category: 'audio',
    stock: 5,
    description: 'Waterproof portable speaker with a twelve hour battery and a carry strap.',
  });
  const settings = async (patch: Record<string, unknown>) => (await staff()).put('/api/admin/moderation/settings').send(patch).expect(200);
  const drain = async () => {
    while (await worker.tick());
  };
  const create = async () => (await (await apple()).post('/api/shop/products').send(listing()).expect(201)).body as { id: number; adminStatus: string };
  const product = (id: number) => prisma.product.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, AuthModule, ProductsModule, ModerationModule] })
      .overrideProvider(AiReviewer)
      .useValue(reviewer)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    worker = moduleRef.get(ModerationWorker);
    gate = moduleRef.get(AiGate);
    worker.retryDelaysMs = [0, 0];
    // the tests drive the worker themselves
    moduleRef.get(ModerationService).kick = () => {};
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Product", "Order", "Coupon", "Notification", "BannedKeyword", "ModerationSetting", "AiBreaker" RESTART IDENTITY CASCADE');
    await runSeed(prisma);
    await settings({ breakerFailures: 100 });
  }, 120000);

  afterAll(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  });

  it('keeps a new listing hidden while it waits, then publishes it when the AI finds nothing', async () => {
    const p = await create();
    expect(p.adminStatus).toBe('pending');
    await request(server()).get(`/api/products/${p.id}`).expect(404);
    await drain();
    // the photo check is on by default
    expect(reviewer.review).toHaveBeenLastCalledWith(expect.objectContaining({ imageUrl: expect.any(String) }), expect.objectContaining({ checkImage: true }));
    expect(await product(p.id)).toMatchObject({ adminStatus: 'approved', provisional: false });
    const check = await prisma.moderationCheck.findFirstOrThrow({ where: { productId: p.id, layer: 'ai' } });
    expect(check).toMatchObject({ outcome: 'clean', inputTokens: 600, costMicros: 108 });
    expect(await prisma.moderationJob.count({ where: { productId: p.id } })).toBe(0);
  });

  it('demotes a listing the AI suspects, with an ai flag for admins', async () => {
    answer = async () => ({ verdict: 'suspect', reasons: [{ code: 'misleading', message: 'The photo shows a different model.' }], inputTokens: 1, outputTokens: 1 });
    const p = await create();
    await drain();
    expect(await product(p.id)).toMatchObject({ adminStatus: 'limited', rankPenalty: 1 });
    expect(await prisma.productFlag.findFirst({ where: { productId: p.id, status: 'open' } })).toMatchObject({ source: 'ai' });
  });

  it('refuses a listing the AI calls clearly counterfeit', async () => {
    answer = async () => ({ verdict: 'severe', reasons: [{ code: 'counterfeit', message: 'Sold as a copy of a brand.' }], inputTokens: 1, outputTokens: 1 });
    const p = await create();
    await drain();
    expect(await product(p.id)).toMatchObject({ adminStatus: 'rejected' });

    // an admin who finds the AI wrong puts it live
    const flag = await prisma.productFlag.findFirstOrThrow({ where: { productId: p.id, status: 'open' } });
    await (await staff()).post(`/api/admin/moderation/flags/${flag.id}/decide`).send({ decision: 'dismiss' }).expect(201);
    expect(await product(p.id)).toMatchObject({ adminStatus: 'approved' });
  });

  describe('when the AI cannot answer', () => {
    beforeAll(() => {
      answer = failing;
    });

    it('approves a trusted shop provisionally and checks it again once the AI is back', async () => {
      await settings({ trustedMinDays: 0, trustedMinProducts: 0, trustedMaxPrice: 1000 });
      const p = await create();
      await drain();
      expect(await product(p.id)).toMatchObject({ adminStatus: 'approved', provisional: true });
      expect(await prisma.moderationJob.findUnique({ where: { productId: p.id } })).toMatchObject({ trigger: 'recheck' });

      answer = async () => ({ verdict: 'suspect', reasons: [{ code: 'spam', message: 'Keyword stuffing.' }], inputTokens: 1, outputTokens: 1 });
      await prisma.moderationJob.update({ where: { productId: p.id }, data: { nextAttemptAt: new Date() } });
      await drain();
      expect(await product(p.id)).toMatchObject({ adminStatus: 'limited', provisional: false });
      answer = failing;
    });

    it('holds a listing from a shop that is not trusted, then sends it to an admin after the hold time', async () => {
      await settings({ trustedMinProducts: 100000 });
      const p = await create();
      await drain();
      expect(await product(p.id)).toMatchObject({ adminStatus: 'pending' });
      const job = await prisma.moderationJob.findUniqueOrThrow({ where: { productId: p.id } });
      expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

      await prisma.moderationJob.update({ where: { productId: p.id }, data: { nextAttemptAt: new Date(), firstQueuedAt: new Date(Date.now() - 3 * 3_600_000) } });
      await drain();
      expect(await product(p.id)).toMatchObject({ adminStatus: 'review' });
      expect(await prisma.productFlag.findFirst({ where: { productId: p.id, status: 'open' } })).toMatchObject({ source: 'fallback' });
      await request(server()).get(`/api/products/${p.id}`).expect(404);
    });

    it('opens the circuit breaker after repeated failures and reports it on the health endpoint', async () => {
      await settings({ breakerFailures: 2 });
      await create();
      await create();
      await drain();
      const health = (await (await staff()).get('/api/admin/moderation/health').expect(200)).body;
      expect(health).toMatchObject({ ai: 'paused' });
      expect(health.breakerOpenUntil).not.toBeNull();
      expect(health.queueDepth).toBeGreaterThanOrEqual(2);
      // while paused the reviewer is not called at all
      const calls = reviewer.review.mock.calls.length;
      await create();
      await drain();
      expect(reviewer.review.mock.calls.length).toBe(calls);
      expect(await alerts('AI check paused')).toBe(1);
    });

    it('opens the shared breaker once when many failures land at the same time', async () => {
      await prisma.aiBreaker.deleteMany();
      await prisma.notification.deleteMany({ where: { type: 'ai_alert' } });
      await settings({ breakerFailures: 5 });
      await Promise.all(Array.from({ length: 12 }, () => gate.failure()));
      expect(await gate.state()).toBe('paused');
      expect(await alerts('AI check paused')).toBe(1);
      await gate.success();
      expect((await prisma.aiBreaker.findUniqueOrThrow({ where: { id: 1 } })).failures).toBe(0);
    });

    it('lists the AI alerts of the last day for viewers only', async () => {
      await prisma.notification.create({ data: { targetRole: 'admin', type: 'ai_alert', source: 'moderation', sentBy: 'system', title: 'AI budget reached', message: 'old', createdAt: new Date(Date.now() - 2 * 86_400_000) } });
      const body = (await (await login('ba_user', '123')).get('/api/admin/moderation/alerts').expect(200)).body;
      expect(body.items.map((a: { title: string }) => a.title)).toEqual(['AI check paused']);
      await (await apple()).get('/api/admin/moderation/alerts').expect(403);
    });
  });

  it('stops calling the AI once the daily budget is spent', async () => {
    const any = await prisma.product.findFirstOrThrow();
    await prisma.moderationCheck.create({ data: { productId: any.id, layer: 'ai', outcome: 'clean', reasons: [], costMicros: 5_000_000 } });
    const health = (await (await staff()).get('/api/admin/moderation/health').expect(200)).body;
    expect(['budget', 'paused']).toContain(health.ai);
    expect(health.spentTodayUsd).toBeGreaterThanOrEqual(5);
  });

  it('sends the budget alert once a day', async () => {
    await prisma.aiBreaker.deleteMany();
    await prisma.notification.deleteMany({ where: { type: 'ai_alert' } });
    expect(await gate.state()).toBe('budget');
    expect(await gate.state()).toBe('budget');
    expect(await alerts('AI budget reached')).toBe(1);
    await prisma.aiBreaker.update({ where: { id: 1 }, data: { budgetAlertDay: '2000-01-01' } });
    await gate.state();
    expect(await alerts('AI budget reached')).toBe(2);
  });
});

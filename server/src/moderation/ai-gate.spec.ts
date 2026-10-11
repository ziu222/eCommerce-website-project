import { AiGate } from './ai-gate.js';
import { DEFAULT_SETTINGS } from './settings.service.js';

function gate(spentMicros: number, patch: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const prisma = { moderationCheck: { aggregate: vi.fn().mockResolvedValue({ _sum: { costMicros: spentMicros } }) } };
  const settings = { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...patch }) };
  return new AiGate(prisma as never, settings as never);
}

describe('AI gate', () => {
  const saved = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  });

  it('is off without a key or when switched off', async () => {
    expect(await gate(0, { aiEnabled: false }).state()).toBe('off');
    delete process.env.OPENAI_API_KEY;
    expect(await gate(0).state()).toBe('off');
  });

  it('is up under the budget and stops at the budget', async () => {
    expect(await gate(1_999_999).state()).toBe('up');
    expect(await gate(2_000_000).state()).toBe('budget');
  });

  it('opens the breaker after the set number of failures in a row, and a success resets the count', async () => {
    const g = gate(0, { breakerFailures: 3 });
    await g.failure();
    await g.failure();
    g.success();
    await g.failure();
    await g.failure();
    expect(await g.state()).toBe('up');
    await g.failure();
    expect(await g.state()).toBe('paused');
    expect(g.breakerOpenUntil()).toBeInstanceOf(Date);
  });
});

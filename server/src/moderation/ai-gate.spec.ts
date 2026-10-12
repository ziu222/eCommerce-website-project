import { AiGate } from './ai-gate.js';
import { DEFAULT_SETTINGS } from './settings.service.js';

// the breaker itself is shared through Postgres; test/ai-gate.e2e-spec.ts covers it against a real database
function gate(spentMicros: number, patch: Partial<typeof DEFAULT_SETTINGS> = {}, budgetAlreadySent = false) {
  const prisma = {
    moderationCheck: { aggregate: vi.fn().mockResolvedValue({ _sum: { costMicros: spentMicros } }) },
    aiBreaker: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue(budgetAlreadySent ? [] : [{ id: 1 }]),
  };
  const settings = { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...patch }) };
  const alerts = { send: vi.fn() };
  return { g: new AiGate(prisma as never, settings as never, alerts as never), alerts };
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
    expect(await gate(0, { aiEnabled: false }).g.state()).toBe('off');
    delete process.env.OPENAI_API_KEY;
    expect(await gate(0).g.state()).toBe('off');
  });

  it('is up under the budget and stops at the budget, alerting only when the day is claimed', async () => {
    expect(await gate(1_999_999).g.state()).toBe('up');
    const first = gate(2_000_000);
    expect(await first.g.state()).toBe('budget');
    expect(first.alerts.send).toHaveBeenCalledWith('budget', { budgetUsd: 2 });
    const later = gate(2_000_000, {}, true);
    expect(await later.g.state()).toBe('budget');
    expect(later.alerts.send).not.toHaveBeenCalled();
  });
});

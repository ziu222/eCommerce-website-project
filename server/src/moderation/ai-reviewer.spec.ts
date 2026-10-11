import { AiReviewer, AiUnavailable, costMicros } from './ai-reviewer.js';

const listing = { name: 'Studio headphones', description: 'Closed-back headphones.', price: 199, imageUrl: 'x', category: 'audio' };
const opts = { rules: 'No counterfeit goods.', model: 'gpt-4o-mini', timeoutMs: 1000 };

function reply(content: string, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 600, completion_tokens: 40 } }), { status }),
  );
}

describe('AI reviewer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a verdict, keeps known reason codes and counts tokens', async () => {
    const fetch = reply(JSON.stringify({ verdict: 'suspect', reasons: [{ code: 'counterfeit', message: 'Looks like a copy.' }, { code: 'weird', message: 'Odd.' }] }));
    vi.stubGlobal('fetch', fetch);
    const v = await new AiReviewer().review(listing, opts);
    expect(v).toMatchObject({ verdict: 'suspect', inputTokens: 600, outputTokens: 40 });
    expect(v.reasons.map((r) => r.code)).toEqual(['counterfeit', 'other']);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain('<listing>');
    expect(body.messages[1].content).not.toContain('Price');
    expect(costMicros(v)).toBe(114);
  });

  it('refuses an unknown verdict, a reply that is not JSON and an HTTP error', async () => {
    vi.stubGlobal('fetch', reply(JSON.stringify({ verdict: 'maybe', reasons: [] })));
    await expect(new AiReviewer().review(listing, opts)).rejects.toBeInstanceOf(AiUnavailable);
    vi.stubGlobal('fetch', reply('not json'));
    await expect(new AiReviewer().review(listing, opts)).rejects.toBeInstanceOf(AiUnavailable);
    vi.stubGlobal('fetch', reply('{}', 500));
    await expect(new AiReviewer().review(listing, opts)).rejects.toBeInstanceOf(AiUnavailable);
  });

  it('turns a network failure into AiUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(new AiReviewer().review(listing, opts)).rejects.toBeInstanceOf(AiUnavailable);
  });
});

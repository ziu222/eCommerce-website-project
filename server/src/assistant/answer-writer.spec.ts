import { AnswerWriter } from './answer-writer.js';

const policies = [{ slug: 'payment', title: 'Payment', body: 'Pay by cash on delivery or with your wallet. | Thanh toán khi nhận hàng hoặc bằng ví.' }];

function reply(content: string, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));
}

describe('answer writer', () => {
  const saved = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  });

  it('asks gpt-4o-mini with the policies and the earlier turns, and returns the answer and whether the policies cover it', async () => {
    const fetch = reply(JSON.stringify({ answer: 'Không, cửa hàng chưa hỗ trợ trả góp.', covered: false }));
    vi.stubGlobal('fetch', fetch);
    const r = await new AnswerWriter().write('có trả góp không', [{ role: 'assistant', content: 'Xin chào' }, { role: 'user', content: 'hi' }], policies, 'Vietnamese');
    expect(r).toEqual({ text: 'Không, cửa hàng chưa hỗ trợ trả góp.', covered: false });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0].role).toBe('system');
    // a conversation sent to the model starts with a customer turn
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(body.messages.at(-1).content).toContain('<policy title="Payment">');
    expect(body.messages.at(-1).content).toContain('có trả góp không');
    expect(body.messages.at(-1).content).toMatch(/Reply in Vietnamese.$/);
  });

  it('gives up (null) without a key, without policies, on an HTTP error or an unusable reply', async () => {
    vi.stubGlobal('fetch', reply(JSON.stringify({ answer: 'x', covered: true })));
    expect(await new AnswerWriter().write('q', [], [])).toBeNull();
    delete process.env.OPENAI_API_KEY;
    expect(await new AnswerWriter().write('q', [], policies)).toBeNull();
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', reply('{}', 500));
    expect(await new AnswerWriter().write('q', [], policies)).toBeNull();
    vi.stubGlobal('fetch', reply('not json'));
    expect(await new AnswerWriter().write('q', [], policies)).toBeNull();
    vi.stubGlobal('fetch', reply(JSON.stringify({ answer: '  ', covered: true })));
    expect(await new AnswerWriter().write('q', [], policies)).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    expect(await new AnswerWriter().write('q', [], policies)).toBeNull();
  });

  it('stops calling the model once the daily call budget is used', async () => {
    process.env.ASSISTANT_DAILY_LLM_CALLS = '2';
    const fetch = reply(JSON.stringify({ answer: 'ok', covered: true }));
    vi.stubGlobal('fetch', fetch);
    const w = new AnswerWriter();
    await w.write('a', [], policies);
    await w.write('b', [], policies);
    expect(await w.write('c', [], policies)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    delete process.env.ASSISTANT_DAILY_LLM_CALLS;
  });
});

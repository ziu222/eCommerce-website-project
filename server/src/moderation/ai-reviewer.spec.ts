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

  describe('photo check', () => {
    const photo = { ...listing, imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg' };
    const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdict: 'clean', reasons: [] }) } }], usage: { prompt_tokens: 3400, completion_tokens: 20 } }));

    it('sends the photo as a low-detail image when it is an https link', async () => {
      const fetch = vi.fn().mockResolvedValue(ok());
      vi.stubGlobal('fetch', fetch);
      const v = await new AiReviewer().review(photo, { ...opts, checkImage: true });
      const content = JSON.parse(fetch.mock.calls[0][1].body).messages[1].content;
      expect(content[0]).toMatchObject({ type: 'text' });
      expect(content[0].text).toContain('<listing>');
      expect(content[1]).toEqual({ type: 'image_url', image_url: { url: photo.imageUrl, detail: 'low' } });
      expect(v.imageChecked).toBe(true);
    });

    it('sends text only for a local or http photo, or when the photo check is off', async () => {
      for (const [l, checkImage] of [[{ ...listing, imageUrl: '../asset/img/placeholder/audio.svg' }, true], [{ ...listing, imageUrl: 'http://example.com/a.jpg' }, true], [photo, false]] as const) {
        const fetch = vi.fn().mockResolvedValue(ok());
        vi.stubGlobal('fetch', fetch);
        const v = await new AiReviewer().review(l, { ...opts, checkImage });
        expect(typeof JSON.parse(fetch.mock.calls[0][1].body).messages[1].content).toBe('string');
        expect(v.imageChecked).toBe(false);
      }
    });

    it('checks the text alone when OpenAI cannot download the photo', async () => {
      const bad = new Response(JSON.stringify({ error: { code: 'invalid_image_url', message: 'Error while downloading https://res.cloudinary.com/demo/image/upload/a.jpg.' } }), { status: 400 });
      const fetch = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(ok());
      vi.stubGlobal('fetch', fetch);
      const v = await new AiReviewer().review(photo, { ...opts, checkImage: true });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(typeof JSON.parse(fetch.mock.calls[1][1].body).messages[1].content).toBe('string');
      expect(v).toMatchObject({ verdict: 'clean', imageChecked: false });
    });

    it('still fails on a 400 that is not about the photo', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'context_length_exceeded', message: 'Too long.' } }), { status: 400 })));
      await expect(new AiReviewer().review(photo, { ...opts, checkImage: true })).rejects.toBeInstanceOf(AiUnavailable);
    });
  });
});

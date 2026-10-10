import { fold, searchTerms, tokens } from './text.js';

describe('fold', () => {
  it('lowercases and removes accents, including Vietnamese đ', () => {
    expect(fold('Đổi trả trong BAO LÂU?')).toBe('doi tra trong bao lau?');
    expect(fold('Giao hàng Miễn Phí')).toBe('giao hang mien phi');
  });
});

describe('tokens', () => {
  it('splits into folded alphanumeric words', () => {
    expect(tokens('Galaxy S25-Ultra, 256GB!')).toEqual(['galaxy', 's25', 'ultra', '256gb']);
  });
});

describe('searchTerms', () => {
  it('drops question filler in both languages and keeps the subject', () => {
    expect(searchTerms('How long does shipping take?')).toEqual(['shipping', 'take']);
    expect(searchTerms('Cho mình hỏi đổi trả trong bao lâu')).toEqual(['hoi', 'doi', 'tra', 'trong', 'lau']);
  });

  it('is safe to put into a tsquery: only letters and digits survive', () => {
    const terms = searchTerms("returns'); DROP TABLE \"User\"; -- | & ! :*");
    expect(terms.every((t) => /^[a-z0-9]+$/.test(t))).toBe(true);
  });

  it('is empty for text with no usable words and capped for very long text', () => {
    expect(searchTerms('?? !!')).toEqual([]);
    expect(searchTerms(Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ')).length).toBeLessThanOrEqual(12);
  });
});

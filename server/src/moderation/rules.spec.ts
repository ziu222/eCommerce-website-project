import { checkListing, fold, type ListingInput, type RulesContext } from './rules.js';

const clean: ListingInput = {
  name: 'Apple AirPods Pro 2',
  description: 'Wireless earbuds with active noise cancellation and a USB-C case.',
  price: 249,
  imageUrl: '../asset/img/products/apple-airpods-pro-2.webp',
  category: 'audio',
};
const ctx: RulesContext = {
  keywords: [
    { phrase: 'hàng fake', severity: 'block' },
    { phrase: 'like new', severity: 'flag' },
  ],
  medianPrice: 250,
  siblingNames: ['Sony WH-1000XM6'],
  settings: { priceLowPct: 20, priceHighPct: 500 },
};
const codes = (r: { code: string }[]) => r.map((x) => x.code);

describe('listing rules', () => {
  it('folds accents, case and spaces', () => {
    expect(fold('  Hàng   FAKE Đẹp ')).toBe('hang fake dep');
  });

  it('passes a clean listing', () => {
    expect(checkListing(clean, ctx)).toEqual({ block: [], flag: [] });
  });

  it('blocks a banned keyword written without accents or in capitals', () => {
    const r = checkListing({ ...clean, name: 'Tai nghe HANG FAKE 1:1' }, ctx);
    expect(codes(r.block)).toEqual(['keyword']);
  });

  it('flags a flag keyword', () => {
    expect(codes(checkListing({ ...clean, description: clean.description + ' Like new condition.' }, ctx).flag)).toEqual(['keyword']);
  });

  it('blocks phone numbers and chat links', () => {
    expect(codes(checkListing({ ...clean, description: clean.description + ' Call 0912 345 678.' }, ctx).block)).toContain('offplatform');
    expect(codes(checkListing({ ...clean, description: clean.description + ' zalo.me/123456' }, ctx).block)).toContain('offplatform');
  });

  it('flags prices far from the category median, and skips the check without one', () => {
    expect(codes(checkListing({ ...clean, price: 5 }, ctx).flag)).toEqual(['price_low']);
    expect(codes(checkListing({ ...clean, price: 6000 }, ctx).flag)).toEqual(['price_high']);
    expect(checkListing({ ...clean, price: 5 }, { ...ctx, medianPrice: undefined }).flag).toEqual([]);
  });

  it('flags a near duplicate of another product of the shop', () => {
    expect(codes(checkListing(clean, { ...ctx, siblingNames: ['Apple AirPods Pro 2 '] }).flag)).toEqual(['duplicate']);
  });

  it('flags a listing without a photo or with a short description', () => {
    expect(codes(checkListing({ ...clean, imageUrl: '' }, ctx).flag)).toEqual(['incomplete']);
    expect(codes(checkListing({ ...clean, description: 'Earbuds.' }, ctx).flag)).toEqual(['incomplete']);
  });

  it('flags a title that lists several brands', () => {
    expect(codes(checkListing({ ...clean, name: 'Case for Apple Samsung Sony phones' }, ctx).flag)).toEqual(['brand_stuffing']);
  });
});

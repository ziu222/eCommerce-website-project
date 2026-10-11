import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'prisma/seed-data', name), 'utf8')) as T;

interface Modern {
  name: string;
  shopId: number;
  category: string;
  price: number;
  oldPrice: number | null;
  imageUrl: string;
  stock: number;
  rating: number;
  reviewCount: number;
  description: string;
  specs: Record<string, string>;
}

describe('modern catalog fixture', () => {
  const modern = load<Modern[]>('products.modern.json');
  const legacy = load<{ name: string; category: string }[]>('products.legacy.json');
  const users = load<{ id: number; role: string; shopStatus?: string }[]>('users.json');
  const activeShops = new Set(users.filter((u) => u.shopStatus === 'active').map((u) => u.id));
  const legacyCategories = new Set(legacy.map((p) => p.category));

  it('has about 100 products', () => {
    expect(modern.length).toBeGreaterThanOrEqual(95);
    expect(modern.length).toBeLessThanOrEqual(125);
  });

  it('has unique names that do not collide with legacy products', () => {
    const names = modern.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const legacyNames = new Set(legacy.map((p) => p.name.toLowerCase()));
    expect(names.filter((n) => legacyNames.has(n))).toEqual([]);
  });

  it('only uses categories the storefront already has, and covers all of them', () => {
    expect(modern.every((p) => legacyCategories.has(p.category))).toBe(true);
    expect(new Set(modern.map((p) => p.category))).toEqual(legacyCategories);
  });

  it('belongs to active shops, with positive prices and a discount that is really lower', () => {
    expect(modern.every((p) => activeShops.has(p.shopId))).toBe(true);
    expect(modern.every((p) => p.price > 0 && p.stock > 0)).toBe(true);
    expect(modern.every((p) => p.oldPrice === null || p.oldPrice > p.price)).toBe(true);
  });

  it('has specs, a description and ratings in range', () => {
    expect(modern.every((p) => Object.keys(p.specs).length >= 3)).toBe(true);
    expect(modern.every((p) => p.description.length > 20)).toBe(true);
    expect(modern.every((p) => p.rating >= 3.5 && p.rating <= 5 && p.reviewCount >= 0)).toBe(true);
  });

  it('points at local images that exist, a product photo or the category drawing', () => {
    const repoRoot = resolve(process.cwd(), '..');
    for (const p of modern) {
      expect(p.imageUrl).toMatch(/^\.\.\/asset\/img\/(products|placeholder)\//);
      expect(existsSync(resolve(repoRoot, p.imageUrl.replace('../', '')))).toBe(true);
    }
  });
});

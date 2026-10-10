import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { tokens } from './text.js';

export interface ComparedProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  url: string;
}

export interface Comparison {
  products: ComparedProduct[];
  rows: { label: string; values: (string | number)[] }[];
}

interface Match {
  productId: number;
  start: number;
  end: number;
}

const MAX_PRODUCTS = 3;

/** Finds the products a customer names and lays their facts side by side. Every number comes from the database. */
@Injectable()
export class ComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  /** Products named in the text, in the order they are mentioned (at most three). */
  async find(text: string) {
    const words = tokens(text);
    if (words.length < 2) return [];

    // ponytail: scans the whole on-sale catalogue per question; fine for a few hundred products, index names if it grows.
    const products = await this.prisma.product.findMany({
      where: { adminStatus: 'approved', shop: { shopStatus: 'active' } },
      select: { id: true, name: true, price: true, imageUrl: true, category: true, rating: true, stock: true, specs: true },
    });

    const found: Match[] = [];
    for (const p of products) {
      const name = tokens(p.name);
      // "Galaxy S25 Ultra" should find "Samsung Galaxy S25 Ultra": also try the name without its brand word.
      const phrases = [name, ...(name.length >= 3 ? [name.slice(1)] : [])];
      for (const phrase of phrases) {
        for (let i = 0; i + phrase.length <= words.length; i++) {
          if (phrase.every((w, k) => words[i + k] === w)) found.push({ productId: p.id, start: i, end: i + phrase.length - 1 });
        }
      }
    }

    // "iPhone 17 Pro Max" also contains "iPhone 17" and "iPhone 17 Pro": keep only the longest span of each mention.
    const kept = found.filter(
      (a) => !found.some((b) => b !== a && b.start <= a.start && a.end <= b.end && (b.end - b.start > a.end - a.start || (b.start === a.start && b.end === a.end && b.productId < a.productId))),
    );
    kept.sort((a, b) => a.start - b.start);

    const ids: number[] = [];
    for (const m of kept) if (!ids.includes(m.productId)) ids.push(m.productId);
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.slice(0, MAX_PRODUCTS).map((id) => byId.get(id)!);
  }

  table(products: Awaited<ReturnType<ComparisonService['find']>>): Comparison {
    const specKeys: string[] = [];
    for (const p of products) {
      for (const k of Object.keys((p.specs as Record<string, string> | null) ?? {})) if (!specKeys.includes(k)) specKeys.push(k);
    }
    const spec = (p: (typeof products)[number], key: string) => ((p.specs as Record<string, string> | null) ?? {})[key] ?? '—';

    return {
      products: products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), imageUrl: p.imageUrl, url: `product-detail.html?id=${p.id}` })),
      rows: [
        { label: 'Price', values: products.map((p) => Number(p.price)) },
        { label: 'Rating', values: products.map((p) => p.rating) },
        { label: 'Category', values: products.map((p) => p.category) },
        { label: 'In stock', values: products.map((p) => (p.stock > 0 ? 'Yes' : 'No')) },
        ...specKeys.map((key) => ({ label: key, values: products.map((p) => spec(p, key)) })),
      ],
    };
  }
}

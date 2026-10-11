// Rules that run the moment a shop saves a product. A "block" hit refuses the save; a "flag" hit
// lets the product go live demoted until an admin looks at it.

export interface Reason {
  code: string;
  message: string;
}

export interface ListingInput {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}

export interface RulesContext {
  keywords: { phrase: string; severity: 'block' | 'flag' }[];
  /** median price of approved products in the same category; absent when there are too few */
  medianPrice?: number;
  /** names of the shop's other products */
  siblingNames: string[];
  settings: { priceLowPct: number; priceHighPct: number };
}

/** Lower case, no accents, đ as d, single spaces. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// phone numbers (Vietnamese mobile and landline styles) and chat or social links
const OFF_PLATFORM = [
  /(?:\+?84|0)(?:[\s.-]?\d){9,10}\b/,
  /\b(?:zalo\.me|m\.me|fb\.com|facebook\.com|t\.me|telegram\.me|wa\.me)\//i,
  /\b(?:inbox|ib|lien he|nhan tin) (?:zalo|facebook|fb|sdt|so dien thoai)\b/,
];

const BRANDS = ['apple', 'samsung', 'sony', 'xiaomi', 'oppo', 'vivo', 'huawei', 'google', 'nokia', 'asus', 'dell', 'hp', 'lenovo', 'msi', 'acer', 'bose', 'jbl', 'garmin', 'canon', 'nikon'];

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export function checkListing(p: ListingInput, ctx: RulesContext): { block: Reason[]; flag: Reason[] } {
  const block: Reason[] = [];
  const flag: Reason[] = [];
  const text = fold(`${p.name} ${p.description}`);
  const raw = `${p.name} ${p.description}`;

  for (const k of ctx.keywords) {
    if (!text.includes(fold(k.phrase))) continue;
    (k.severity === 'block' ? block : flag).push({ code: 'keyword', message: `Contains "${k.phrase}", which is not allowed on EC SHOP.` });
  }
  if (OFF_PLATFORM.some((re) => re.test(raw) || re.test(text))) {
    block.push({ code: 'offplatform', message: 'Phone numbers, chat links and invitations to trade outside EC SHOP are not allowed.' });
  }

  if (ctx.medianPrice && ctx.medianPrice > 0) {
    if (p.price < (ctx.medianPrice * ctx.settings.priceLowPct) / 100) {
      flag.push({ code: 'price_low', message: `The price is far below similar products (around $${Math.round(ctx.medianPrice)}).` });
    } else if (p.price > (ctx.medianPrice * ctx.settings.priceHighPct) / 100) {
      flag.push({ code: 'price_high', message: `The price is far above similar products (around $${Math.round(ctx.medianPrice)}).` });
    }
  }

  const name = fold(p.name);
  if (ctx.siblingNames.some((s) => similarity(fold(s), name) >= 0.9)) {
    flag.push({ code: 'duplicate', message: 'You already sell a product with almost the same name.' });
  }

  if (!p.imageUrl.trim() || p.description.trim().length < 30) {
    flag.push({ code: 'incomplete', message: 'Add a photo and a description of at least 30 characters.' });
  }

  const words = new Set(name.split(/[^a-z0-9]+/));
  if (BRANDS.filter((b) => words.has(b)).length >= 3) {
    flag.push({ code: 'brand_stuffing', message: 'The title lists several brands; name only the brand of this product.' });
  }

  return { block, flag };
}

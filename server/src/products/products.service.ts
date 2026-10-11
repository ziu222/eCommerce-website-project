import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Product } from '../generated/prisma/client.js';
import { toCents } from '../common/money.js';
import { ModerationService } from '../moderation/moderation.service.js';
import type { Reason } from '../moderation/rules.js';
import { NotificationsService, type SystemNotification } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AdminListProductsQuery,
  CreateProductDto,
  ListProductsQuery,
  UpdateProductDto,
} from './dto/product.dto.js';

type WithShop = Product & { shop?: { id: number; shopName: string | null } };

export interface ProductDto {
  id: number;
  shopId: number;
  shop?: { id: number; shopName: string };
  name: string;
  price: number;
  oldPrice: number | null;
  imageUrl: string;
  category: string;
  rating: number;
  reviewCount: number;
  stock: number;
  description: string;
  specs: unknown;
  adminStatus: string;
  adminNote: string;
  /** reasons from the automatic checks; only on the shop's and the admins' views */
  moderationReasons?: unknown;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricedLine {
  productId: number;
  shopId: number;
  name: string;
  imageUrl: string;
  qty: number;
  unitCents: number;
  stock: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Public visibility: passed the checks (limited ones too, listed last) and sold by an active shop.
const PUBLIC: Prisma.ProductWhereInput = { adminStatus: { in: ['approved', 'limited'] }, shop: { shopStatus: 'active' } };
const WITH_SHOP = { shop: { select: { id: true, shopName: true } } } as const;

const ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  default: [{ id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  rating: [{ rating: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
};
// demoted (limited) products come after the others whatever the sort
const DEMOTED_LAST: Prisma.ProductOrderByWithRelationInput = { rankPenalty: 'asc' };

/** What a shop sees when the rules refuse a listing. */
export class ListingBlockedException extends BadRequestException {
  constructor(reasons: Reason[]) {
    super({ statusCode: 400, error: 'Bad Request', message: reasons.map((r) => r.message).join(' '), reasons });
  }
}

export function toProductDto(p: WithShop, internal = false): ProductDto {
  return {
    id: p.id,
    shopId: p.shopId,
    ...(p.shop && { shop: { id: p.shop.id, shopName: p.shop.shopName ?? '' } }),
    name: p.name,
    price: Number(p.price),
    oldPrice: p.oldPrice === null ? null : Number(p.oldPrice),
    imageUrl: p.imageUrl,
    category: p.category,
    rating: p.rating,
    reviewCount: p.reviewCount,
    stock: p.stock,
    description: p.description,
    specs: p.specs,
    adminStatus: p.adminStatus,
    adminNote: p.adminNote,
    reviewedBy: p.reviewedBy,
    reviewedAt: p.reviewedAt,
    ...(internal && { moderationReasons: p.moderationReasons ?? [] }),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly moderation: ModerationService,
  ) {}

  private async paged(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], page: number, limit: number, internal = false): Promise<Page<ProductDto>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: WITH_SHOP }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map((r) => toProductDto(r, internal)), total, page, limit };
  }

  // ---- public

  list(q: ListProductsQuery): Promise<Page<ProductDto>> {
    const where: Prisma.ProductWhereInput = {
      ...PUBLIC,
      ...(q.category && { category: q.category }),
      ...(q.q && { name: { contains: q.q, mode: 'insensitive' } }),
      ...((q.minPrice !== undefined || q.maxPrice !== undefined) && {
        price: { ...(q.minPrice !== undefined && { gte: q.minPrice }), ...(q.maxPrice !== undefined && { lte: q.maxPrice }) },
      }),
    };
    return this.paged(where, [DEMOTED_LAST, ...ORDER_BY[q.sort ?? 'default']], q.page, q.limit);
  }

  async detail(id: number): Promise<ProductDto> {
    const row = await this.prisma.product.findFirst({ where: { id, ...PUBLIC }, include: WITH_SHOP });
    if (!row) throw new NotFoundException('Product not found');
    return toProductDto(row);
  }

  async categories(): Promise<{ category: string; count: number }[]> {
    const rows = await this.prisma.product.groupBy({
      by: ['category'],
      where: PUBLIC,
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => ({ category: r.category, count: r._count._all }));
  }

  /**
   * Prices cart lines from the database (never from the client). Every product must be on sale.
   * With `lock` the rows are locked in id order for the rest of the transaction (checkout).
   */
  async priceLines(db: Prisma.TransactionClient, items: { productId: number; qty: number }[], lock = false): Promise<PricedLine[]> {
    const qtyById = new Map<number, number>();
    for (const i of items) qtyById.set(i.productId, (qtyById.get(i.productId) ?? 0) + i.qty);
    const ids = [...qtyById.keys()].sort((a, b) => a - b);

    if (lock) await db.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`;
    const rows = await db.product.findMany({ where: { id: { in: ids }, ...PUBLIC } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    return ids.map((id) => {
      const p = byId.get(id);
      if (!p) throw new BadRequestException(`Product ${id} is not available`);
      return {
        productId: id,
        shopId: p.shopId,
        name: p.name,
        imageUrl: p.imageUrl,
        qty: qtyById.get(id)!,
        unitCents: toCents(p.price),
        stock: p.stock,
      };
    });
  }

  // ---- shop (own products)

  async listOwn(shopId: number): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({ where: { shopId }, orderBy: { id: 'asc' }, include: WITH_SHOP });
    return rows.map((r) => toProductDto(r, true));
  }

  /** The rules run first: a blocked listing is refused and nothing is saved. */
  async create(shopId: number, dto: CreateProductDto): Promise<ProductDto> {
    const checks = await this.moderation.precheck(shopId, { ...dto, description: dto.description ?? '' });
    if (checks.block.length) throw new ListingBlockedException(checks.block);
    const row = await this.prisma.product.create({ data: { ...dto, shopId, adminStatus: 'pending' } });
    await this.moderation.decide(row.id, checks.flag, null);
    return this.own(row.id);
  }

  /** Every edit is checked again, the same way as a new listing. */
  async update(shopId: number, id: number, dto: UpdateProductDto): Promise<ProductDto> {
    const current = await this.prisma.product.findFirst({ where: { id, shopId } });
    if (!current) throw new NotFoundException('Product not found');
    const next = { name: current.name, description: current.description, price: Number(current.price), imageUrl: current.imageUrl, category: current.category, ...dto };
    const checks = await this.moderation.precheck(shopId, next, id);
    if (checks.block.length) throw new ListingBlockedException(checks.block);
    await this.prisma.product.update({
      where: { id },
      data: { ...dto, adminStatus: 'pending', adminNote: '', reviewedBy: null, reviewedAt: null },
    });
    await this.moderation.decide(id, checks.flag, current.adminStatus);
    return this.own(id);
  }

  private async own(id: number): Promise<ProductDto> {
    return toProductDto(await this.prisma.product.findUniqueOrThrow({ where: { id }, include: WITH_SHOP }), true);
  }

  async remove(shopId: number, id: number): Promise<void> {
    await this.ownedOrThrow(shopId, id);
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('Product has orders and cannot be deleted');
      }
      throw e;
    }
  }

  private async ownedOrThrow(shopId: number, id: number) {
    const row = await this.prisma.product.findFirst({ where: { id, shopId }, select: { id: true } });
    if (!row) throw new NotFoundException('Product not found');
  }

  // ---- admin

  adminList(q: AdminListProductsQuery): Promise<Page<ProductDto>> {
    const where: Prisma.ProductWhereInput = {
      ...(q.status && { adminStatus: q.status }),
      ...(q.q && { name: { contains: q.q, mode: 'insensitive' } }),
    };
    return this.paged(where, ORDER_BY.default, q.page, q.limit, true);
  }

  async stats() {
    const rows = await this.prisma.product.groupBy({ by: ['adminStatus'], _count: { _all: true } });
    const counts = { total: 0, pending: 0, approved: 0, limited: 0, review: 0, rejected: 0, suspended: 0 };
    for (const r of rows) {
      counts[r.adminStatus] = r._count._all;
      counts.total += r._count._all;
    }
    return counts;
  }

  review(id: number, reviewer: string, decision: 'approved' | 'rejected', note?: string) {
    const trimmed = (note ?? '').trim();
    if (decision === 'rejected' && !trimmed) throw new BadRequestException('Rejection note is required.');
    return this.transition(id, reviewer, ['pending', 'review'], decision, trimmed, 'Only products waiting for review can be reviewed.');
  }

  suspend(id: number, reviewer: string, note?: string) {
    const trimmed = (note ?? '').trim();
    if (!trimmed) throw new BadRequestException('Suspend note is required.');
    return this.transition(id, reviewer, ['approved', 'limited'], 'suspended', trimmed, 'Only live products can be suspended.');
  }

  restore(id: number, reviewer: string) {
    return this.transition(id, reviewer, ['suspended'], 'approved', '', 'Only suspended products can be restored.');
  }

  private async transition(id: number, reviewer: string, from: Product['adminStatus'][], to: 'approved' | 'rejected' | 'suspended', note: string, conflict: string): Promise<ProductDto> {
    const current = await this.prisma.product.findUnique({ where: { id }, select: { adminStatus: true } });
    if (!current) throw new NotFoundException('Product not found');
    if (!from.includes(current.adminStatus)) throw new ConflictException(conflict);
    // updateMany keeps the transition atomic: a concurrent review loses instead of overwriting.
    const { count } = await this.prisma.product.updateMany({
      where: { id, adminStatus: current.adminStatus },
      data: { adminStatus: to, adminNote: note, reviewedBy: reviewer, reviewedAt: new Date(), rankPenalty: 0 },
    });
    if (!count) throw new ConflictException(conflict);
    const updated = await this.prisma.product.findUniqueOrThrow({ where: { id }, include: WITH_SHOP });
    await this.notifications.notify(decisionNotice(updated, current.adminStatus === 'suspended' && to === 'approved' ? 'restored' : to, note));
    return toProductDto(updated, true);
  }
}

/** What the shop is told when an admin decides on one of its products. */
function decisionNotice(p: Product, event: 'approved' | 'rejected' | 'suspended' | 'restored', note: string): SystemNotification {
  const reason = note || 'No note provided.';
  const notice = {
    approved: { type: 'info', title: 'Product approved', message: `Your product "${p.name}" has been approved and is now visible to customers.` },
    rejected: { type: 'warning', title: 'Product rejected', message: `Your product "${p.name}" was rejected. Reason: ${reason}` },
    suspended: { type: 'warning', title: 'Product suspended', message: `Your product "${p.name}" has been suspended. Reason: ${reason}` },
    restored: { type: 'info', title: 'Product restored', message: `Your product "${p.name}" has been restored and is live again.` },
  } as const;
  return { targetRole: 'shop', targetId: p.shopId, ...notice[event] };
}

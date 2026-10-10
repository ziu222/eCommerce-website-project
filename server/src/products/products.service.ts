import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Product } from '../generated/prisma/client.js';
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
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Public visibility: approved by an admin and sold by an active shop.
const PUBLIC: Prisma.ProductWhereInput = { adminStatus: 'approved', shop: { shopStatus: 'active' } };
const WITH_SHOP = { shop: { select: { id: true, shopName: true } } } as const;

const ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  default: [{ id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  rating: [{ rating: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
};

export function toProductDto(p: WithShop): ProductDto {
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
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async paged(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], page: number, limit: number): Promise<Page<ProductDto>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: WITH_SHOP }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toProductDto), total, page, limit };
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
    return this.paged(where, ORDER_BY[q.sort ?? 'default'], q.page, q.limit);
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

  // ---- shop (own products)

  async listOwn(shopId: number): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({ where: { shopId }, orderBy: { id: 'asc' }, include: WITH_SHOP });
    return rows.map(toProductDto);
  }

  async create(shopId: number, dto: CreateProductDto): Promise<ProductDto> {
    const row = await this.prisma.product.create({
      data: { ...dto, shopId, adminStatus: 'pending' },
      include: WITH_SHOP,
    });
    return toProductDto(row);
  }

  async update(shopId: number, id: number, dto: UpdateProductDto): Promise<ProductDto> {
    await this.ownedOrThrow(shopId, id);
    // Any edit goes back through review.
    const row = await this.prisma.product.update({
      where: { id },
      data: { ...dto, adminStatus: 'pending', adminNote: '', reviewedBy: null, reviewedAt: null },
      include: WITH_SHOP,
    });
    return toProductDto(row);
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
    return this.paged(where, ORDER_BY.default, q.page, q.limit);
  }

  async stats() {
    const rows = await this.prisma.product.groupBy({ by: ['adminStatus'], _count: { _all: true } });
    const counts = { total: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 };
    for (const r of rows) {
      counts[r.adminStatus] = r._count._all;
      counts.total += r._count._all;
    }
    return counts;
  }

  review(id: number, reviewer: string, decision: 'approved' | 'rejected', note?: string) {
    const trimmed = (note ?? '').trim();
    if (decision === 'rejected' && !trimmed) throw new BadRequestException('Rejection note is required.');
    return this.transition(id, reviewer, 'pending', decision, trimmed, 'Only pending products can be reviewed.');
  }

  suspend(id: number, reviewer: string, note?: string) {
    const trimmed = (note ?? '').trim();
    if (!trimmed) throw new BadRequestException('Suspend note is required.');
    return this.transition(id, reviewer, 'approved', 'suspended', trimmed, 'Only approved products can be suspended.');
  }

  restore(id: number, reviewer: string) {
    return this.transition(id, reviewer, 'suspended', 'approved', '', 'Only suspended products can be restored.');
  }

  private async transition(id: number, reviewer: string, from: string, to: 'approved' | 'rejected' | 'suspended', note: string, conflict: string): Promise<ProductDto> {
    const current = await this.prisma.product.findUnique({ where: { id }, select: { adminStatus: true } });
    if (!current) throw new NotFoundException('Product not found');
    if (current.adminStatus !== from) throw new ConflictException(conflict);
    // updateMany keeps the transition atomic: a concurrent review loses instead of overwriting.
    const { count } = await this.prisma.product.updateMany({
      where: { id, adminStatus: from as Product['adminStatus'] },
      data: { adminStatus: to, adminNote: note, reviewedBy: reviewer, reviewedAt: new Date() },
    });
    if (!count) throw new ConflictException(conflict);
    return toProductDto(await this.prisma.product.findUniqueOrThrow({ where: { id }, include: WITH_SHOP }));
  }
}

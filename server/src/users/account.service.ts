import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Address } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toProductDto } from '../products/products.service.js';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

export const MAX_ADDRESSES = 10;

/** Membership tiers by money spent on delivered orders. Perks are shown to the customer as they are written here. */
export const TIERS = [
  { key: 'member', name: 'Member', min: 0, perks: ['Free delivery on every order', '30-day returns'] },
  { key: 'silver', name: 'Silver', min: 200, perks: ['Early access to weekly deals'] },
  { key: 'gold', name: 'Gold', min: 1000, perks: ['Priority replies from our support staff'] },
  { key: 'platinum', name: 'Platinum', min: 3000, perks: ['A personal discount code every month'] },
] as const;

function toAddress(a: Address) {
  return { id: a.id, label: a.label, recipient: a.recipient, phone: a.phone, line1: a.line1, city: a.city, isDefault: a.isDefault };
}

/** One line for the order record, e.g. "12 Nguyen Hue, Ho Chi Minh City". */
export function addressLine(a: Pick<Address, 'line1' | 'city'>): string {
  return `${a.line1}, ${a.city}`;
}

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- address book

  async listAddresses(userId: number) {
    const rows = await this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });
    return rows.map(toAddress);
  }

  async addAddress(userId: number, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) throw new BadRequestException(`You can keep up to ${MAX_ADDRESSES} addresses`);
      // the first address is the default one whatever was asked
      const makeDefault = count === 0 || dto.isDefault === true;
      if (makeDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      const row = await tx.address.create({ data: { userId, label: dto.label ?? '', recipient: dto.recipient, phone: dto.phone, line1: dto.line1, city: dto.city, isDefault: makeDefault } });
      return toAddress(row);
    });
  }

  async updateAddress(userId: number, id: number, dto: UpdateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.address.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Address not found');
      if (dto.isDefault === false && current.isDefault) throw new BadRequestException('Choose another default address instead');
      if (dto.isDefault === true) await tx.address.updateMany({ where: { userId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
      const { isDefault, ...fields } = dto;
      const row = await tx.address.update({ where: { id }, data: { ...fields, ...(isDefault === true && { isDefault: true }) } });
      return toAddress(row);
    });
  }

  /** Removing the default address hands the default to the oldest one left. */
  async removeAddress(userId: number, id: number) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.address.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Address not found');
      await tx.address.delete({ where: { id } });
      if (current.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { id: 'asc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  // ---- wishlist

  async wishlist(userId: number) {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId, product: { adminStatus: 'approved', shop: { shopStatus: 'active' } } },
      include: { product: { include: { shop: { select: { id: true, shopName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => toProductDto(r.product));
  }

  async wishlistIds(userId: number) {
    return (await this.prisma.wishlistItem.findMany({ where: { userId }, select: { productId: true } })).map((r) => r.productId);
  }

  async save(userId: number, productId: number) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, adminStatus: 'approved', shop: { shopStatus: 'active' } }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.wishlistItem.upsert({ where: { userId_productId: { userId, productId } }, create: { userId, productId }, update: {} });
  }

  async unsave(userId: number, productId: number) {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  }

  // ---- membership

  async membership(userId: number) {
    const agg = await this.prisma.order.aggregate({ where: { customerId: userId, status: 'delivered' }, _sum: { total: true } });
    const spent = Number(agg._sum.total ?? 0);
    let at = 0;
    TIERS.forEach((t, i) => { if (spent >= t.min) at = i; });
    const tier = TIERS[at];
    const next = TIERS[at + 1];
    return {
      tier: { key: tier.key, name: tier.name, min: tier.min },
      spent,
      next: next ? { key: next.key, name: next.name, min: next.min, remaining: Math.round((next.min - spent) * 100) / 100 } : null,
      // perks of every tier reached so far
      perks: TIERS.slice(0, at + 1).flatMap((t) => [...t.perks]),
      tiers: TIERS.map((t) => ({ key: t.key, name: t.name, min: t.min })),
    };
  }
}


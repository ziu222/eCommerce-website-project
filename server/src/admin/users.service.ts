import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminUsersQuery, CreateAdminDto, CreateShopDto, CreateShopUserDto, UpdateUserStatusDto } from './dto/admin.dto.js';

/** The account fields an admin screen may see. Never includes the password hash. */
export function toUserSummary(u: User) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    adminRole: u.adminRole,
    avatar: u.avatar,
    shopName: u.shopName,
    shopStatus: u.shopStatus,
    shopPhone: u.shopPhone,
    shopAddress: u.shopAddress,
    shopDescription: u.shopDescription,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: AdminUsersQuery) {
    const users = await this.prisma.user.findMany({ where: q.role ? { role: q.role } : {}, orderBy: { id: 'asc' } });
    return users.map(toUserSummary);
  }

  /** Suspend, ban or restore a customer or shop; approve or suspend a shop. Admin accounts are not managed here. */
  async updateStatus(id: number, dto: UpdateUserStatusDto) {
    if (dto.status === undefined && dto.shopStatus === undefined) throw new BadRequestException('Nothing to change');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'admin') throw new ConflictException('Admin accounts cannot be changed here');
    if (dto.shopStatus !== undefined && user.role !== 'shop') throw new BadRequestException('shopStatus only applies to shops');

    return toUserSummary(await this.prisma.user.update({ where: { id }, data: { status: dto.status, shopStatus: dto.shopStatus } }));
  }

  createShop({ password, shopStatus, ...fields }: CreateShopUserDto) {
    return this.createAccount({ ...fields, role: 'shop', shopStatus: shopStatus ?? 'pending' }, password);
  }

  createAdmin(dto: CreateAdminDto) {
    return this.createAccount({ name: dto.name, email: dto.email, username: dto.username, role: 'admin', adminRole: dto.adminRole }, dto.password);
  }

  private async createAccount(data: Omit<Prisma.UserCreateInput, 'passwordHash'>, password: string) {
    const clash = await this.prisma.user.findFirst({ where: { OR: [{ username: data.username }, { email: data.email }] }, select: { username: true } });
    if (clash) throw new ConflictException(clash.username === data.username ? 'Username đã được sử dụng' : 'Email đã được sử dụng');
    return toUserSummary(await this.prisma.user.create({ data: { ...data, passwordHash: await argon2.hash(password) } }));
  }

  /** Admin adds a shop for an owner: pending until approved, username derived from the owner's name, temporary password returned once. */
  async createShopForOwner(dto: CreateShopDto) {
    const taken = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (taken) throw new ConflictException('Email đã được sử dụng');

    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword);
    const base = dto.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30).padEnd(3, 'x');

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        const shop = await this.prisma.user.create({
          data: { ...dto, username, passwordHash, role: 'shop', shopStatus: 'pending' },
        });
        return { shop: toUserSummary(shop), temporaryPassword };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const target = String(e.meta?.target ?? '');
          if (target.includes('email')) throw new ConflictException('Email đã được sử dụng');
          continue; // username taken, try a suffixed one
        }
        throw e;
      }
    }
    throw new ForbiddenException('Could not allocate a username');
  }
}

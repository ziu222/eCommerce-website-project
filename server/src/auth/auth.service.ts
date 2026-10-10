import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto, RegisterDto, RegisterShopDto } from './dto/auth.dto.js';
import { toSessionUser, type SessionUser } from './session-user.js';

export const COOKIE_NAME = 'ecshop_token';
export const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async assertFree(username: string, email: string) {
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.username === username ? 'Username đã được sử dụng' : 'Email đã được sử dụng',
      );
    }
  }

  async registerCustomer(dto: RegisterDto): Promise<{ session: SessionUser; token: string }> {
    await this.assertFree(dto.username, dto.email);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        role: 'customer',
      },
    });
    return { session: toSessionUser(user), token: await this.sign(user.id, user.tokenVersion) };
  }

  async registerShop(dto: RegisterShopDto): Promise<void> {
    await this.assertFree(dto.username, dto.email);
    await this.prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        role: 'shop',
        shopName: dto.shopName,
        shopDescription: dto.shopDescription ?? '',
        shopAddress: dto.shopAddress ?? '',
        shopPhone: dto.shopPhone ?? '',
        shopStatus: 'pending',
      },
    });
  }

  async login(dto: LoginDto): Promise<{ session: SessionUser; token: string }> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.identifier }, { email: dto.identifier }] },
    });
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');
    if (!(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Mật khẩu không đúng');
    }
    this.assertMayEnter(user);
    if (dto.portal === 'admin' && user.role !== 'admin') {
      throw new ForbiddenException('Not an admin account');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { session: toSessionUser(user), token: await this.sign(user.id, user.tokenVersion) };
  }

  /** Resolves the session for a token; null when the token is invalid or the account may no longer enter. */
  async sessionFromToken(token: string): Promise<SessionUser | null> {
    try {
      const { sub, v } = await this.jwt.verifyAsync<{ sub: number; v?: number }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: sub } });
      if (!user || (v ?? 0) !== user.tokenVersion) return null;
      this.assertMayEnter(user);
      return toSessionUser(user);
    } catch {
      return null;
    }
  }

  private assertMayEnter(user: { status: string; role: string; shopStatus: string | null }) {
    if (user.status !== 'active') throw new ForbiddenException(user.status);
    if (user.role === 'shop' && user.shopStatus !== 'active') {
      throw new ForbiddenException(user.shopStatus ?? 'pending');
    }
  }

  /** Every session of this user, on every device, stops working; the caller gets a fresh one. */
  async signOutEverywhere(userId: number): Promise<string> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    return this.sign(user.id, user.tokenVersion);
  }

  private sign(userId: number, version: number): Promise<string> {
    return this.jwt.signAsync({ sub: userId, v: version });
  }
}

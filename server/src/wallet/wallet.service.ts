import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import type { Prisma, WalletTransaction } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

export const MAX_TOPUP = 1000;
export const MAX_TOPUP_PER_DAY = 5000;

/** Money is handled in integer cents and written to NUMERIC columns as exact strings. */
export const centsToString = (cents: number): string => (cents / 100).toFixed(2);
export const toCents = (value: number | string | { toString(): string }): number => Math.round(Number(value.toString()) * 100);

export interface WalletTransactionDto {
  id: number;
  type: WalletTransaction['type'];
  amount: number;
  balanceAfter: number;
  orderId: number | null;
  gateway: string | null;
  createdAt: Date;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number): Promise<{ balance: number; transactions: WalletTransactionDto[] }> {
    const [user, rows] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } }),
      this.prisma.walletTransaction.findMany({ where: { userId }, orderBy: { id: 'desc' } }),
    ]);
    return {
      balance: Number(user.walletBalance),
      transactions: rows.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        orderId: t.orderId,
        gateway: t.gateway,
        createdAt: t.createdAt,
      })),
    };
  }

  /** Removes money atomically; throws when the balance is too low. Must run inside the caller's transaction. */
  async debit(tx: Tx, userId: number, cents: number, orderId: number | null): Promise<void> {
    const amount = centsToString(cents);
    const rows = await tx.$queryRaw<{ walletBalance: Prisma.Decimal }[]>`
      UPDATE "User" SET "walletBalance" = "walletBalance" - ${amount}::numeric
      WHERE id = ${userId} AND "walletBalance" >= ${amount}::numeric
      RETURNING "walletBalance"`;
    if (!rows.length) throw new ConflictException('Insufficient wallet balance');
    await tx.walletTransaction.create({
      data: { userId, type: 'payment', amount, balanceAfter: rows[0].walletBalance, orderId },
    });
  }

  async credit(tx: Tx, userId: number, cents: number, type: 'refund' | 'topup', orderId: number | null, gateway: string | null = null): Promise<number> {
    const amount = centsToString(cents);
    const rows = await tx.$queryRaw<{ walletBalance: Prisma.Decimal }[]>`
      UPDATE "User" SET "walletBalance" = "walletBalance" + ${amount}::numeric
      WHERE id = ${userId}
      RETURNING "walletBalance"`;
    await tx.walletTransaction.create({
      data: { userId, type, amount, balanceAfter: rows[0].walletBalance, orderId, gateway },
    });
    return Number(rows[0].walletBalance);
  }

  /** Demo top-up: no real payment happens, so it is switched off unless DEMO_TOPUP=true and is capped. */
  async topUp(userId: number, amount: number, gateway: string): Promise<{ balance: number }> {
    if (!loadEnv().DEMO_TOPUP) throw new ForbiddenException('Top-up is disabled');
    const cents = toCents(amount);

    return this.prisma.$transaction(async (tx) => {
      // Serialise a user's top-ups so the daily cap cannot be raced.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const today = await tx.walletTransaction.aggregate({
        where: { userId, type: 'topup', createdAt: { gte: startOfDay } },
        _sum: { amount: true },
      });
      if (toCents(today._sum.amount ?? 0) + cents > MAX_TOPUP_PER_DAY * 100) {
        throw new ForbiddenException('Daily top-up limit reached');
      }
      return { balance: await this.credit(tx, userId, cents, 'topup', null, gateway) };
    });
  }
}

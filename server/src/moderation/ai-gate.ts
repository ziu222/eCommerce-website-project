import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModerationAlerts } from './alerts.service.js';
import { ModerationSettings } from './settings.service.js';

export type AiState = 'off' | 'up' | 'paused' | 'budget';

/** Local calendar day, YYYY-MM-DD; the AI budget resets at local midnight. */
const today = () => new Date().toLocaleDateString('en-CA');

/**
 * Decides whether the AI may be called right now: switched on with a key, the circuit breaker closed,
 * and today's spend under the budget. The breaker lives in one Postgres row (AiBreaker, id 1) changed only
 * with atomic statements, so every server instance shares it and exactly one of them raises each alert.
 */
@Injectable()
export class AiGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ModerationSettings,
    private readonly alerts: ModerationAlerts,
  ) {}

  async state(): Promise<AiState> {
    const s = await this.settings.get();
    if (!s.aiEnabled || !process.env.OPENAI_API_KEY) return 'off';
    if (await this.breakerOpenUntil()) return 'paused';
    if ((await this.spentTodayMicros()) >= s.aiDailyBudgetUsd * 1_000_000) {
      if (await this.claimBudgetAlert()) await this.alerts.send('budget', { budgetUsd: s.aiDailyBudgetUsd });
      return 'budget';
    }
    return 'up';
  }

  async success(): Promise<void> {
    await this.prisma.$executeRaw`UPDATE "AiBreaker" SET failures = 0, "updatedAt" = now() WHERE id = 1 AND failures > 0`;
  }

  /** After `breakerFailures` failures in a row the breaker opens for `breakerCooldownMin` minutes. */
  async failure(): Promise<void> {
    const s = await this.settings.get();
    const [row] = await this.prisma.$queryRaw<{ failures: number }[]>`
      INSERT INTO "AiBreaker" (id, failures, "updatedAt") VALUES (1, 1, now())
      ON CONFLICT (id) DO UPDATE SET failures = "AiBreaker".failures + 1, "updatedAt" = now()
      RETURNING failures`;
    if (row.failures < s.breakerFailures) return;
    // only the instance whose update opens the breaker gets a row back, so the alert goes out once
    const opened = await this.prisma.$queryRaw<{ openUntil: Date }[]>`
      UPDATE "AiBreaker" SET "openUntil" = now() + make_interval(mins => ${s.breakerCooldownMin}), failures = 0, "updatedAt" = now()
      WHERE id = 1 AND ("openUntil" IS NULL OR "openUntil" < now())
      RETURNING "openUntil"`;
    if (opened.length) await this.alerts.send('paused', { failures: s.breakerFailures, until: opened[0].openUntil });
  }

  async breakerOpenUntil(): Promise<Date | null> {
    const row = await this.prisma.aiBreaker.findUnique({ where: { id: 1 }, select: { openUntil: true } });
    return row?.openUntil && row.openUntil.getTime() > Date.now() ? row.openUntil : null;
  }

  /** AI spend since local midnight, from the check log. */
  async spentTodayMicros(): Promise<number> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const r = await this.prisma.moderationCheck.aggregate({ where: { layer: 'ai', createdAt: { gte: midnight } }, _sum: { costMicros: true } });
    return r._sum.costMicros ?? 0;
  }

  /** True for the first caller of the day, on any instance. */
  private async claimBudgetAlert(): Promise<boolean> {
    const day = today();
    const claimed = await this.prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO "AiBreaker" (id, "budgetAlertDay", "updatedAt") VALUES (1, ${day}, now())
      ON CONFLICT (id) DO UPDATE SET "budgetAlertDay" = ${day}, "updatedAt" = now()
      WHERE "AiBreaker"."budgetAlertDay" IS DISTINCT FROM ${day}
      RETURNING id`;
    return claimed.length > 0;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModerationSettings } from './settings.service.js';

export type AiState = 'off' | 'up' | 'paused' | 'budget';

/**
 * Decides whether the AI may be called right now: switched on with a key, the circuit breaker closed,
 * and today's spend under the budget.
 * ponytail: breaker state lives in memory, so it is per process; move it to Postgres with a second instance.
 */
@Injectable()
export class AiGate {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ModerationSettings,
  ) {}

  async state(): Promise<AiState> {
    const s = await this.settings.get();
    if (!s.aiEnabled || !process.env.OPENAI_API_KEY) return 'off';
    if (Date.now() < this.openUntil) return 'paused';
    if ((await this.spentTodayMicros()) >= s.aiDailyBudgetUsd * 1_000_000) return 'budget';
    return 'up';
  }

  success(): void {
    this.failures = 0;
  }

  /** After `breakerFailures` failures in a row the breaker opens for `breakerCooldownMin` minutes. */
  async failure(): Promise<void> {
    const s = await this.settings.get();
    this.failures++;
    if (this.failures >= s.breakerFailures) {
      this.openUntil = Date.now() + s.breakerCooldownMin * 60_000;
      this.failures = 0;
    }
  }

  breakerOpenUntil(): Date | null {
    return Date.now() < this.openUntil ? new Date(this.openUntil) : null;
  }

  /** AI spend since local midnight, from the check log. */
  async spentTodayMicros(): Promise<number> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const r = await this.prisma.moderationCheck.aggregate({ where: { layer: 'ai', createdAt: { gte: midnight } }, _sum: { costMicros: true } });
    return r._sum.costMicros ?? 0;
  }
}

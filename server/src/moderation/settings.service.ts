import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Every number the moderation pipeline uses; admins change them through /admin/moderation/settings. */
export const DEFAULT_SETTINGS = {
  aiEnabled: true,
  aiModel: 'gpt-4o-mini',
  aiDailyBudgetUsd: 2,
  aiTimeoutMs: 10_000,
  breakerFailures: 5,
  breakerCooldownMin: 5,
  holdHours: 2,
  trustedMinDays: 30,
  trustedMinProducts: 10,
  trustedMaxPrice: 1000,
  reportThreshold: 3,
  priceLowPct: 20,
  priceHighPct: 500,
  listingRules:
    'No prohibited goods under Vietnamese law. No counterfeit, replica or "1:1" items. No misleading prices. ' +
    'No phone numbers, links or other ways to trade outside EC SHOP. The title and description must describe the product truthfully, ' +
    'in the right category, without lists of unrelated brands.',
};

export type Settings = typeof DEFAULT_SETTINGS;

@Injectable()
export class ModerationSettings {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Settings> {
    const rows = await this.prisma.moderationSetting.findMany();
    const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...stored } as Settings;
  }

  /** Only known keys are kept, each with the type of its default. */
  async set(patch: Partial<Settings>): Promise<Settings> {
    const entries = Object.entries(patch).filter(
      ([k, v]) => k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k as keyof Settings],
    );
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.moderationSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } }),
      ),
    );
    return this.get();
  }
}

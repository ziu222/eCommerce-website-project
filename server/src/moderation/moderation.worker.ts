import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Prisma, Product } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiGate } from './ai-gate.js';
import { AiReviewer, AiUnavailable, costMicros, type AiVerdict } from './ai-reviewer.js';
import { ModerationService } from './moderation.service.js';
import type { Reason } from './rules.js';
import { ModerationSettings, type Settings } from './settings.service.js';

type Job = { productId: number; trigger: string; attempts: number; firstQueuedAt: Date };

const RETRY_LATER_MS = 3 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Works the ModerationJob table: asks the AI about each waiting product, and applies the backup standard
 * when the AI cannot answer (spec 3.5). Rows are claimed with SKIP LOCKED, so a second process could share the work.
 */
@Injectable()
export class ModerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ModerationWorker.name);
  private timer?: NodeJS.Timeout;
  /** waits between the quick retries of one job; tests set these to 0 */
  retryDelaysMs = [1000, 3000];

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ModerationSettings,
    private readonly gate: AiGate,
    private readonly reviewer: AiReviewer,
    private readonly moderation: ModerationService,
  ) {}

  onModuleInit() {
    this.moderation.kick = () => setImmediate(() => void this.tick().catch((e) => this.log.error(e)));
    this.timer = setInterval(() => void this.tick().catch((e) => this.log.error(e)), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Claims up to five due jobs and processes them; returns how many it claimed. */
  async tick(): Promise<number> {
    const jobs = await this.prisma.$queryRaw<Job[]>`
      UPDATE "ModerationJob" SET "lockedUntil" = now() + interval '60 seconds', attempts = attempts + 1
      WHERE "productId" IN (
        SELECT "productId" FROM "ModerationJob"
        WHERE "nextAttemptAt" <= now() AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
        ORDER BY "nextAttemptAt" LIMIT 5 FOR UPDATE SKIP LOCKED)
      RETURNING "productId", trigger, attempts, "firstQueuedAt"`;
    for (const job of jobs) {
      await this.process(job).catch((e) => this.log.error(`job ${job.productId}: ${(e as Error).message}`));
    }
    return jobs.length;
  }

  private async process(job: Job): Promise<void> {
    const p = await this.prisma.product.findUnique({ where: { id: job.productId } });
    const recheck = job.trigger === 'recheck';
    // the product moved on (deleted, decided by an admin, edited again) since the job was queued
    if (!p || p.adminStatus !== (recheck ? 'approved' : 'pending')) {
      await this.prisma.moderationJob.deleteMany({ where: { productId: job.productId } });
      return;
    }
    const s = await this.settings.get();
    const ruleFlags = ((p.moderationReasons as unknown as Reason[]) ?? []).filter((r) => r.code !== 'ai_unavailable');
    const verdict = await this.askAi(p, s);

    if (verdict) {
      await this.prisma.moderationCheck.create({
        data: {
          productId: p.id, layer: 'ai', outcome: verdict.verdict, reasons: verdict.reasons as unknown as Prisma.InputJsonValue,
          model: verdict.model, inputTokens: verdict.inputTokens, outputTokens: verdict.outputTokens, costMicros: costMicros(verdict), latencyMs: verdict.latencyMs,
        },
      });
      if (!recheck) {
        await this.moderation.finalize(p.id, ruleFlags, verdict);
        return;
      }
      // a recheck of a provisional approval can only demote; an admin makes any harsher call
      await this.prisma.$transaction([
        this.prisma.moderationJob.deleteMany({ where: { productId: p.id } }),
        this.prisma.product.update({ where: { id: p.id }, data: { provisional: false } }),
      ]);
      if (verdict.verdict !== 'clean') await this.moderation.demote(p.id, 'ai', verdict.reasons);
      return;
    }

    // ---- backup standard: the AI did not answer
    if (recheck) {
      await this.later(p.id);
      return;
    }
    if (ruleFlags.length) {
      // already demoted by the rules; the admin queue has it
      await this.fallbackLog(p.id, 'limited');
      await this.moderation.finalize(p.id, ruleFlags, null);
      return;
    }
    if (await this.trusted(p, s)) {
      await this.fallbackLog(p.id, 'provisional');
      await this.moderation.finalize(p.id, [], null, true);
      await this.prisma.moderationJob.create({ data: { productId: p.id, trigger: 'recheck', nextAttemptAt: new Date(Date.now() + RETRY_LATER_MS) } });
      return;
    }
    if (Date.now() - job.firstQueuedAt.getTime() > s.holdHours * 3_600_000) {
      await this.moderation.sendToReview(p.id, ruleFlags);
      return;
    }
    await this.later(p.id);
  }

  /** Two quick retries, then one failure for the circuit breaker. */
  private async askAi(p: Product, s: Settings): Promise<AiVerdict | null> {
    if ((await this.gate.state()) !== 'up') return null;
    const listing = { name: p.name, description: p.description, price: Number(p.price), imageUrl: p.imageUrl, category: p.category };
    for (const wait of [0, ...this.retryDelaysMs]) {
      if (wait) await sleep(wait);
      try {
        const v = await this.reviewer.review(listing, { rules: s.listingRules, model: s.aiModel, timeoutMs: s.aiTimeoutMs });
        this.gate.success();
        return v;
      } catch (e) {
        if (!(e instanceof AiUnavailable)) throw e;
        this.log.warn(`AI check of product ${p.id} failed: ${e.message}`);
      }
    }
    await this.gate.failure();
    return null;
  }

  /** Low risk while the AI is out: an established shop with a clean record and a modest price. */
  private async trusted(p: Product, s: Settings): Promise<boolean> {
    if (Number(p.price) >= s.trustedMaxPrice) return false;
    const shop = await this.prisma.user.findUnique({ where: { id: p.shopId }, select: { createdAt: true } });
    if (!shop || Date.now() - shop.createdAt.getTime() < s.trustedMinDays * 86_400_000) return false;
    const live = await this.prisma.product.count({ where: { shopId: p.shopId, adminStatus: 'approved', id: { not: p.id } } });
    return live >= s.trustedMinProducts;
  }

  private later(productId: number) {
    return this.prisma.moderationJob.update({
      where: { productId },
      data: { nextAttemptAt: new Date(Date.now() + RETRY_LATER_MS), lockedUntil: null },
    });
  }

  private fallbackLog(productId: number, outcome: string) {
    return this.prisma.moderationCheck.create({ data: { productId, layer: 'fallback', outcome, reasons: [] } });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type AlertKind = 'paused' | 'budget';

const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

/**
 * Tells admins when the AI check stops: a notification for the admin role, listed on the moderation page.
 * The gate makes sure each incident is sent once, even with several server instances.
 */
@Injectable()
export class ModerationAlerts {
  private readonly log = new Logger(ModerationAlerts.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(kind: AlertKind, detail: { failures?: number; until?: Date; budgetUsd?: number }): Promise<void> {
    const [title, message] =
      kind === 'paused'
        ? ['AI check paused', `The AI check failed ${detail.failures} times in a row. It retries at ${hhmm(detail.until!)}. Trusted shops are approved provisionally; other listings wait.`]
        : ['AI budget reached', `Today's AI spend reached $${detail.budgetUsd}. Listings follow the backup standard until midnight.`];
    this.log.warn(`${title}: ${message}`);
    await this.prisma.notification.create({
      data: { targetRole: 'admin', type: 'ai_alert', source: 'moderation', sentBy: 'system', title, message },
    });
  }

  /** The alerts of the last 24 hours, newest first. */
  async recent(): Promise<{ items: { id: number; title: string; message: string; createdAt: Date }[] }> {
    const items = await this.prisma.notification.findMany({
      where: { type: 'ai_alert', targetRole: 'admin', createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, message: true, createdAt: true },
    });
    return { items };
  }
}

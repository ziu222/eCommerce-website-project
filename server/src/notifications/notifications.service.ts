import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { HistoryQuery, SendNotificationDto } from './dto/notification.dto.js';

type Db = Prisma.TransactionClient;
type Viewer = { id: number; role: string };

export interface SystemNotification {
  targetRole: Role;
  targetId: number;
  type: 'info' | 'promo' | 'warning';
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** An automatic notification to one user, e.g. a product decision for its shop. */
  async notify(n: SystemNotification, db: Db = this.prisma): Promise<void> {
    await db.notification.create({ data: { ...n, sentBy: 'system', source: 'auto' } });
  }

  // ---- admin side

  async send(sentBy: string, dto: SendNotificationDto): Promise<{ batchId: string; count: number }> {
    const ids = [...new Set(dto.userIds ?? [])];
    if (ids.length) {
      const found = await this.prisma.user.count({ where: { id: { in: ids }, role: dto.targetRole } });
      if (found !== ids.length) throw new BadRequestException(`Every recipient must be an existing ${dto.targetRole}`);
    }

    const batchId = `batch_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const common = { targetRole: dto.targetRole, type: dto.type, title: dto.title, message: dto.message, sentBy, source: 'manual', batchId };
    const data = ids.length ? ids.map((targetId) => ({ ...common, targetId })) : [{ ...common, targetId: null }];
    await this.prisma.notification.createMany({ data });
    return { batchId, count: data.length };
  }

  /** Manual sends only, one entry per batch, newest first. */
  async history(q: HistoryQuery) {
    const rows = await this.prisma.notification.findMany({
      where: {
        source: 'manual',
        ...(q.role && { targetRole: q.role }),
        ...(q.type && { type: q.type }),
        ...((q.from || q.to) && {
          createdAt: {
            ...(q.from && { gte: new Date(`${q.from}T00:00:00.000Z`) }),
            ...(q.to && { lte: new Date(`${q.to}T23:59:59.999Z`) }),
          },
        }),
      },
      orderBy: { id: 'desc' },
      take: 2000,
    });

    const batches = new Map<string, { batchId: string; title: string; type: string; targetRole: string; recipients: { all: boolean; count: number }; sentBy: string; createdAt: Date }>();
    for (const n of rows) {
      const key = n.batchId ?? `solo_${n.id}`;
      const batch = batches.get(key) ?? {
        batchId: key, title: n.title, type: n.type, targetRole: n.targetRole ?? '', recipients: { all: false, count: 0 }, sentBy: n.sentBy, createdAt: n.createdAt,
      };
      batch.recipients.count++;
      if (n.targetId === null) batch.recipients.all = true;
      batches.set(key, batch);
    }
    return [...batches.values()];
  }

  recipients(role: 'customer' | 'shop') {
    return this.prisma.user.findMany({
      where: { role, status: 'active' },
      select: { id: true, name: true, email: true },
      orderBy: { id: 'asc' },
    });
  }

  // ---- inbox (customers and shops)

  private addressedTo(user: Viewer): Prisma.NotificationWhereInput {
    return { targetRole: user.role as Role, OR: [{ targetId: null }, { targetId: user.id }] };
  }

  async inbox(user: Viewer) {
    const rows = await this.prisma.notification.findMany({
      where: this.addressedTo(user),
      orderBy: { id: 'desc' },
      take: 100,
      include: { reads: { where: { userId: user.id }, select: { userId: true } } },
    });
    return rows.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, orderId: n.orderId, createdAt: n.createdAt, isRead: n.reads.length > 0 }));
  }

  async unreadCount(user: Viewer): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { ...this.addressedTo(user), reads: { none: { userId: user.id } } } }) };
  }

  async markRead(user: Viewer, id: number): Promise<void> {
    const found = await this.prisma.notification.findFirst({ where: { id, ...this.addressedTo(user) }, select: { id: true } });
    if (!found) throw new NotFoundException('Notification not found');
    await this.prisma.notificationRead.createMany({ data: [{ notificationId: id, userId: user.id }], skipDuplicates: true });
  }

  async markAllRead(user: Viewer): Promise<void> {
    const unread = await this.prisma.notification.findMany({
      where: { ...this.addressedTo(user), reads: { none: { userId: user.id } } },
      select: { id: true },
    });
    await this.prisma.notificationRead.createMany({
      data: unread.map((n) => ({ notificationId: n.id, userId: user.id })),
      skipDuplicates: true,
    });
  }
}

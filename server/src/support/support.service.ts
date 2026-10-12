import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SupportStatus } from '../generated/prisma/client.js';
import { LiveService } from '../notifications/live.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SUPPORT_TOPICS, type CreateThreadDto, type StaffThreadsQuery, type SupportTopicName } from './dto/support.dto.js';

/** A customer may have this many conversations waiting for staff at once. */
const MAX_WAITING_PER_CUSTOMER = 5;

type MessageRow = Prisma.SupportMessageGetPayload<Record<string, never>>;

async function names(prisma: PrismaService, ids: (number | null)[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id): id is number => id !== null))];
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function toMessage(m: MessageRow, who: Map<number, string>) {
  return {
    id: m.id,
    authorType: m.authorType,
    authorName: m.authorId === null ? '' : (who.get(m.authorId) ?? ''),
    body: m.body,
    createdAt: m.createdAt,
  };
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveService,
  ) {}

  /**
   * Live updates: every support page hears about each conversation; the customer hears about staff replies
   * and closing. Events only say what changed; pages fetch the messages they are missing.
   */
  private tell(threadId: number, kind: 'new' | 'message' | 'closed' | 'topic', customerId?: number): void {
    this.live.emit({ group: 'support-staff', type: 'support', data: { threadId, kind } });
    if (customerId !== undefined) this.live.emit({ userId: customerId, type: 'support', data: { threadId, kind } });
  }

  private async messagesAfter(threadId: number, after = 0) {
    const rows = await this.prisma.supportMessage.findMany({ where: { threadId, id: { gt: after } }, orderBy: { id: 'asc' } });
    const who = await names(this.prisma, rows.map((r) => r.authorId));
    return rows.map((r) => toMessage(r, who));
  }

  // ---- customer side

  async create(customerId: number, dto: CreateThreadDto) {
    const waiting = await this.prisma.supportThread.count({ where: { customerId, status: 'open' } });
    if (waiting >= MAX_WAITING_PER_CUSTOMER) {
      throw new ConflictException('You already have several conversations waiting for our staff. Please wait for a reply.');
    }
    const thread = await this.prisma.supportThread.create({
      data: {
        customerId,
        subject: dto.message.split('\n')[0].slice(0, 80),
        topic: dto.topic ?? 'other',
        botTranscript: dto.transcript?.length ? JSON.stringify(dto.transcript) : null,
        messages: { create: { authorType: 'customer', authorId: customerId, body: dto.message } },
      },
    });
    this.tell(thread.id, 'new');
    return { id: thread.id, subject: thread.subject, topic: thread.topic, status: thread.status };
  }

  async listOwn(customerId: number) {
    const threads = await this.prisma.supportThread.findMany({
      where: { customerId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: { messages: { orderBy: { id: 'desc' } } },
    });
    return threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      topic: t.topic,
      status: t.status,
      updatedAt: t.updatedAt,
      unread: t.messages.filter((m) => m.authorType === 'agent' && m.id > t.customerReadMessageId).length,
      lastMessage: t.messages[0]?.body.slice(0, 120) ?? '',
    }));
  }

  async unreadCount(customerId: number): Promise<{ count: number }> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM "SupportMessage" m JOIN "SupportThread" t ON t."id" = m."threadId"
      WHERE t."customerId" = ${customerId} AND m."authorType" = 'agent' AND m."id" > t."customerReadMessageId"`;
    return { count: Number(rows[0].count) };
  }

  /** Reading a conversation marks everything in it as seen by the customer. */
  async getOwn(customerId: number, id: number, after = 0) {
    const thread = await this.ownThread(customerId, id);
    const messages = await this.messagesAfter(id, after);
    const newest = messages[messages.length - 1]?.id ?? 0;
    if (newest > thread.customerReadMessageId) {
      await this.prisma.supportThread.update({ where: { id }, data: { customerReadMessageId: newest } });
    }
    return { thread: { id: thread.id, subject: thread.subject, topic: thread.topic, status: thread.status }, messages };
  }

  async customerReply(customerId: number, id: number, body: string) {
    const thread = await this.ownThread(customerId, id);
    if (thread.status === 'closed') throw new ConflictException('This conversation is closed. Please start a new one.');
    return this.addMessage(id, 'customer', customerId, body, 'open');
  }

  private async ownThread(customerId: number, id: number) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id, customerId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    return thread;
  }

  // ---- staff side

  /** The topics a staff member handles; empty means all of them. */
  private async topicsOf(staffId: number): Promise<SupportTopicName[]> {
    const u = await this.prisma.user.findUnique({ where: { id: staffId }, select: { supportTopics: true } });
    return u?.supportTopics ?? [];
  }

  async listForStaff(staffId: number, q: StaffThreadsQuery) {
    const mine = q.topic === 'mine' ? await this.topicsOf(staffId) : [];
    const threads = await this.prisma.supportThread.findMany({
      where: {
        ...(q.status && { status: q.status }),
        ...(q.topic === 'mine' ? (mine.length ? { topic: { in: mine } } : {}) : q.topic && { topic: q.topic }),
      },
      // Customers who have waited longest come first; other lists show the latest activity first.
      orderBy: [{ updatedAt: q.status === 'open' ? 'asc' : 'desc' }, { id: 'asc' }],
      take: 200,
      include: { customer: { select: { id: true, name: true } }, assignedTo: { select: { name: true } }, messages: { orderBy: { id: 'desc' }, take: 1 } },
    });
    return threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      topic: t.topic,
      status: t.status,
      customer: t.customer,
      assignedTo: t.assignedTo?.name ?? null,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
      lastMessage: t.messages[0] ? { body: t.messages[0].body.slice(0, 160), authorType: t.messages[0].authorType, createdAt: t.messages[0].createdAt } : null,
    }));
  }

  /** Waiting and answered totals, the waiting count of every topic, and the topics of this staff member. */
  async summary(staffId: number) {
    const [open, answered, grouped, mine] = await Promise.all([
      this.prisma.supportThread.count({ where: { status: 'open' } }),
      this.prisma.supportThread.count({ where: { status: 'answered' } }),
      this.prisma.supportThread.groupBy({ by: ['topic'], where: { status: 'open' }, _count: { _all: true } }),
      this.topicsOf(staffId),
    ]);
    const byTopic = Object.fromEntries(SUPPORT_TOPICS.map((t) => [t, grouped.find((g) => g.topic === t)?._count._all ?? 0]));
    return { open, answered, byTopic, mine };
  }

  async getForStaff(id: number, after = 0) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, email: true } }, assignedTo: { select: { name: true } } } });
    if (!thread) throw new NotFoundException('Conversation not found');
    return {
      id: thread.id,
      subject: thread.subject,
      topic: thread.topic,
      status: thread.status,
      customer: thread.customer,
      assignedTo: thread.assignedTo?.name ?? null,
      botTranscript: thread.botTranscript ? JSON.parse(thread.botTranscript) : [],
      messages: await this.messagesAfter(id, after),
    };
  }

  async agentReply(agentId: number, id: number, body: string) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id }, select: { status: true } });
    if (!thread) throw new NotFoundException('Conversation not found');
    if (thread.status === 'closed') throw new ConflictException('This conversation is closed');
    return this.addMessage(id, 'agent', agentId, body, 'answered');
  }

  /** A customer may pick the wrong topic; staff move the conversation to the right position. */
  async setTopic(id: number, topic: SupportTopicName): Promise<{ topic: SupportTopicName }> {
    const thread = await this.prisma.supportThread.findUnique({ where: { id }, select: { status: true } });
    if (!thread) throw new NotFoundException('Conversation not found');
    if (thread.status === 'closed') throw new ConflictException('This conversation is closed');
    await this.prisma.supportThread.update({ where: { id }, data: { topic } });
    this.tell(id, 'topic');
    return { topic };
  }

  async close(id: number): Promise<void> {
    const thread = await this.prisma.supportThread.findUnique({ where: { id }, select: { status: true, customerId: true } });
    if (!thread) throw new NotFoundException('Conversation not found');
    // The status in the WHERE keeps two staff members from "closing" the same conversation twice.
    const { count } = await this.prisma.supportThread.updateMany({ where: { id, status: { not: 'closed' } }, data: { status: 'closed', updatedAt: new Date() } });
    if (!count) throw new ConflictException('This conversation is already closed');
    this.tell(id, 'closed', thread.customerId);
  }

  // ---- shared

  private async addMessage(threadId: number, authorType: 'customer' | 'agent', authorId: number, body: string, status: SupportStatus) {
    const [message, thread] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({ data: { threadId, authorType, authorId, body } }),
      this.prisma.supportThread.update({
        where: { id: threadId },
        data: { status, updatedAt: new Date(), ...(authorType === 'agent' && { assignedToId: authorId }) },
      }),
    ]);
    // the customer only needs to hear about staff replies; their own messages are already on their screen
    this.tell(threadId, 'message', authorType === 'agent' ? thread.customerId : undefined);
    const who = await names(this.prisma, [authorId]);
    return toMessage(message, who);
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SupportStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateThreadDto, StaffThreadsQuery } from './dto/support.dto.js';

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
  constructor(private readonly prisma: PrismaService) {}

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
        botTranscript: dto.transcript?.length ? JSON.stringify(dto.transcript) : null,
        messages: { create: { authorType: 'customer', authorId: customerId, body: dto.message } },
      },
    });
    return { id: thread.id, subject: thread.subject, status: thread.status };
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
    return { thread: { id: thread.id, subject: thread.subject, status: thread.status }, messages };
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

  async listForStaff(q: StaffThreadsQuery) {
    const threads = await this.prisma.supportThread.findMany({
      where: q.status ? { status: q.status } : {},
      // Customers who have waited longest come first; other lists show the latest activity first.
      orderBy: [{ updatedAt: q.status === 'open' ? 'asc' : 'desc' }, { id: 'asc' }],
      take: 200,
      include: { customer: { select: { id: true, name: true } }, assignedTo: { select: { name: true } }, messages: { orderBy: { id: 'desc' }, take: 1 } },
    });
    return threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      customer: t.customer,
      assignedTo: t.assignedTo?.name ?? null,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
      lastMessage: t.messages[0] ? { body: t.messages[0].body.slice(0, 160), authorType: t.messages[0].authorType, createdAt: t.messages[0].createdAt } : null,
    }));
  }

  async summary(): Promise<{ open: number; answered: number }> {
    const [open, answered] = await Promise.all([
      this.prisma.supportThread.count({ where: { status: 'open' } }),
      this.prisma.supportThread.count({ where: { status: 'answered' } }),
    ]);
    return { open, answered };
  }

  async getForStaff(id: number, after = 0) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, email: true } }, assignedTo: { select: { name: true } } } });
    if (!thread) throw new NotFoundException('Conversation not found');
    return {
      id: thread.id,
      subject: thread.subject,
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

  async close(id: number): Promise<void> {
    const thread = await this.prisma.supportThread.findUnique({ where: { id }, select: { status: true } });
    if (!thread) throw new NotFoundException('Conversation not found');
    // The status in the WHERE keeps two staff members from "closing" the same conversation twice.
    const { count } = await this.prisma.supportThread.updateMany({ where: { id, status: { not: 'closed' } }, data: { status: 'closed', updatedAt: new Date() } });
    if (!count) throw new ConflictException('This conversation is already closed');
  }

  // ---- shared

  private async addMessage(threadId: number, authorType: 'customer' | 'agent', authorId: number, body: string, status: SupportStatus) {
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({ data: { threadId, authorType, authorId, body } }),
      this.prisma.supportThread.update({
        where: { id: threadId },
        data: { status, updatedAt: new Date(), ...(authorType === 'agent' && { assignedToId: authorId }) },
      }),
    ]);
    const who = await names(this.prisma, [authorId]);
    return toMessage(message, who);
  }
}

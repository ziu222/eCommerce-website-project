import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type FlagStatus, type ProductStatus } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toProductDto } from '../products/products.service.js';
import type { DecideFlagDto, FlagsQuery, KeywordDto, ReportProductDto } from './dto/moderation.dto.js';
import { ModerationService } from './moderation.service.js';
import { fold } from './rules.js';
import { ModerationSettings } from './settings.service.js';

const DECISION_STATUS: Record<DecideFlagDto['decision'], FlagStatus> = { dismiss: 'dismissed', minor: 'minor', violation: 'violation', severe: 'severe' };
const REPORT_LABEL: Record<ReportProductDto['reason'], string> = {
  counterfeit: 'counterfeit', prohibited: 'prohibited item', misleading: 'misleading listing', offplatform: 'asks to trade outside EC SHOP', other: 'other',
};

@Injectable()
export class FlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly settings: ModerationSettings,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- customer reports

  /** One report per customer and product; enough distinct reports demote the product into the admin queue. */
  async report(customerId: number, productId: number, dto: ReportProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, adminStatus: { in: ['approved', 'limited'] }, shop: { shopStatus: 'active' } },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    try {
      await this.prisma.productReport.create({ data: { productId, reporterId: customerId, reason: dto.reason, note: (dto.note ?? '').trim() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You already reported this product');
      throw e;
    }
    const reports = await this.prisma.productReport.findMany({ where: { productId }, select: { reason: true } });
    const { reportThreshold } = await this.settings.get();
    if (reports.length >= reportThreshold) {
      const kinds = [...new Set(reports.map((r) => REPORT_LABEL[r.reason]))].join(', ');
      await this.moderation.demote(productId, 'report', [{ code: 'reports', message: `Reported by ${reports.length} customers (${kinds}).` }]);
    }
    return { reported: true };
  }

  // ---- admin queue

  async list(q: FlagsQuery) {
    const where: Prisma.ProductFlagWhereInput = { status: q.status ?? 'open', ...(q.source && { source: q.source }) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productFlag.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { product: { include: { shop: { select: { id: true, shopName: true } }, _count: { select: { reports: true } } } } },
      }),
      this.prisma.productFlag.count({ where }),
    ]);
    const items = rows.map((f) => ({
      id: f.id, source: f.source, status: f.status, reasons: f.reasons, note: f.note, decidedBy: f.decidedBy, decidedAt: f.decidedAt, createdAt: f.createdAt,
      reports: f.product._count.reports,
      product: toProductDto(f.product, true),
    }));
    return { items, total, page: q.page, limit: q.limit };
  }

  /**
   * dismiss: the product is fine and goes back to normal. minor: it stays demoted until the shop fixes it.
   * violation / severe: the product is suspended. Penalty points come with phase 3.
   */
  async decide(id: number, admin: string, dto: DecideFlagDto) {
    const note = (dto.note ?? '').trim();
    if (dto.decision !== 'dismiss' && !note) throw new BadRequestException('A note is required for this decision');

    const flag = await this.prisma.$transaction(async (tx) => {
      // the status in the WHERE makes this atomic: of two admins deciding at once, one wins
      const { count } = await tx.productFlag.updateMany({
        where: { id, status: 'open' },
        data: { status: DECISION_STATUS[dto.decision], note, decidedBy: admin, decidedAt: new Date() },
      });
      if (!count) {
        if (await tx.productFlag.findUnique({ where: { id }, select: { id: true } })) throw new ConflictException('This flag was already decided');
        throw new NotFoundException('Flag not found');
      }
      const f = await tx.productFlag.findUniqueOrThrow({ where: { id }, include: { product: true } });
      const next: ProductStatus | null =
        dto.decision === 'dismiss' ? 'approved' : dto.decision === 'minor' ? 'limited' : 'suspended';
      if (['pending', 'approved', 'limited', 'review'].includes(f.product.adminStatus)) {
        await tx.product.update({
          where: { id: f.productId },
          data: { adminStatus: next, rankPenalty: next === 'limited' ? 1 : 0, provisional: false, adminNote: note, reviewedBy: admin, reviewedAt: new Date() },
        });
      }
      await tx.moderationCheck.create({
        data: { productId: f.productId, layer: 'admin', outcome: dto.decision, reasons: f.reasons as Prisma.InputJsonValue, decidedBy: admin },
      });
      return f;
    });

    const message = {
      dismiss: `"${flag.product.name}" was checked and is shown normally again.`,
      minor: `"${flag.product.name}" stays lower in search until you fix it. ${note}`,
      violation: `"${flag.product.name}" was suspended. Reason: ${note}`,
      severe: `"${flag.product.name}" was suspended for a serious violation. Reason: ${note}`,
    }[dto.decision];
    await this.notifications.notify({
      targetRole: 'shop', targetId: flag.product.shopId, type: dto.decision === 'dismiss' ? 'info' : 'warning',
      title: dto.decision === 'dismiss' ? 'Product cleared' : 'Product review decision', message,
    });
    return { id, status: DECISION_STATUS[dto.decision], productId: flag.productId };
  }

  // ---- keywords

  keywords() {
    return this.prisma.bannedKeyword.findMany({ orderBy: { phrase: 'asc' } });
  }

  async addKeyword(admin: string, dto: KeywordDto) {
    const phrase = fold(dto.phrase);
    try {
      return await this.prisma.bannedKeyword.create({ data: { phrase, severity: dto.severity, createdBy: admin } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This keyword is already on the list');
      throw e;
    }
  }

  async removeKeyword(id: number) {
    const { count } = await this.prisma.bannedKeyword.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Keyword not found');
  }
}


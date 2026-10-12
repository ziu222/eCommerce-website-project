import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiGate } from './ai-gate.js';
import { ModerationAlerts } from './alerts.service.js';
import { DecideFlagDto, FlagsQuery, KeywordDto, SettingsDto } from './dto/moderation.dto.js';
import { FlagsService } from './flags.service.js';
import { ModerationSettings } from './settings.service.js';

@Controller('admin/moderation')
export class AdminModerationController {
  constructor(
    private readonly flags: FlagsService,
    private readonly settings: ModerationSettings,
    private readonly gate: AiGate,
    private readonly prisma: PrismaService,
    private readonly alerts: ModerationAlerts,
  ) {}

  /** Whether the AI check is running, what it cost today, and how long products wait for it. */
  @Get('health')
  @RequirePermission('products.view')
  async health() {
    const [ai, spent, waiting] = await Promise.all([
      this.gate.state(),
      this.gate.spentTodayMicros(),
      this.prisma.moderationJob.aggregate({ where: { trigger: { not: 'recheck' } }, _count: { _all: true }, _min: { firstQueuedAt: true } }),
    ]);
    const oldest = waiting._min.firstQueuedAt;
    return {
      ai,
      breakerOpenUntil: await this.gate.breakerOpenUntil(),
      spentTodayUsd: spent / 1_000_000,
      queueDepth: waiting._count._all,
      oldestWaitingMinutes: oldest ? Math.floor((Date.now() - oldest.getTime()) / 60_000) : 0,
    };
  }

  /** Alerts about the AI check from the last 24 hours (paused after errors, budget reached). */
  @Get('alerts')
  @RequirePermission('products.view')
  recentAlerts() {
    return this.alerts.recent();
  }

  @Get('flags')
  @RequirePermission('products.view')
  list(@Query() query: FlagsQuery) {
    return this.flags.list(query);
  }

  @Post('flags/:id/decide')
  @RequirePermission('products.manage')
  decide(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecideFlagDto) {
    return this.flags.decide(id, user.username, dto);
  }

  @Get('keywords')
  @RequirePermission('products.view')
  keywords() {
    return this.flags.keywords();
  }

  @Post('keywords')
  @RequirePermission('products.manage')
  addKeyword(@CurrentUser() user: SessionUser, @Body() dto: KeywordDto) {
    return this.flags.addKeyword(user.username, dto);
  }

  @Delete('keywords/:id')
  @HttpCode(204)
  @RequirePermission('products.manage')
  removeKeyword(@Param('id', ParseIntPipe) id: number) {
    return this.flags.removeKeyword(id);
  }

  @Get('settings')
  @RequirePermission('products.view')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @RequirePermission('products.manage')
  setSettings(@Body() dto: SettingsDto) {
    return this.settings.set(dto);
  }
}

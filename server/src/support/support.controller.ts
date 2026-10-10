import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { AfterQuery, CreateThreadDto, MessageDto, StaffThreadsQuery } from './dto/support.dto.js';
import { PresenceService } from './presence.service.js';
import { SupportService } from './support.service.js';

@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly presence: PresenceService,
  ) {}

  /** Whether any staff member is at their desk right now (shown to customers before they write). */
  @Get('availability')
  availability() {
    return { online: this.presence.anyoneOnline() };
  }

  @Get('unread')
  @Roles('customer')
  unread(@CurrentUser() user: SessionUser) {
    return this.support.unreadCount(user.id);
  }

  @Get('threads')
  @Roles('customer')
  list(@CurrentUser() user: SessionUser) {
    return this.support.listOwn(user.id);
  }

  @Post('threads')
  @Roles('customer')
  @UseGuards(ThrottlerGuard)
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateThreadDto) {
    return this.support.create(user.id, dto);
  }

  @Get('threads/:id')
  @Roles('customer')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Query() query: AfterQuery) {
    return this.support.getOwn(user.id, id, query.after);
  }

  @Post('threads/:id/messages')
  @Roles('customer')
  @UseGuards(ThrottlerGuard)
  reply(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MessageDto) {
    return this.support.customerReply(user.id, id, dto.body);
  }
}

@Controller('admin/support')
export class StaffSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly presence: PresenceService,
  ) {}

  @Get('threads')
  @RequirePermission('support.view')
  list(@Query() query: StaffThreadsQuery) {
    return this.support.listForStaff(query);
  }

  @Get('summary')
  @RequirePermission('support.view')
  summary() {
    return this.support.summary();
  }

  @Get('threads/:id')
  @RequirePermission('support.view')
  get(@Param('id', ParseIntPipe) id: number, @Query() query: AfterQuery) {
    return this.support.getForStaff(id, query.after);
  }

  @Post('threads/:id/messages')
  @RequirePermission('support.reply')
  reply(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MessageDto) {
    return this.support.agentReply(user.id, id, dto.body);
  }

  @Post('threads/:id/close')
  @RequirePermission('support.reply')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.support.close(id);
  }

  /** Staff screens call this every half minute while open. */
  @Post('presence')
  @HttpCode(204)
  @RequirePermission('support.reply')
  heartbeat(@CurrentUser() user: SessionUser): void {
    this.presence.ping(user.id);
  }
}

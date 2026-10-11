import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Sse } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { HistoryQuery, RecipientsQuery, SendNotificationDto } from './dto/notification.dto.js';
import { LiveService } from './live.service.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@Roles('customer', 'shop')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly live: LiveService,
  ) {}

  /** Server-sent events for the signed-in user, e.g. an order changing status. */
  @Sse('stream')
  stream(@CurrentUser() user: SessionUser) {
    return this.live.stream(user.id);
  }

  @Get()
  inbox(@CurrentUser() user: SessionUser) {
    return this.notifications.inbox(user);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: SessionUser) {
    return this.notifications.unreadCount(user);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() user: SessionUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(user, id);
  }
}

@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @RequirePermission('notifications.send')
  send(@CurrentUser() user: SessionUser, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user.username, dto);
  }

  @Get()
  @RequirePermission('notifications.view')
  history(@Query() query: HistoryQuery) {
    return this.notifications.history(query);
  }

  @Get('recipients')
  @RequirePermission('notifications.send')
  recipients(@Query() query: RecipientsQuery) {
    return this.notifications.recipients(query.role);
  }
}

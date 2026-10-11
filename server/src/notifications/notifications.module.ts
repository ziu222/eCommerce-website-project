import { Module } from '@nestjs/common';
import { AdminNotificationsController, NotificationsController } from './notifications.controller.js';
import { LiveService } from './live.service.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, LiveService],
  exports: [NotificationsService, LiveService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminModerationController } from './admin-moderation.controller.js';
import { FlagsService } from './flags.service.js';
import { ModerationService } from './moderation.service.js';
import { ReportsController } from './reports.controller.js';
import { ModerationSettings } from './settings.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ReportsController, AdminModerationController],
  providers: [ModerationService, ModerationSettings, FlagsService],
  exports: [ModerationService, ModerationSettings],
})
export class ModerationModule {}

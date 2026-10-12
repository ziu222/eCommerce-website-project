import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminModerationController } from './admin-moderation.controller.js';
import { AiGate } from './ai-gate.js';
import { AiReviewer } from './ai-reviewer.js';
import { ModerationAlerts } from './alerts.service.js';
import { FlagsService } from './flags.service.js';
import { ModerationService } from './moderation.service.js';
import { ModerationWorker } from './moderation.worker.js';
import { AdminPenaltiesController, ShopPenaltiesController } from './penalties.controller.js';
import { PenaltiesService } from './penalties.service.js';
import { ReportsController } from './reports.controller.js';
import { ModerationSettings } from './settings.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ReportsController, AdminModerationController, ShopPenaltiesController, AdminPenaltiesController],
  providers: [ModerationService, ModerationSettings, ModerationAlerts, FlagsService, AiGate, AiReviewer, ModerationWorker, PenaltiesService],
  exports: [ModerationService, ModerationSettings, PenaltiesService],
})
export class ModerationModule {}

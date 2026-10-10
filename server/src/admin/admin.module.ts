import { Module } from '@nestjs/common';
import { AdminShopsController, AdminStatsController, AdminUsersController } from './admin.controller.js';
import { AdminShopsService } from './shops.service.js';
import { AdminStatsService } from './stats.service.js';
import { AdminUsersService } from './users.service.js';

@Module({
  controllers: [AdminUsersController, AdminShopsController, AdminStatsController],
  providers: [AdminUsersService, AdminShopsService, AdminStatsService],
})
export class AdminModule {}

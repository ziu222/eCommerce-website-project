import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PresenceService } from './presence.service.js';
import { StaffSupportController, SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [
    // Keeps one customer from flooding the staff inbox (read when the app starts).
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: 60_000, limit: Number(process.env.SUPPORT_RATE_LIMIT ?? 30) }],
    }),
  ],
  controllers: [SupportController, StaffSupportController],
  providers: [SupportService, PresenceService],
})
export class SupportModule {}

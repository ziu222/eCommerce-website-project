import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnswerWriter } from './answer-writer.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { ComparisonService } from './comparison.service.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [
    // Per-IP budget for the public chat endpoint (the limit is read when the app starts).
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: 60_000, limit: Number(process.env.ASSISTANT_RATE_LIMIT ?? 20) }],
    }),
  ],
  controllers: [AssistantController],
  providers: [AssistantService, KnowledgeService, ComparisonService, AnswerWriter],
})
export class AssistantModule {}

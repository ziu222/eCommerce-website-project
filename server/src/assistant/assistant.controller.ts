import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Length, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { AuthService, COOKIE_NAME } from '../auth/auth.service.js';
import { AssistantService, type BotReply } from './assistant.service.js';

class TurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @Length(1, 1000) content!: string;
}

class ChatDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => TurnDto) messages!: TurnDto[];
}

@Controller('assistant')
@UseGuards(ThrottlerGuard)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly auth: AuthService,
  ) {}

  /** Open to guests; a signed-in customer simply gets the option to reach staff. */
  @Post('chat')
  async chat(@Body() dto: ChatDto, @Req() req: Request): Promise<BotReply> {
    const last = dto.messages[dto.messages.length - 1];
    if (last.role !== 'user') throw new BadRequestException('The last message must come from the customer');

    const token = req.cookies?.[COOKIE_NAME];
    const viewer = token ? await this.auth.sessionFromToken(token) : null;
    return this.assistant.reply(dto.messages, viewer);
  }
}

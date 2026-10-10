import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { MAX_TOPUP, WalletService } from './wallet.service.js';

export class TopUpDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_TOPUP) amount!: number;
  @IsString() @Matches(/^[A-Za-z0-9 _-]{1,30}$/) gateway!: string;
}

@Controller('wallet')
@Roles('customer')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.wallet.get(user.id);
  }

  @Post('topup')
  topUp(@CurrentUser() user: SessionUser, @Body() dto: TopUpDto) {
    return this.wallet.topUp(user.id, dto.amount, dto.gateway);
  }
}

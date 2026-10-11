import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { DecideFlagDto, FlagsQuery, KeywordDto, SettingsDto } from './dto/moderation.dto.js';
import { FlagsService } from './flags.service.js';
import { ModerationSettings } from './settings.service.js';

@Controller('admin/moderation')
export class AdminModerationController {
  constructor(
    private readonly flags: FlagsService,
    private readonly settings: ModerationSettings,
  ) {}

  @Get('flags')
  @RequirePermission('products.view')
  list(@Query() query: FlagsQuery) {
    return this.flags.list(query);
  }

  @Post('flags/:id/decide')
  @RequirePermission('products.manage')
  decide(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecideFlagDto) {
    return this.flags.decide(id, user.username, dto);
  }

  @Get('keywords')
  @RequirePermission('products.view')
  keywords() {
    return this.flags.keywords();
  }

  @Post('keywords')
  @RequirePermission('products.manage')
  addKeyword(@CurrentUser() user: SessionUser, @Body() dto: KeywordDto) {
    return this.flags.addKeyword(user.username, dto);
  }

  @Delete('keywords/:id')
  @HttpCode(204)
  @RequirePermission('products.manage')
  removeKeyword(@Param('id', ParseIntPipe) id: number) {
    return this.flags.removeKeyword(id);
  }

  @Get('settings')
  @RequirePermission('products.view')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @RequirePermission('products.manage')
  setSettings(@Body() dto: SettingsDto) {
    return this.settings.set(dto);
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { AppealDto, AppealsQuery, DecideAppealDto, PenaltiesQuery } from './dto/moderation.dto.js';
import { PenaltiesService } from './penalties.service.js';

@Controller('shop/penalties')
@Roles('shop')
export class ShopPenaltiesController {
  constructor(private readonly penalties: PenaltiesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.penalties.listForShop(user.id);
  }

  @Post(':id/appeal')
  appeal(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AppealDto) {
    return this.penalties.appeal(user.id, id, dto);
  }
}

@Controller('admin')
export class AdminPenaltiesController {
  constructor(private readonly penalties: PenaltiesService) {}

  @Get('penalties')
  @RequirePermission('products.view')
  list(@Query() query: PenaltiesQuery) {
    return this.penalties.listForAdmin(query.shopId);
  }

  @Get('penalty-appeals')
  @RequirePermission('products.view')
  appeals(@Query() query: AppealsQuery) {
    return this.penalties.appeals(query);
  }

  @Post('penalty-appeals/:id/decide')
  @RequirePermission('products.manage')
  decide(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecideAppealDto) {
    return this.penalties.decideAppeal(id, user.username, dto);
  }
}

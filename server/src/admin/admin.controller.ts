import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator.js';
import {
  AdminUsersQuery,
  CreateAdminDto,
  CreateShopDto,
  CreateShopUserDto,
  FinanceQuery,
  ShopStatusDto,
  UpdateShopDto,
  UpdateUserStatusDto,
} from './dto/admin.dto.js';
import { AdminShopsService } from './shops.service.js';
import { AdminStatsService } from './stats.service.js';
import { AdminUsersService } from './users.service.js';

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermission('users.view')
  list(@Query() query: AdminUsersQuery) {
    return this.users.list(query);
  }

  @Patch(':id/status')
  @RequirePermission('users.manage')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserStatusDto) {
    return this.users.updateStatus(id, dto);
  }

  @Post('shops')
  @RequirePermission('users.manage')
  createShop(@Body() dto: CreateShopUserDto) {
    return this.users.createShop(dto);
  }

  @Post('admins')
  @RequirePermission('users.admin')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.users.createAdmin(dto);
  }
}

@Controller('admin/shops')
export class AdminShopsController {
  constructor(
    private readonly shops: AdminShopsService,
    private readonly users: AdminUsersService,
  ) {}

  @Get()
  @RequirePermission('shops.view')
  list() {
    return this.shops.list();
  }

  @Get(':id')
  @RequirePermission('shops.view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.shops.detail(id);
  }

  @Post()
  @RequirePermission('shops.manage')
  create(@Body() dto: CreateShopDto) {
    return this.users.createShopForOwner(dto);
  }

  @Patch(':id')
  @RequirePermission('shops.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShopDto) {
    return this.shops.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('shops.manage')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ShopStatusDto) {
    return this.shops.setStatus(id, dto);
  }
}

@Controller('admin')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('dashboard')
  @RequirePermission('dashboard.view')
  dashboard() {
    return this.stats.dashboard();
  }

  @Get('finance')
  @RequirePermission('dashboard.finance')
  finance(@Query() query: FinanceQuery) {
    return this.stats.finance(query);
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { AdminOrdersQuery, CheckoutDto, UpdateOrderStatusDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@Roles('customer')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  checkout(@CurrentUser() user: SessionUser, @Body() dto: CheckoutDto) {
    return this.orders.checkout(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.orders.listForCustomer(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.getForCustomer(user.id, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.changeStatus({ role: 'customer', id: user.id }, id, 'cancelled');
  }
}

@Controller('shop/orders')
@Roles('shop')
export class ShopOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.orders.listForShop(user.id);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.changeStatus({ role: 'shop', id: user.id }, id, dto.status);
  }
}

@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermission('orders.view')
  list(@Query() query: AdminOrdersQuery) {
    return this.orders.listForAdmin(query);
  }

  @Patch(':id/status')
  @RequirePermission('orders.manage')
  updateStatus(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.changeStatus({ role: 'admin', id: user.id }, id, dto.status);
  }
}

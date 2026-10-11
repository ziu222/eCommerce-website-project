import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { centsToString } from '../common/money.js';
import { PenaltiesService } from '../moderation/penalties.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from '../products/products.service.js';
import { CouponsService } from './coupons.service.js';
import {
  AdminCreateCouponDto,
  AdminUpdateCouponDto,
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto/coupon.dto.js';

@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly products: ProductsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Public so a guest can try a code in the cart; prices always come from the database. */
  @Post('validate')
  async validate(@Body() dto: ValidateCouponDto) {
    const lines = await this.products.priceLines(this.prisma, dto.items);
    const bySubtotal = new Map<number, number>();
    for (const l of lines) bySubtotal.set(l.shopId, (bySubtotal.get(l.shopId) ?? 0) + l.unitCents * l.qty);
    const groups = [...bySubtotal].map(([shopId, subtotalCents]) => ({ shopId, subtotalCents }));

    const result = await this.coupons.evaluate(this.prisma, dto.code, groups);
    return {
      coupon: {
        id: result.coupon.id,
        code: result.coupon.code,
        type: result.coupon.type,
        value: Number(result.coupon.value),
        minOrder: Number(result.coupon.minOrder),
        shopId: result.coupon.shopId,
      },
      discount: Number(centsToString(result.discountCents)),
      applicableTotal: Number(centsToString(result.applicableCents)),
    };
  }
}

@Controller('shop/coupons')
@Roles('shop')
export class ShopCouponsController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly penalties: PenaltiesService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.coupons.listForShop(user.id);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() dto: CreateCouponDto) {
    await this.penalties.assertCan(user.id, 'createCoupon');
    return this.coupons.create(dto, user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.coupons.remove(id, user.id);
  }
}

// ADMIN_ROLES has no coupon permission: reading follows the dashboard, writing follows order management.
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermission('dashboard.view')
  list() {
    return this.coupons.listAll();
  }

  @Post()
  @RequirePermission('orders.manage')
  create(@Body() dto: AdminCreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  @RequirePermission('orders.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: AdminUpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('orders.manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.coupons.remove(id);
  }
}

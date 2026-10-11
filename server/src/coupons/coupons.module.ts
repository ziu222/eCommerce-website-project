import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module.js';
import { ProductsModule } from '../products/products.module.js';
import { AdminCouponsController, CouponsController, ShopCouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';

@Module({
  imports: [ProductsModule, ModerationModule],
  controllers: [CouponsController, ShopCouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}

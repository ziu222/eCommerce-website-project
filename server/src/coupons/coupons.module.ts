import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { AdminCouponsController, CouponsController, ShopCouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';

@Module({
  imports: [ProductsModule],
  controllers: [CouponsController, ShopCouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}

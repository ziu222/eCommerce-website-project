import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module.js';
import { ProductsModule } from '../products/products.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AdminOrdersController, OrdersController, ShopOrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [ProductsModule, CouponsModule, WalletModule],
  controllers: [OrdersController, ShopOrdersController, AdminOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

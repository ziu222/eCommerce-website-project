import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminProductsController, ProductsController, ShopProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ProductsController, ShopProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminProductsController, ProductsController, ShopProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [NotificationsModule, ModerationModule],
  controllers: [ProductsController, ShopProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

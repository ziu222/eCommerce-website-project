import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { HealthController } from './health/health.controller.js';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CouponsModule } from './coupons/coupons.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { ProductsModule } from './products/products.module.js';

// In development the repo root (static storefront) is served by Nest so pages and API share an origin.
const serveStatic =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        ServeStaticModule.forRoot({
          rootPath: resolve(process.cwd(), '..'),
          exclude: ['/api/{*splat}'],
        }),
      ];

@Module({
  imports: [PrismaModule, AuthModule, ProductsModule, WalletModule, CouponsModule, OrdersModule, NotificationsModule, AdminModule, ...serveStatic],
  controllers: [HealthController],
})
export class AppModule {}

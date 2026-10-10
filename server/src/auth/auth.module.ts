import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RolesGuard } from './roles.guard.js';

// Global so that @Roles / @RequirePermission work in any feature module without re-importing.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: loadEnv().JWT_SECRET, signOptions: { expiresIn: '7d' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, PermissionsGuard],
  exports: [AuthService, AuthGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}

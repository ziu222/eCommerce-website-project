import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from './admin-roles.js';
import type { AuthedRequest } from './session-user.js';

export const PERMISSION_KEY = 'permission';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (user.role !== 'admin' || (permission && !hasPermission(user.adminRole, permission))) {
      throw new ForbiddenException();
    }
    return true;
  }
}

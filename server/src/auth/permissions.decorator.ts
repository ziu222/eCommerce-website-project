import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { PermissionsGuard, PERMISSION_KEY } from './permissions.guard.js';

/** Requires an admin session whose role grants `permission` (see admin-roles.ts). */
export const RequirePermission = (permission: string) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, permission), UseGuards(AuthGuard, PermissionsGuard));

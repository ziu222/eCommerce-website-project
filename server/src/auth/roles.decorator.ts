import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard, ROLES_KEY } from './roles.guard.js';
import type { SessionUser } from './session-user.js';

/** Requires a valid session whose role is one of `roles`. */
export const Roles = (...roles: SessionUser['role'][]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(AuthGuard, RolesGuard));

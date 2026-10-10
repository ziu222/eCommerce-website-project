import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest, SessionUser } from './session-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

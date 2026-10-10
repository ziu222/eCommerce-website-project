import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService, COOKIE_NAME } from './auth.service.js';
import type { AuthedRequest } from './session-user.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[COOKIE_NAME];
    const session = token ? await this.auth.sessionFromToken(token) : null;
    if (!session) throw new UnauthorizedException();
    req.user = session;
    return true;
  }
}

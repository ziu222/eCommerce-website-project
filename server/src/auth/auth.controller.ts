import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from './auth.guard.js';
import { AuthService, COOKIE_MAX_AGE_MS, COOKIE_NAME } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto, RegisterDto, RegisterShopDto } from './dto/auth.dto.js';
import type { SessionUser } from './session-user.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response): Promise<SessionUser> {
    const { session, token } = await this.auth.registerCustomer(dto);
    this.setCookie(res, token);
    return session;
  }

  @Post('register-shop')
  async registerShop(@Body() dto: RegisterShopDto): Promise<{ pending: true }> {
    await this.auth.registerShop(dto);
    return { pending: true };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<SessionUser> {
    const { session, token } = await this.auth.login(dto);
    this.setCookie(res, token);
    return session;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  /** Signs out every other device; this browser gets a new session so the person stays signed in here. */
  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logoutAll(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.setCookie(res, await this.auth.signOutEverywhere(user.id));
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}

import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { UpdateProfileDto } from './dto/profile.dto.js';
import { UsersService } from './users.service.js';

@Controller('users/me')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.users.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: SessionUser, @Body() dto: UpdateProfileDto) {
    return this.users.update(user.id, dto);
  }
}

import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { ReportProductDto } from './dto/moderation.dto.js';
import { FlagsService } from './flags.service.js';

@Controller('products')
@Roles('customer')
export class ReportsController {
  constructor(private readonly flags: FlagsService) {}

  @Post(':id/report')
  report(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReportProductDto) {
    return this.flags.report(user.id, id, dto);
  }
}

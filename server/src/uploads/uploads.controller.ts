import { BadRequestException, Controller, ForbiddenException, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { hasPermission } from '../auth/admin-roles.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SessionUser } from '../auth/session-user.js';
import { detectImageType } from './image-type.js';
import { UploadsService } from './uploads.service.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

@Controller('uploads')
@Roles('shop', 'admin')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async image(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: SessionUser): Promise<{ url: string }> {
    if (user.role === 'admin' && !hasPermission(user.adminRole, 'products.manage')) throw new ForbiddenException();
    if (!file) throw new BadRequestException('Send the image in the "file" field');

    const real = detectImageType(file.buffer);
    if (!real || real !== file.mimetype) throw new BadRequestException('Only PNG, JPEG and WebP images are accepted');

    return { url: await this.uploads.upload(file.buffer) };
  }
}

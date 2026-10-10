import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateProfileDto } from './dto/profile.dto.js';

function toProfile(u: User) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    coverPhoto: u.coverPhoto,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: number) {
    return toProfile(await this.prisma.user.findUniqueOrThrow({ where: { id } }));
  }

  async update(id: number, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    let passwordHash: string | undefined;
    if (dto.newPassword !== undefined) {
      if (!dto.currentPassword || !(await argon2.verify(user.passwordHash, dto.currentPassword))) {
        throw new BadRequestException('Current password is incorrect');
      }
      passwordHash = await argon2.hash(dto.newPassword);
    } else if (dto.currentPassword !== undefined) {
      throw new BadRequestException('Enter the new password too');
    }

    if (dto.email && dto.email !== user.email) {
      const taken = await this.prisma.user.findFirst({ where: { email: dto.email, NOT: { id } }, select: { id: true } });
      if (taken) throw new ConflictException('Email đã được sử dụng');
    }

    const { currentPassword: _current, newPassword: _new, ...fields } = dto;
    return toProfile(await this.prisma.user.update({ where: { id }, data: { ...fields, ...(passwordHash && { passwordHash }) } }));
  }
}

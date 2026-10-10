import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export const NOTIFICATION_TYPES = ['info', 'promo', 'warning'] as const;
export const TARGET_ROLES = ['customer', 'shop'] as const;

export class SendNotificationDto {
  @IsIn(TARGET_ROLES) targetRole!: (typeof TARGET_ROLES)[number];
  /** Omit or leave empty to reach every user of the role. */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsInt({ each: true }) @Min(1, { each: true }) userIds?: number[];
  @IsIn(NOTIFICATION_TYPES) type!: (typeof NOTIFICATION_TYPES)[number];
  @IsString() @Length(1, 150) title!: string;
  @IsString() @Length(1, 2000) message!: string;
}

export class HistoryQuery {
  @IsOptional() @IsIn(TARGET_ROLES) role?: (typeof TARGET_ROLES)[number];
  @IsOptional() @IsIn(NOTIFICATION_TYPES) type?: (typeof NOTIFICATION_TYPES)[number];
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class RecipientsQuery {
  @IsIn(TARGET_ROLES) role!: (typeof TARGET_ROLES)[number];
}

export class IdParam {
  @Type(() => Number) @IsInt() @Min(1) id!: number;
}

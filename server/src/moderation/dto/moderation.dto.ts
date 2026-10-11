import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export const REPORT_REASONS = ['counterfeit', 'prohibited', 'misleading', 'offplatform', 'other'] as const;
export const FLAG_DECISIONS = ['dismiss', 'minor', 'violation', 'severe'] as const;

export class ReportProductDto {
  @IsIn(REPORT_REASONS) reason!: (typeof REPORT_REASONS)[number];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class FlagsQuery {
  @IsOptional() @IsIn(['open', 'dismissed', 'minor', 'violation', 'severe']) status?: 'open' | 'dismissed' | 'minor' | 'violation' | 'severe';
  @IsOptional() @IsIn(['rules', 'ai', 'report', 'fallback']) source?: 'rules' | 'ai' | 'report' | 'fallback';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 50;
}

export class DecideFlagDto {
  @IsIn(FLAG_DECISIONS) decision!: (typeof FLAG_DECISIONS)[number];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** points for a violation (1 or 2, default 1); a severe decision always costs 3 */
  @IsOptional() @IsInt() @Min(1) @Max(2) points?: number;
}

export class KeywordDto {
  @IsString() @Length(2, 60) phrase!: string;
  @IsIn(['block', 'flag']) severity!: 'block' | 'flag';
}

/** Every field optional; the service keeps only known keys with the right type. */
export class SettingsDto {
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(60) aiModel?: string;
  @IsOptional() @IsNumber() @Min(0) aiDailyBudgetUsd?: number;
  @IsOptional() @IsInt() @Min(1000) @Max(60000) aiTimeoutMs?: number;
  @IsOptional() @IsInt() @Min(1) breakerFailures?: number;
  @IsOptional() @IsInt() @Min(1) breakerCooldownMin?: number;
  @IsOptional() @IsNumber() @Min(0) holdHours?: number;
  @IsOptional() @IsInt() @Min(0) trustedMinDays?: number;
  @IsOptional() @IsInt() @Min(0) trustedMinProducts?: number;
  @IsOptional() @IsNumber() @Min(0) trustedMaxPrice?: number;
  @IsOptional() @IsInt() @Min(1) reportThreshold?: number;
  @IsOptional() @IsNumber() @Min(0) priceLowPct?: number;
  @IsOptional() @IsNumber() @Min(100) priceHighPct?: number;
  @IsOptional() @IsString() @MaxLength(4000) listingRules?: string;
  @IsOptional() @IsInt() @Min(1) capProductsAt?: number;
  @IsOptional() @IsInt() @Min(1) productLimit?: number;
  @IsOptional() @IsInt() @Min(1) noCouponsAt?: number;
  @IsOptional() @IsInt() @Min(1) freezeAt?: number;
  @IsOptional() @IsInt() @Min(1) freezeDays?: number;
  @IsOptional() @IsInt() @Min(1) suspendAt?: number;
}

export class AppealDto {
  @IsString() @Length(10, 1000) message!: string;
}

export class AppealsQuery {
  @IsOptional() @IsIn(['open', 'accepted', 'refused']) status?: 'open' | 'accepted' | 'refused';
}

export class DecideAppealDto {
  @IsBoolean() accept!: boolean;
  @IsString() @Length(1, 500) note!: string;
}

export class PenaltiesQuery {
  @Type(() => Number) @IsInt() @Min(1) shopId!: number;
}

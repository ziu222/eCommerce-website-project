import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartLineDto {
  @IsInt() @Min(1) productId!: number;
  @IsInt() @Min(1) @Max(99) qty!: number;
}

export class ValidateCouponDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,30}$/) code!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartLineDto) items!: CartLineDto[];
}

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateCouponDto {
  @Transform(upper) @IsString() @Matches(/^[A-Z0-9_-]{3,30}$/) code!: string;
  @IsIn(['percent', 'fixed']) type!: 'percent' | 'fixed';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) value!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minOrder?: number;
  @IsOptional() @IsInt() @Min(0) usageLimit?: number;
  /** YYYY-MM-DD, valid through the end of that day. null / omitted = never expires. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) expiresAt?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class AdminCreateCouponDto extends CreateCouponDto {
  @IsOptional() @IsInt() @Min(1) shopId?: number | null;
}

export class AdminUpdateCouponDto extends PartialType(AdminCreateCouponDto) {}

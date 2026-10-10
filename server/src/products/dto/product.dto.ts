import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CATEGORIES = ['smartphone', 'wearables', 'laptops', 'audio', 'cameras', 'gaming'] as const;
export const SORTS = ['default', 'price_asc', 'price_desc', 'rating', 'newest'] as const;
export const PRODUCT_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;

export class ListProductsQuery {
  @IsOptional() @IsIn(CATEGORIES) category?: (typeof CATEGORIES)[number];
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @IsOptional() @IsIn(SORTS) sort?: (typeof SORTS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) limit: number = 24;
}

export class AdminListProductsQuery {
  @IsOptional() @IsIn(PRODUCT_STATUSES) status?: (typeof PRODUCT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  // The admin screen filters in memory, so it asks for the whole catalogue in one page.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit: number = 200;
}

export class CreateProductDto {
  @IsString() @Length(1, 200) name!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() price!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() oldPrice?: number;
  @IsString() @Length(1, 500) imageUrl!: string;
  @IsIn(CATEGORIES) category!: (typeof CATEGORIES)[number];
  @IsInt() @Min(0) stock!: number;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsObject() specs?: Record<string, string>;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ReviewProductDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ProductNoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  ValidateBy,
  ValidateNested,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Icons a technology block may use; the product page loads exactly these glyphs. */
export const FEATURE_ICONS = ['battery_charging_full', 'bolt', 'camera', 'display_settings', 'graphic_eq', 'memory', 'shield', 'speed', 'sports_esports', 'water_drop', 'wifi'] as const;

export class ProductFeatureDto {
  @IsString() @Length(1, 80) title!: string;
  @IsString() @Length(1, 400) body!: string;
  @IsIn(FEATURE_ICONS) icon!: (typeof FEATURE_ICONS)[number];
}

/** Every item is a [label, value] pair of strings, 1 to 120 characters each. */
function IsLabelValuePairs() {
  return ValidateBy({
    name: 'isLabelValuePairs',
    validator: {
      validate: (v: unknown) =>
        Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length >= 1 && s.length <= 120)),
      defaultMessage: () => 'items must be [label, value] pairs of 1 to 120 characters',
    },
  });
}

export class SpecGroupDto {
  @IsString() @Length(1, 40) group!: string;
  /** [label, value] pairs, in display order */
  @IsArray() @ArrayMaxSize(15) @IsLabelValuePairs() items!: [string, string][];
}

/** Everything below the buy box on the product page. Every part is optional. */
export class ProductDetailsDto {
  @IsOptional() @IsString() @MaxLength(4000) overview?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ProductFeatureDto) features?: ProductFeatureDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => SpecGroupDto) specGroups?: SpecGroupDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @Length(1, 80, { each: true }) inTheBox?: string[];
}

export const CATEGORIES = ['smartphone', 'wearables', 'laptops', 'audio', 'cameras', 'gaming'] as const;
export const SORTS = ['default', 'price_asc', 'price_desc', 'rating', 'newest'] as const;
export const PRODUCT_STATUSES = ['pending', 'approved', 'limited', 'review', 'rejected', 'suspended'] as const;

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
  /** An https link (e.g. from the upload endpoint) or a path under the site's own asset folder. */
  @IsString() @Length(1, 500) @Matches(/^(https:\/\/\S+|\.\.\/asset\/\S+)$/, { message: 'imageUrl must be an https:// link or a path under ../asset/' }) imageUrl!: string;
  @IsIn(CATEGORIES) category!: (typeof CATEGORIES)[number];
  @IsInt() @Min(0) stock!: number;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsObject() specs?: Record<string, string>;
  @IsOptional() @ValidateNested() @Type(() => ProductDetailsDto) details?: ProductDetailsDto;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ReviewProductDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ProductNoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

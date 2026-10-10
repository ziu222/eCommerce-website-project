import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { CartLineDto } from '../../coupons/dto/coupon.dto.js';

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;

export class CheckoutDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartLineDto) items!: CartLineDto[];
  @IsIn(['cod', 'wallet']) paymentMethod!: 'cod' | 'wallet';
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,30}$/) couponCode?: string;
  /** one of the customer's saved addresses; copied onto the order */
  @IsOptional() @IsInt() @Min(1) addressId?: number;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES) status!: (typeof ORDER_STATUSES)[number];
}

export class AdminOrdersQuery {
  @IsOptional() @IsIn(ORDER_STATUSES) status?: (typeof ORDER_STATUSES)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shopId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit: number = 500;
}

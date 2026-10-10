import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export const ADMIN_ROLE_KEYS = ['super_admin', 'pm', 'ba', 'hr', 'staff'] as const;

export class AdminUsersQuery {
  @IsOptional() @IsIn(['customer', 'shop', 'admin']) role?: 'customer' | 'shop' | 'admin';
}

export class UpdateUserStatusDto {
  @IsOptional() @IsIn(['active', 'suspended', 'banned']) status?: 'active' | 'suspended' | 'banned';
  @IsOptional() @IsIn(['pending', 'active', 'suspended']) shopStatus?: 'pending' | 'active' | 'suspended';
}

class AccountFields {
  @IsString() @Length(1, 100) name!: string;
  @IsEmail() email!: string;
  @IsString() @Length(3, 40) username!: string;
  @IsString() @MinLength(6) password!: string;
}

export class CreateShopUserDto extends AccountFields {
  @IsString() @Length(1, 100) shopName!: string;
  @IsOptional() @IsIn(['pending', 'active']) shopStatus?: 'pending' | 'active';
}

export class CreateAdminDto extends AccountFields {
  @IsIn(ADMIN_ROLE_KEYS) adminRole!: (typeof ADMIN_ROLE_KEYS)[number];
}

/** Used by the shops screen: no password here, the server generates a temporary one. */
export class CreateShopDto {
  @IsString() @Length(1, 100) name!: string;
  @IsString() @Length(1, 100) shopName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @Length(0, 30) shopPhone?: string;
  @IsOptional() @IsString() @Length(0, 200) shopAddress?: string;
  @IsOptional() @IsString() @Length(0, 500) shopDescription?: string;
}

export class UpdateShopDto {
  @IsOptional() @IsString() @Length(1, 100) shopName?: string;
  @IsOptional() @IsString() @Length(0, 30) shopPhone?: string;
  @IsOptional() @IsString() @Length(0, 200) shopAddress?: string;
  @IsOptional() @IsString() @Length(0, 500) shopDescription?: string;
}

export class ShopStatusDto {
  @IsIn(['pending', 'active', 'suspended']) shopStatus!: 'pending' | 'active' | 'suspended';
}

export class FinanceQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shopId?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/) dateTo?: string;
}

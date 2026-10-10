import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @Length(1, 100) name!: string;
  @IsString() @Length(3, 40) username!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

export class RegisterShopDto extends RegisterDto {
  @IsString() @Length(1, 100) shopName!: string;
  @IsOptional() @IsString() @Length(0, 500) shopDescription?: string;
  @IsOptional() @IsString() @Length(0, 200) shopAddress?: string;
  @IsOptional() @IsString() @Length(0, 30) shopPhone?: string;
}

export class LoginDto {
  @IsString() @Length(1, 200) identifier!: string;
  @IsString() @Length(1, 200) password!: string;
  @IsOptional() @IsIn(['admin']) portal?: 'admin';
}

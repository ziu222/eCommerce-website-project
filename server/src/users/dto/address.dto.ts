import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const PHONE = /^[0-9+()\-\s]{6,20}$/;

export class CreateAddressDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsString() @Length(1, 100) recipient!: string;
  @IsString() @Matches(PHONE, { message: 'Enter a phone number of 6 to 20 digits' }) phone!: string;
  @IsString() @Length(1, 200) line1!: string;
  @IsString() @Length(1, 100) city!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsOptional() @IsString() @Length(1, 100) recipient?: string;
  @IsOptional() @IsString() @Matches(PHONE, { message: 'Enter a phone number of 6 to 20 digits' }) phone?: string;
  @IsOptional() @IsString() @Length(1, 200) line1?: string;
  @IsOptional() @IsString() @Length(1, 100) city?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

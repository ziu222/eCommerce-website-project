import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

// A small embedded image (the browser shrinks it first) or an https link such as a Cloudinary URL.
const IMAGE = /^(data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s]+)$/;
const MAX_IMAGE_CHARS = 350_000;

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsEmail() email?: string;

  /** null removes the picture */
  @ValidateIf((_o, v) => v !== null) @IsOptional() @IsString() @MaxLength(MAX_IMAGE_CHARS) @Matches(IMAGE) avatar?: string | null;
  @ValidateIf((_o, v) => v !== null) @IsOptional() @IsString() @MaxLength(MAX_IMAGE_CHARS) @Matches(IMAGE) coverPhoto?: string | null;

  @IsOptional() @IsString() @MaxLength(200) currentPassword?: string;
  @IsOptional() @IsString() @MinLength(6) @MaxLength(200) newPassword?: string;
}

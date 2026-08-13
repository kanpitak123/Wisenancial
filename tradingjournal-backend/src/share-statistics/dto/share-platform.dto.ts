import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const SHARE_PLATFORMS = [
  'twitter',
  'facebook',
  'linkedin',
  'download',
  'copy_link',
] as const;

export type SharePlatform =
  (typeof SHARE_PLATFORMS)[number];

export const SHARE_CONTENT_TYPES = [
  'MESSAGE',
  'IMAGE',
  'LINK',
] as const;

export type ShareContentType =
  (typeof SHARE_CONTENT_TYPES)[number];

export class LogShareActivityDto {
  @IsString()
  @IsIn(SHARE_PLATFORMS)
  platform!: SharePlatform;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  message?: string;

  @IsString()
  @IsOptional()
  @IsIn(SHARE_CONTENT_TYPES)
  content_type?: ShareContentType;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  image_url?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  public_url?: string;
}

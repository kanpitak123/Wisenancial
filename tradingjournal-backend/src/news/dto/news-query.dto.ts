import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum NewsScope {
  ALL = 'ALL',
  TRADER = 'TRADER',
  INVESTOR = 'INVESTOR',
}

export class NewsQueryDto {
  @IsOptional()
  @IsEnum(NewsScope)
  scope: NewsScope = NewsScope.ALL;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 12;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  impact?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  sentiment?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  language: 'en' | 'th' = 'en';
}

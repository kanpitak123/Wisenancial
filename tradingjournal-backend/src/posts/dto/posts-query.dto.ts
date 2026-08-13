import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  PortfolioType,
  PostReferenceType,
  Sentiment,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class PostsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  portfolio_id?: number;

  @IsEnum(PortfolioType)
  @IsOptional()
  portfolio_type?: PortfolioType;

  @IsString()
  @IsOptional()
  asset_symbol?: string;

  @IsEnum(PostReferenceType)
  @IsOptional()
  reference_type?: PostReferenceType;

  @IsEnum(Sentiment)
  @IsOptional()
  sentiment?: Sentiment;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

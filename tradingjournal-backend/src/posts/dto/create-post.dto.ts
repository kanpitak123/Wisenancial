import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PostReferenceType,
  Sentiment,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePostDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  portfolio_id!: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  asset_symbol?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsEnum(Sentiment)
  @IsOptional()
  sentiment?: Sentiment;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  post_type?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  visibility?: string;

  @IsEnum(PostReferenceType)
  @IsOptional()
  reference_type?: PostReferenceType;

  @ValidateIf(
    (dto: CreatePostDto) =>
      dto.reference_type !== undefined &&
      dto.reference_type !==
        PostReferenceType.NONE,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reference_id?: number;
}

import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertMarketPriceDto {
  @IsString()
  @MaxLength(30)
  symbol!: string;

  @IsNumber()
  @IsPositive()
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsDateString()
  price_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}

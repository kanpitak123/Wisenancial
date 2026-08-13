import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateDividendDto {
  @IsString() @MaxLength(50) symbol!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsDateString() payment_date!: string;
  @Type(() => Number) @IsNumber() @Min(0.00000001) shares!: number;
  @Type(() => Number) @IsNumber() @Min(0) dividend_per_share!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) wht_rate?: number;
}

import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class BuyStockDto {
  @IsString() @MaxLength(50) stock_symbol!: string;
  @IsOptional() @IsString() @MaxLength(100) stock_name?: string;
  @IsNumber() @IsPositive() shares_count!: number;
  @IsNumber() @IsPositive() purchase_price!: number;
  @IsOptional() @IsNumber() @Min(0) fees?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsDateString() purchase_date?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() strategy?: string;
  @IsOptional() @IsString() emotion?: string;
}

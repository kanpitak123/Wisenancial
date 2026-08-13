import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class SellStockDto {
  @IsString() stock_symbol!: string;
  @IsNumber() @IsPositive() shares_count!: number;
  @IsNumber() @IsPositive() sold_price!: number;
  @IsOptional() @IsNumber() @Min(0) fees?: number;
  @IsOptional() @IsIn(['FIFO', 'LIFO', 'AVERAGE']) cost_method?: 'FIFO' | 'LIFO' | 'AVERAGE';
  @IsOptional() @IsDateString() sold_date?: string;
  @IsOptional() @IsString() notes?: string;
}

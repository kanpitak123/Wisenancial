import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class PreviewSellStockDto {
  @IsString() stock_symbol!: string;
  @Type(() => Number) @IsNumber() @IsPositive() shares_count!: number;
  @IsOptional() @IsIn(['FIFO', 'LIFO', 'AVERAGE']) cost_method?: 'FIFO' | 'LIFO' | 'AVERAGE';
}

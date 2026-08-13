import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class SellStockPurchaseDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sold_price!: number;

  @IsOptional()
  @IsDateString()
  sold_date?: string;
}

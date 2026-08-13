import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStockPurchaseDto {
  @IsString()
  @MaxLength(50)
  stock_symbol!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stock_name?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  shares_count!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchase_price!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3,10}$/, {
    message: 'currency ต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ 3-10 ตัว',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  purchase_reason?: string;

  @IsOptional()
  @IsString()
  expectation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  target_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stop_loss?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  strategy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emotion?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  folder_name?: string;

  @IsOptional()
  @IsDateString()
  purchase_date?: string;
}

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CloseTradeDto {
  @Type(() => Number)
  @IsNumber()
  close_price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pnl?: number;

  @IsOptional()
  @IsDateString()
  closed_at?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

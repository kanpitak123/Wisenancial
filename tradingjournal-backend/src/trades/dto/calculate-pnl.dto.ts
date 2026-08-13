import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { TradeSide } from './create-trade.dto';

export class CalculatePnlDto {
  @IsEnum(TradeSide)
  trade_type!: TradeSide;

  @Type(() => Number)
  @IsNumber()
  open_price!: number;

  @Type(() => Number)
  @IsNumber()
  close_price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contract_size?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commission?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  swap?: number;
}

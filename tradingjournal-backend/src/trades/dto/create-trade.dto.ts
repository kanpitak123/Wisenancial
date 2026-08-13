import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum TradeSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export class CreateTradeDto {
  @IsString()
  @MaxLength(30)
  pair!: string;

  @IsEnum(TradeSide)
  trade_type!: TradeSide;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contract_size?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  open_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  close_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stop_loss?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take_profit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commission?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  swap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pnl?: number;

  @IsOptional()
  @IsDateString()
  opened_at?: string;

  @IsOptional()
  @IsDateString()
  closed_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  timeframe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  trend?: string;

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
  entry_reason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  asset_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rsi?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  macd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  target_points?: string;
}

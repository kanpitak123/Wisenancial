import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateTransferDto {
  @Type(() => Number)
  @IsNumber()
  from_portfolio_id!: number;

  @Type(() => Number)
  @IsNumber()
  to_portfolio_id!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

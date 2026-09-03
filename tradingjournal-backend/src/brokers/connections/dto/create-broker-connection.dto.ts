import { BrokerType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';

export class CreateBrokerConnectionDto {
  @IsEnum(BrokerType)
  broker_type!: BrokerType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  portfolio_id?: number;
}

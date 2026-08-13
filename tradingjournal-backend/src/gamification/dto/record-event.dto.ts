import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  MissionEventType,
  PortfolioType,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class RecordGamificationEventDto {
  @IsEnum(MissionEventType)
  event_type!: MissionEventType;

  @IsEnum(PortfolioType)
  @IsOptional()
  portfolio_type?: PortfolioType;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  increment = 1;
}

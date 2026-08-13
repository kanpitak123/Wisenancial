import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  MissionFrequency,
  MissionStatus,
  PortfolioType,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class GamificationQueryDto {
  @IsEnum(PortfolioType)
  @IsOptional()
  portfolio_type?: PortfolioType;

  @IsEnum(MissionFrequency)
  @IsOptional()
  frequency?: MissionFrequency;

  @IsEnum(MissionStatus)
  @IsOptional()
  status?: MissionStatus;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

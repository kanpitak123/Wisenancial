import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const MANUAL_RECORD_TYPES = ['DEPOSIT', 'WITHDRAW'] as const;
export type ManualRecordType = (typeof MANUAL_RECORD_TYPES)[number];

export class CreateInvestorRecordDto {
  @IsIn(MANUAL_RECORD_TYPES)
  record_type!: ManualRecordType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  source?: string;

  @IsOptional()
  @IsDateString()
  record_date?: string;
}

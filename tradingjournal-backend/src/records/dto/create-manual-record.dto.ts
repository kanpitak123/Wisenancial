import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { RecordType } from '@prisma/client';

export class CreateManualRecordDto {
  @IsEnum(RecordType)
  type!: RecordType;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  occurred_at?: string;

  @ValidateIf((dto: CreateManualRecordDto) => dto.type === RecordType.TRANSFER_IN || dto.type === RecordType.TRANSFER_OUT)
  transfer_group_id?: never;
}

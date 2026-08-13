import { PartialType } from '@nestjs/mapped-types';
import { CreateInvestorRecordDto } from './create-investor-record.dto';

export class UpdateInvestorRecordDto extends PartialType(CreateInvestorRecordDto) {}

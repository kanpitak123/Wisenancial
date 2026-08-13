import { PartialType } from '@nestjs/mapped-types';
import { CreateStockPurchaseDto } from './create-stock-purchase.dto';

export class UpdateStockPurchaseDto extends PartialType(
  CreateStockPurchaseDto,
) {}

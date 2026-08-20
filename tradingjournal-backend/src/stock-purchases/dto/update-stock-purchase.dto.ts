import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * แก้ไขรายการซื้อหุ้น — ได้เฉพาะข้อมูลประกอบเท่านั้น
 *
 * เดิมไฟล์นี้เป็น PartialType(CreateStockPurchaseDto) ซึ่งเปิดให้แก้ shares_count กับ
 * purchase_price ได้ด้วย — อันตราย เพราะสองค่านั้นเป็นฐานคิดต้นทุน (cost basis) ที่
 * stock_sales / stock_sale_allocations ที่เกิดไปแล้วอ้างอิงอยู่ แก้ย้อนหลังเมื่อไหร่
 * กำไร/ขาดทุนที่บันทึกไว้กับยอดเงินพอร์ตจะไม่ตรงกับความจริงทันที
 *
 * ถ้าจะแก้จำนวนหุ้นหรือราคาซื้อจริงๆ ต้องลบ lot แล้วบันทึกใหม่ (ซึ่งลบได้เฉพาะ lot ที่
 * ยังไม่ถูกขายเลย — ดู StockPurchasesService.remove)
 */
export class UpdateStockPurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  folder_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  target_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stop_loss?: number;

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
  notes?: string;

  @IsOptional()
  @IsString()
  purchase_reason?: string;

  @IsOptional()
  @IsString()
  expectation?: string;
}

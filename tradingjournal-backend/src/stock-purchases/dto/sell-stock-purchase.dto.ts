import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * ⚠️ DTO นี้ไม่ได้ถูกใช้งานที่ไหนเลย (audit 2026-08-20)
 *
 * การขายจริงใช้ SellStockDto ใน stock-transactions/dto/sell-stock.dto.ts
 * (POST /investor/portfolios/:id/stocks/sell) ซึ่งมี shares_count + cost_method ครบ
 *
 * ตอน audit พบสองช่องโหว่ถ้าเอาไปต่อ endpoint โดยไม่แก้ จึงปิดไว้ก่อนแล้ว:
 *   1. ไม่มี shares_count -> ขายโดยไม่ระบุจำนวนหุ้น
 *   2. @Min(0) ที่ราคา -> ขายที่ราคา 0 ได้ ทำให้ realized_pnl ติดลบเท่าต้นทุนทั้งก้อน
 */
export class SellStockPurchaseDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  shares_count!: number;

  // ราคาขายต้องมากกว่า 0 — 0 ไม่ใช่การขาย แต่เป็นการตัดขาดทุนทั้งก้อนแบบเงียบๆ
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  sold_price!: number;

  @IsOptional()
  @IsDateString()
  sold_date?: string;
}

import { IsIn } from 'class-validator';

/**
 * ⚠️ DTO นี้ยังไม่ได้ถูกใช้งาน (audit 2026-08-20) — แต่ตัว validation ถูกต้องแล้ว
 *
 * ต่างจากอีกสองตัวที่ audit เจอ: ตัวนี้ไม่ได้มีช่องโหว่ ที่ขาดคือ "ปลายทาง" —
 * `portfolios.investor_cost_method` มีอยู่ใน schema (default 'FIFO') และ
 * StockTransactionsService อ่านค่านี้ไปใช้ตอนคิดต้นทุนขายจริง แต่ยังไม่มี endpoint
 * ให้ผู้ใช้เปลี่ยนวิธีคิดต้นทุนของพอร์ตตัวเอง ตอนนี้จึงติดอยู่ที่ FIFO ตลอด
 *
 * ถ้าจะทำต่อ: PATCH /investor/portfolios/:portfolioId/cost-method
 * ข้อควรระวัง — เปลี่ยนวิธีคิดต้นทุนหลังมีรายการขายไปแล้ว จะทำให้ realized_pnl
 * ที่บันทึกไว้ไม่ตรงกับวิธีที่พอร์ตใช้อยู่ ควรบล็อกเมื่อพอร์ตมี stock_sales แล้ว
 */
export class UpdateCostMethodDto {
  @IsIn(['FIFO', 'LIFO', 'AVERAGE'])
  cost_method!: 'FIFO' | 'LIFO' | 'AVERAGE';
}

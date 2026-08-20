import { api } from 'src/boot/axios';
import type {
  StockPurchase,
  StockPurchaseStatus,
  UpdateStockPurchaseInput,
} from 'src/types/investor-portfolio.types';

/**
 * รายการซื้อหุ้นรายตัว (lot)
 *
 * ต่างจาก investor-portfolio.service.ts ที่เป็น read model รวมยอดตามสัญลักษณ์ —
 * ตัวนี้คืนแถวดิบจากตาราง stock_purchases จึงมี folder_name / target_price / stop_loss
 * ที่หน้า StockRecord ต้องใช้จัดกลุ่มและแสดงผล
 */
export const stockPurchasesService = {
  async getAll(portfolioId: number, status?: StockPurchaseStatus): Promise<StockPurchase[]> {
    const { data } = await api.get<StockPurchase[]>(`/stock-purchases/portfolio/${portfolioId}`, {
      ...(status ? { params: { status } } : {}),
    });

    return data;
  },

  async getOne(id: number): Promise<StockPurchase> {
    const { data } = await api.get<StockPurchase>(`/stock-purchases/${id}`);

    return data;
  },

  /**
   * แก้ได้เฉพาะข้อมูลประกอบ — ราคา/จำนวนหุ้นแก้ไม่ได้เพราะเป็นฐานคิดต้นทุนที่
   * รายการขายที่เกิดไปแล้วอ้างอิงอยู่ (ฝั่ง backend บล็อกไว้ที่ DTO ด้วย)
   */
  async update(id: number, payload: UpdateStockPurchaseInput): Promise<StockPurchase> {
    const { data } = await api.patch<StockPurchase>(`/stock-purchases/${id}`, payload);

    return data;
  },

  /** ลบได้เฉพาะ lot ที่ยังไม่เคยขาย — ถ้าขายไปแล้ว backend ตอบ 409 */
  async remove(id: number): Promise<{ message: string; id: number }> {
    const { data } = await api.delete<{ message: string; id: number }>(`/stock-purchases/${id}`);

    return data;
  },
};

import { api } from 'src/boot/axios';
import type { StockPurchase, StockPurchaseStatus } from 'src/types/investor-portfolio.types';

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
};

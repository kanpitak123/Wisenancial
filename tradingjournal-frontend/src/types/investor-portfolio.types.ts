export type CostMethod = 'FIFO' | 'LIFO' | 'AVERAGE';

export type StockPurchaseStatus = 'OPEN' | 'CLOSED';

export interface BuyStockInput {
  stock_symbol: string;
  stock_name?: string;
  shares_count: number;
  purchase_price: number;
  fees?: number;
  currency?: string;
  purchase_date?: string;
  notes?: string;
  strategy?: string;
  emotion?: string;
  // รอบ 2 — คอลัมน์มีอยู่แล้วใน stock_purchases ไม่ต้อง migrate
  target_price?: number;
  stop_loss?: number;
  folder_name?: string;
  purchase_reason?: string;
  expectation?: string;
}

/** แถวดิบจาก stock_purchases (GET /stock-purchases/portfolio/:id) */
export interface StockPurchase {
  id: number;
  portfolio_id: number;
  stock_symbol: string;
  stock_name: string | null;
  shares_count: number | string;
  remaining_shares: number | string;
  purchase_price: number | string;
  total_amount: number | string;
  fees: number | string;
  currency: string;
  purchase_reason: string | null;
  expectation: string | null;
  target_price: number | string | null;
  stop_loss: number | string | null;
  strategy: string | null;
  emotion: string | null;
  notes: string | null;
  folder_name: string | null;
  status: StockPurchaseStatus;
  sold_price: number | string | null;
  sold_date: string | null;
  closed_at: string | null;
  purchase_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * แก้ไข lot ที่บันทึกไปแล้ว — เฉพาะข้อมูลประกอบ
 *
 * ไม่มี shares_count / purchase_price โดยตั้งใจ สองค่านั้นเป็นฐานคิดต้นทุนที่รายการ
 * ขายที่เกิดไปแล้วอ้างอิงอยู่ (backend บล็อกไว้ที่ UpdateStockPurchaseDto อีกชั้น)
 *
 * null = ตั้งใจล้างค่า (ใช้ตอนปิดสวิตช์แจ้งเตือนราคาแล้ว TP/SL ต้องถูกล้าง)
 */
export interface UpdateStockPurchaseInput {
  folder_name?: string | null;
  target_price?: number | null;
  stop_loss?: number | null;
  strategy?: string | null;
  emotion?: string | null;
  notes?: string | null;
  purchase_reason?: string | null;
  expectation?: string | null;
}

export interface SellStockInput {
  stock_symbol: string;
  shares_count: number;
  sold_price: number;
  fees?: number;
  cost_method?: CostMethod;
  sold_date?: string;
  notes?: string;
}

export interface SellPreviewAllocation {
  purchase_id: number;
  purchase_date: string;
  lot_remaining_shares: number;
  shares: number;
  unit_cost: number;
  cost_basis: number;
  fully_closes_lot: boolean;
}

/**
 * ผลลัพธ์จาก GET /investor/portfolios/:id/stocks/sell-preview — คำนวณด้วย allocation logic
 * ตัวเดียวกับที่ sell() จริงใช้ (allocateSequential/allocateAverage) จึงรับประกันได้ว่า lot ที่
 * แสดงให้ผู้ใช้เห็นก่อนกดขาย ตรงกับ lot ที่ backend จะตัดจริงเป๊ะ — ไม่ใช่แค่ lot ที่ผู้ใช้กด "ขาย"
 */
export interface SellPreviewResponse {
  cost_method: CostMethod;
  requested_shares: number;
  available_shares: number;
  insufficient: boolean;
  allocations: SellPreviewAllocation[];
}

export interface InvestorHolding {
  symbol: string;
  name?: string | null;
  currency: string;
  shares: number;
  average_cost: number;
  cost_basis: number;
  market_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_percent: number | null;
}

export interface InvestorActivity {
  id: number;
  type: string;
  amount: number | string;
  symbol?: string | null;
  description?: string | null;
  occurred_at: string;
  source?: string | null;
  status?: string;
}

/**
 * แถวดิบจาก stock_sales (GET /investor/portfolios/:id/stocks/sales) — field names ต้องตรงกับ
 * Prisma model `stock_sales` เป๊ะ (shares_sold/gross_proceeds ไม่ใช่ shares_count/gross_amount —
 * QA sweep 2026-09-23 พบว่าชื่อ field ที่ผิดทำให้ค่าที่แสดงกลายเป็น 0 เงียบๆ ทั้งตารางบนจอและ CSV
 * export เพราะ Number(undefined ?? 0) ไม่ throw ไม่มี type error ให้เห็นเลย)
 */
export interface InvestorSale {
  id: number;
  portfolio_id: number;
  stock_symbol: string;
  shares_sold: number | string;
  sold_price: number | string;
  gross_proceeds?: number | string;
  fees?: number | string;
  cost_basis?: number | string;
  realized_pnl?: number | string;
  cost_method?: CostMethod;
  sold_date: string;
  notes?: string | null;
}

export interface InvestorPerformancePoint {
  date: string;
  value: number;
  cash?: number;
  deposits?: number;
  withdrawals?: number;
}

export interface InvestorDashboard {
  portfolio: {
    id: number;
    name: string;
    currency: string;
  };
  summary: {
    cash: number;
    invested_cost: number;
    market_value: number;
    portfolio_value: number;
    realized_pnl: number;
    unrealized_pnl: number;
    dividends: number;
    total_pnl: number;
    total_return_percent: number;
    open_holdings: number;
    closed_sales: number;
  };
  holdings: InvestorHolding[];
  recent_activity: InvestorActivity[];
}

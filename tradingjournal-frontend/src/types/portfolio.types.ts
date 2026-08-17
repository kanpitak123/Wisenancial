export type PortfolioType = 'TRADER' | 'INVESTOR';

export type InvestorCostMethod = 'FIFO' | 'LIFO' | 'AVERAGE';

export interface Portfolio {
  id: number;
  user_id: number | null;
  name: string;
  initial_balance: string | number;
  current_balance: string | number;
  portfolio_type: PortfolioType;
  investor_cost_method: InvestorCostMethod;
  currency: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreatePortfolioPayload {
  name: string;
  initial_balance: number;
  portfolio_type?: PortfolioType;
  currency?: string;
  icon?: string;
  color?: string;
  is_default?: boolean;
}

export interface UpdatePortfolioPayload {
  name?: string;
  initial_balance?: number;
  portfolio_type?: PortfolioType;
  currency?: string;
  icon?: string | null;
  color?: string | null;
  is_default?: boolean;
}

export interface ListPortfoliosQuery {
  type?: PortfolioType;
}

export interface DeletePortfolioResponse {
  message: string;
  deleted_id: number;
}

/**
 * โควต้าพอร์ตตาม subscription tier — รวมทั้งสองโหมดเป็นก้อนเดียว
 * ผู้ใช้แบ่งสัดส่วนเองได้ ขอแค่ used ไม่เกิน max (ดู GET /portfolios/quota)
 */
export interface PortfolioQuota {
  max: number;
  used: number;
  remaining: number;
  byType: Record<PortfolioType, number>;
}

export interface PortfolioState {
  portfolios: Portfolio[];
  activePortfolioIds: Record<PortfolioType, number | null>;
  activeType: PortfolioType;
  quota: PortfolioQuota | null;
  /**
   * ผู้ใช้กดสลับโหมดอยู่ — ใช้กันการกดสลับซ้อนกัน
   * เก็บที่ store เพราะ useWorkspace() ถูกเรียกหลายที่ (MainLayout, WorkspaceSwitcher)
   * ถ้าเก็บเป็น local ref ต่างคนต่างไม่เห็นกัน
   */
  isSwitchingWorkspace: boolean;

  /**
   * กำลัง initialize โหมดตอนเปิดแอพ/รีเฟรช
   *
   * แยกจาก isSwitchingWorkspace โดยตั้งใจ — ถ้าใช้ธงเดียวกัน การกดสลับระหว่าง boot
   * จะถูกบล็อกเงียบๆ ซึ่งคือบั๊กเดิมที่กำลังแก้อยู่พอดี ตัวนี้ใช้แค่โชว์สถานะ busy
   */
  isInitializingWorkspace: boolean;
  isLoading: boolean;
  isLoadingQuota: boolean;
  isSubmitting: boolean;
  hasLoadedAll: boolean;
  loadedTypes: Record<PortfolioType, boolean>;
  error: string | null;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

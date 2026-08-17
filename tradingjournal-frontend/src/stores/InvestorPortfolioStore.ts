import { defineStore } from 'pinia';
import { investorPortfolioService } from 'src/services/investor-portfolio.service';
import { stockPurchasesService } from 'src/services/stock-purchases.service';
import type {
  BuyStockInput,
  InvestorActivity,
  InvestorDashboard,
  InvestorPerformancePoint,
  InvestorSale,
  SellStockInput,
  StockPurchase,
} from 'src/types/investor-portfolio.types';

interface ApiError {
  response?: {
    data?: {
      message?: string | string[];
    };
  };
  message?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError;
  const message = apiError.response?.data?.message;

  if (Array.isArray(message)) return message.join(', ');
  return message ?? apiError.message ?? fallback;
}

export const useInvestorPortfolioStore = defineStore('investor-portfolio', {
  state: () => ({
    portfolioId: null as number | null,
    dashboard: null as InvestorDashboard | null,
    sales: [] as InvestorSale[],
    timeline: [] as InvestorActivity[],
    performance: [] as InvestorPerformancePoint[],
    purchases: [] as StockPurchase[],
    loading: false,
    submitting: false,
    error: null as string | null,
  }),

  getters: {
    holdings: (state) => state.dashboard?.holdings ?? [],
    summary: (state) => state.dashboard?.summary ?? null,

    /** lot ที่ยังถืออยู่ (ยังขายไม่หมด) */
    openPurchases: (state) => state.purchases.filter((item) => item.status === 'OPEN'),

    /** ชื่อโฟลเดอร์ทั้งหมดที่เคยใช้ — ใช้เป็นตัวเลือกในฟอร์มและตัวกรอง */
    folders(): string[] {
      const names = new Set<string>();

      for (const purchase of this.openPurchases) {
        if (purchase.folder_name) {
          names.add(purchase.folder_name);
        }
      }

      return [...names].sort((a, b) => a.localeCompare(b));
    },
  },

  actions: {
    async load(portfolioId: number) {
      this.loading = true;
      this.error = null;

      try {
        const [dashboard, sales, timeline, performance, purchases] = await Promise.all([
          investorPortfolioService.getDashboard(portfolioId),
          investorPortfolioService.getSales(portfolioId),
          investorPortfolioService.getTimeline(portfolioId),
          investorPortfolioService.getPerformance(portfolioId),
          // lot ดิบ — หน้า StockRecord ใช้จัดกลุ่มตามโฟลเดอร์และแสดง target/stop
          stockPurchasesService.getAll(portfolioId).catch(() => []),
        ]);

        this.portfolioId = portfolioId;
        this.dashboard = dashboard.data;
        this.sales = sales.data;
        this.timeline = timeline.data;
        this.performance = performance.data;
        this.purchases = purchases;
      } catch (error: unknown) {
        this.error = getErrorMessage(error, 'โหลดข้อมูลพอร์ตนักลงทุนไม่สำเร็จ');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async refresh() {
      if (this.portfolioId === null) return;
      await this.load(this.portfolioId);
    },

    async buy(payload: BuyStockInput) {
      if (this.portfolioId === null) {
        throw new Error('ยังไม่ได้เลือก Investor portfolio');
      }

      this.submitting = true;
      this.error = null;

      try {
        const response = await investorPortfolioService.buy(this.portfolioId, payload);
        await this.load(this.portfolioId);
        return response.data;
      } catch (error: unknown) {
        this.error = getErrorMessage(error, 'บันทึกการซื้อหุ้นไม่สำเร็จ');
        throw error;
      } finally {
        this.submitting = false;
      }
    },

    async sell(payload: SellStockInput) {
      if (this.portfolioId === null) {
        throw new Error('ยังไม่ได้เลือก Investor portfolio');
      }

      this.submitting = true;
      this.error = null;

      try {
        const response = await investorPortfolioService.sell(this.portfolioId, payload);
        await this.load(this.portfolioId);
        return response.data;
      } catch (error: unknown) {
        this.error = getErrorMessage(error, 'บันทึกการขายหุ้นไม่สำเร็จ');
        throw error;
      } finally {
        this.submitting = false;
      }
    },

    clear() {
      this.portfolioId = null;
      this.dashboard = null;
      this.sales = [];
      this.timeline = [];
      this.performance = [];
      this.purchases = [];
      this.loading = false;
      this.submitting = false;
      this.error = null;
    },
  },
});

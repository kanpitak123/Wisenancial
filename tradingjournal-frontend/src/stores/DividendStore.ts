import { defineStore } from 'pinia';
import { DIVIDEND_MESSAGES } from '../constants/dividend.constants';
import { dividendService, getDividendErrorMessage } from '../services/dividend.service';
import { usePortfolioStore } from './PortfolioStore';
import { useRecordStore } from './RecordStore';
import type {
  CreateDividendPayload,
  Dividend,
  DividendSummary,
  UpdateDividendPayload,
} from '../types/dividend.types';

export const useDividendStore = defineStore('dividends', {
  state: () => ({
    items: [] as Dividend[],
    summary: null as DividendSummary | null,
    selectedYear: null as number | null,
    portfolioId: null as number | null,
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
  }),

  getters: {
    activeItems: (state) => state.items.filter((item) => item.status === 'ACTIVE'),

    totalNetAmount: (state) => state.summary?.net_amount ?? 0,

    totalTaxWithheld: (state) => state.summary?.tax_withheld ?? 0,

    totalGrossAmount: (state) => state.summary?.gross_amount ?? 0,
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async load(portfolioId: number, year?: number) {
      this.isLoading = true;
      this.error = null;

      try {
        const [items, summary] = await Promise.all([
          dividendService.getAll(portfolioId),
          dividendService.getSummary(portfolioId, year),
        ]);

        this.items = items;
        this.summary = summary;
        this.selectedYear = year ?? null;
        this.portfolioId = portfolioId;

        return {
          items,
          summary,
        };
      } catch (error) {
        this.error = getDividendErrorMessage(error, DIVIDEND_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async refresh() {
      if (this.portfolioId === null) {
        return null;
      }

      return this.load(this.portfolioId, this.selectedYear ?? undefined);
    },

    async create(payload: CreateDividendPayload) {
      const portfolioId = this.requirePortfolioId();

      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await dividendService.create(portfolioId, payload);

        this.upsertDividend(result.dividend);

        await this.syncFinancialState(portfolioId, result.current_balance);

        await this.reloadSummary(portfolioId);

        return result;
      } catch (error) {
        this.error = getDividendErrorMessage(error, DIVIDEND_MESSAGES.createFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async update(id: number, payload: UpdateDividendPayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await dividendService.update(id, payload);

        this.upsertDividend(result.dividend);

        const portfolioId = result.dividend.portfolio_id;

        await this.syncFinancialState(portfolioId, result.current_balance);

        await this.reloadSummary(portfolioId);

        return result;
      } catch (error) {
        this.error = getDividendErrorMessage(error, DIVIDEND_MESSAGES.updateFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async remove(id: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await dividendService.remove(id);

        const portfolioId = result.dividend.portfolio_id;

        this.items = this.items.filter((item) => item.id !== id);

        await this.syncFinancialState(portfolioId, result.current_balance);

        await this.reloadSummary(portfolioId);

        return result;
      } catch (error) {
        this.error = getDividendErrorMessage(error, DIVIDEND_MESSAGES.removeFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async reloadSummary(portfolioId: number) {
      const summary = await dividendService.getSummary(portfolioId, this.selectedYear ?? undefined);

      if (this.portfolioId === portfolioId) {
        this.summary = summary;
      }

      return summary;
    },

    async syncFinancialState(portfolioId: number, currentBalance: number) {
      const portfolioStore = usePortfolioStore();

      const portfolio = portfolioStore.portfolios.find((item) => item.id === portfolioId);

      if (portfolio) {
        portfolio.current_balance = currentBalance;
      } else {
        await portfolioStore.fetchPortfolio(portfolioId);
      }

      await useRecordStore().load(portfolioId);
    },

    upsertDividend(dividend: Dividend) {
      const index = this.items.findIndex((item) => item.id === dividend.id);

      if (index >= 0) {
        this.items[index] = dividend;
      } else {
        this.items.unshift(dividend);
      }

      this.sortItems();
    },

    sortItems() {
      this.items = [...this.items].sort((a, b) => {
        const dateA = new Date(a.payment_date).getTime();
        const dateB = new Date(b.payment_date).getTime();

        return dateB - dateA || b.id - a.id;
      });
    },

    requirePortfolioId(): number {
      if (this.portfolioId === null) {
        throw new Error(DIVIDEND_MESSAGES.portfolioRequired);
      }

      return this.portfolioId;
    },

    clear() {
      this.items = [];
      this.summary = null;
      this.selectedYear = null;
      this.portfolioId = null;
      this.isLoading = false;
      this.isSubmitting = false;
      this.error = null;
    },
  },
});

import { defineStore } from 'pinia';
import { DEFAULT_RECORDS_QUERY, RECORDS_MESSAGES } from '../constants/records.constants';
import { getRecordsErrorMessage, recordsService } from '../services/records.service';
import { usePortfolioStore } from './PortfolioStore';
import type {
  CreateManualRecordPayload,
  CreateTransferPayload,
  PortfolioRecord,
  RecordsQuery,
  RecordsSummary,
} from '../types/records.types';

export const useRecordStore = defineStore('record', {
  state: () => ({
    records: [] as PortfolioRecord[],
    summary: null as RecordsSummary | null,
    portfolioId: null as number | null,
    filters: {
      ...DEFAULT_RECORDS_QUERY,
    } as RecordsQuery,
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
  }),

  getters: {
    activeRecords: (state) => state.records.filter((record) => record.status === 'ACTIVE'),

    reversedRecords: (state) => state.records.filter((record) => record.status === 'REVERSED'),

    manualRecords: (state) => state.records.filter((record) => record.source === 'MANUAL'),

    cashIn: (state) =>
      state.records
        .filter((record) => record.status === 'ACTIVE' && Number(record.amount) > 0)
        .reduce((total, record) => total + Number(record.amount), 0),

    cashOut: (state) =>
      Math.abs(
        state.records
          .filter((record) => record.status === 'ACTIVE' && Number(record.amount) < 0)
          .reduce((total, record) => total + Number(record.amount), 0),
      ),
  },

  actions: {
    clearError() {
      this.error = null;
    },

    setFilters(filters: Partial<RecordsQuery>) {
      this.filters = {
        ...this.filters,
        ...filters,
      };
    },

    resetFilters() {
      this.filters = {
        ...DEFAULT_RECORDS_QUERY,
      };
    },

    async load(portfolioId: number, query: Partial<RecordsQuery> = {}) {
      this.isLoading = true;
      this.error = null;

      try {
        const filters = {
          ...this.filters,
          ...query,
        };

        const [records, summary] = await Promise.all([
          recordsService.getAll(portfolioId, filters),
          recordsService.getSummary(portfolioId),
        ]);

        this.portfolioId = portfolioId;
        this.records = records;
        this.summary = summary;
        this.filters = filters;

        return {
          records,
          summary,
        };
      } catch (error) {
        this.error = getRecordsErrorMessage(error, RECORDS_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async refresh() {
      if (this.portfolioId === null) {
        return null;
      }

      return this.load(this.portfolioId, this.filters);
    },

    async createManual(payload: CreateManualRecordPayload, portfolioId?: number | null) {
      portfolioId ??= this.portfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await recordsService.createManual(id, payload);

        this.records.unshift(result.record);

        await this.reloadSummary(id);
        this.syncPortfolioBalance(id, result.current_balance);

        return result;
      } catch (error) {
        this.error = getRecordsErrorMessage(error, RECORDS_MESSAGES.createFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async transfer(payload: CreateTransferPayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await recordsService.transfer(payload);

        if (this.portfolioId === payload.from_portfolio_id) {
          this.records.unshift(result.transfer_out);
        }

        if (this.portfolioId === payload.to_portfolio_id) {
          this.records.unshift(result.transfer_in);
        }

        await Promise.all([
          this.refreshPortfolioState(payload.from_portfolio_id),
          this.refreshPortfolioState(payload.to_portfolio_id),
        ]);

        if (this.portfolioId !== null) {
          await this.reloadSummary(this.portfolioId);
        }

        return result;
      } catch (error) {
        this.error = getRecordsErrorMessage(error, RECORDS_MESSAGES.transferFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async reverse(recordId: number, reason?: string) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const reversal = await recordsService.reverse(
          recordId,
          reason !== undefined ? { reason } : {},
        );

        const original = this.records.find((record) => record.id === recordId);

        if (original) {
          original.status = 'REVERSED';
        }

        this.records.unshift(reversal);

        if (this.portfolioId !== null) {
          await Promise.all([
            this.reloadSummary(this.portfolioId),
            this.refreshPortfolioState(this.portfolioId),
          ]);
        }

        return reversal;
      } catch (error) {
        this.error = getRecordsErrorMessage(error, RECORDS_MESSAGES.reverseFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async rebuildBalance(portfolioId?: number | null) {
      portfolioId ??= this.portfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await recordsService.rebuildBalance(id);

        this.syncPortfolioBalance(id, result.rebuilt_balance);

        await this.reloadSummary(id);

        return result;
      } catch (error) {
        this.error = getRecordsErrorMessage(error, RECORDS_MESSAGES.rebuildFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async reloadSummary(portfolioId: number) {
      const summary = await recordsService.getSummary(portfolioId);

      if (this.portfolioId === portfolioId) {
        this.summary = summary;
      }

      return summary;
    },

    async refreshPortfolioState(portfolioId: number) {
      const portfolioStore = usePortfolioStore();

      return portfolioStore.fetchPortfolio(portfolioId);
    },

    syncPortfolioBalance(portfolioId: number, currentBalance: number) {
      const portfolioStore = usePortfolioStore();

      const portfolio = portfolioStore.portfolios.find((item) => item.id === portfolioId);

      if (portfolio) {
        portfolio.current_balance = currentBalance;
      }
    },

    requirePortfolioId(portfolioId: number | null): number {
      if (portfolioId === null) {
        throw new Error(RECORDS_MESSAGES.portfolioRequired);
      }

      return portfolioId;
    },

    clear() {
      this.records = [];
      this.summary = null;
      this.portfolioId = null;
      this.filters = {
        ...DEFAULT_RECORDS_QUERY,
      };
      this.isLoading = false;
      this.isSubmitting = false;
      this.error = null;
    },
  },
});

import { defineStore } from 'pinia';
import { TRADE_MESSAGES } from '../constants/trade.constants';
import { getTradeErrorMessage, tradeService } from '../services/trade.service';
import { usePortfolioStore } from './PortfolioStore';
import { useRecordStore } from './RecordStore';
import type {
  CalculatePnlPayload,
  CloseTradePayload,
  CreateTradePayload,
  ImportTradesPayload,
  LeaderboardUser,
  PnlBreakdown,
  Trade,
  UpdateTradePayload,
} from '../types/trade.types';

export const useJournalStore = defineStore('journal', {
  state: () => ({
    trades: [] as Trade[],
    currentPortfolioId: null as number | null,
    pnlPreview: null as PnlBreakdown | null,
    leaderboard: [] as LeaderboardUser[],
    isLoading: false,
    isSubmitting: false,
    isImporting: false,
    isCalculatingPnl: false,
    isLoadingLeaderboard: false,
    error: null as string | null,
  }),

  getters: {
    activeTrades: (state) => state.trades.filter((trade) => trade.result_status === 'OPEN'),

    closedTrades: (state) => state.trades.filter((trade) => trade.result_status !== 'OPEN'),

    winningTrades: (state) => state.trades.filter((trade) => trade.result_status === 'WIN'),

    losingTrades: (state) => state.trades.filter((trade) => trade.result_status === 'LOSS'),

    totalPnl: (state) => state.trades.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0),

    winRate(): number | null {
      const closed = this.closedTrades;

      if (closed.length === 0) {
        return null;
      }

      return Number(((this.winningTrades.length / closed.length) * 100).toFixed(2));
    },
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async loadPortfolio(portfolioId: number) {
      this.isLoading = true;
      this.error = null;

      try {
        const trades = await tradeService.getByPortfolio(portfolioId);

        this.currentPortfolioId = portfolioId;
        this.trades = trades;

        return trades;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async refresh() {
      if (this.currentPortfolioId === null) {
        return null;
      }

      return this.loadPortfolio(this.currentPortfolioId);
    },

    async createOpenTrade(payload: CreateTradePayload) {
      const portfolioId = this.requirePortfolioId();

      this.isSubmitting = true;
      this.error = null;

      try {
        const trade = await tradeService.createOpen(portfolioId, payload);

        this.upsertTrade(trade);

        return trade;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.createFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async createClosedTrade(payload: CreateTradePayload) {
      const portfolioId = this.requirePortfolioId();

      this.isSubmitting = true;
      this.error = null;

      try {
        const trade = await tradeService.createClosed(portfolioId, payload);

        this.upsertTrade(trade);

        await this.syncFinancialState(portfolioId);

        return trade;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.createFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async updateOpenTrade(id: number, payload: UpdateTradePayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const trade = await tradeService.update(id, payload);

        this.upsertTrade(trade);

        return trade;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.updateFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async closeTrade(id: number, payload: CloseTradePayload) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const trade = await tradeService.close(id, payload);

        this.upsertTrade(trade);

        if (trade.portfolio_id !== null) {
          await this.syncFinancialState(trade.portfolio_id);
        }

        return trade;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.closeFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async removeTrade(id: number) {
      this.isSubmitting = true;
      this.error = null;

      try {
        const result = await tradeService.remove(id);

        this.trades = this.trades.filter((trade) => trade.id !== id);

        return result;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.deleteFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async importBrokerTrades(payload: ImportTradesPayload) {
      const portfolioId = this.requirePortfolioId();

      this.isImporting = true;
      this.error = null;

      try {
        const result = await tradeService.importTrades(portfolioId, payload);

        await Promise.all([this.loadPortfolio(portfolioId), this.syncFinancialState(portfolioId)]);

        return result;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.importFailed);
        throw error;
      } finally {
        this.isImporting = false;
      }
    },

    async calculatePnl(payload: CalculatePnlPayload) {
      this.isCalculatingPnl = true;
      this.error = null;

      try {
        const result = await tradeService.calculatePnl(payload);

        this.pnlPreview = result;

        return result;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.pnlFailed);
        throw error;
      } finally {
        this.isCalculatingPnl = false;
      }
    },

    async fetchLeaderboard() {
      this.isLoadingLeaderboard = true;
      this.error = null;

      try {
        const rows = await tradeService.leaderboard();

        this.leaderboard = rows.map((item, index) => {
          const username = item.username || 'Anonymous';

          return {
            rank: index + 1,
            username,
            initials: username.slice(0, 2).toUpperCase(),
            initial: Number(item.initial_balance ?? 0),
            net: Number(item.current_balance ?? 0),
            totalPnl: Number(item.total_pnl ?? 0),
            winRate:
              item.win_rate === null || item.win_rate === undefined ? null : Number(item.win_rate),
          };
        });

        return this.leaderboard;
      } catch (error) {
        this.error = getTradeErrorMessage(error, TRADE_MESSAGES.leaderboardFailed);
        throw error;
      } finally {
        this.isLoadingLeaderboard = false;
      }
    },

    async syncFinancialState(portfolioId: number) {
      await Promise.all([
        usePortfolioStore().fetchPortfolio(portfolioId),
        useRecordStore().load(portfolioId),
      ]);
    },

    upsertTrade(trade: Trade) {
      const index = this.trades.findIndex((item) => item.id === trade.id);

      if (index >= 0) {
        this.trades[index] = trade;
      } else {
        this.trades.unshift(trade);
      }

      this.sortTrades();
    },

    sortTrades() {
      this.trades = [...this.trades].sort((a, b) => {
        const dateA = new Date(a.closed_at ?? a.opened_at ?? a.created_at ?? 0).getTime();
        const dateB = new Date(b.closed_at ?? b.opened_at ?? b.created_at ?? 0).getTime();

        return dateB - dateA || b.id - a.id;
      });
    },

    requirePortfolioId(): number {
      if (this.currentPortfolioId === null) {
        throw new Error(TRADE_MESSAGES.portfolioRequired);
      }

      return this.currentPortfolioId;
    },

    clearPnlPreview() {
      this.pnlPreview = null;
    },

    clear() {
      this.trades = [];
      this.currentPortfolioId = null;
      this.pnlPreview = null;
      this.isLoading = false;
      this.isSubmitting = false;
      this.isImporting = false;
      this.isCalculatingPnl = false;
      this.error = null;
    },
  },
});

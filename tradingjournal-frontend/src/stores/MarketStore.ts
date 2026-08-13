import { defineStore } from 'pinia';
import {
  DEFAULT_EARNINGS_DAYS_AHEAD,
  DEFAULT_MARKET_INTERVAL,
  MARKET_MESSAGES,
  MAX_EARNINGS_DAYS_AHEAD,
} from '../constants/market.constants';
import { getMarketErrorMessage, marketService } from '../services/market.service';
import { usePortfolioStore } from './PortfolioStore';
import type {
  EarningsCalendar,
  HistoricalInterval,
  HistoricalPricePoint,
  MarketCacheStats,
  MarketPriceRow,
  SyncPortfolioResponse,
  TechnicalAnalysis,
} from '../types/market.types';

export const useMarketStore = defineStore('market', {
  state: () => ({
    quotes: {} as Record<string, number | null>,

    selectedSymbol: null as string | null,

    history: [] as HistoricalPricePoint[],

    selectedInterval: DEFAULT_MARKET_INTERVAL,

    technicalAnalysis: null as TechnicalAnalysis | null,

    earningsCalendar: null as EarningsCalendar | null,

    storedPrices: [] as MarketPriceRow[],

    cacheStats: null as MarketCacheStats | null,

    lastPortfolioSync: null as SyncPortfolioResponse | null,

    isLoadingQuotes: false,
    isLoadingHistory: false,
    isLoadingAnalysis: false,
    isLoadingEarnings: false,
    isLoadingStoredPrices: false,
    isSyncing: false,

    error: null as string | null,
  }),

  getters: {
    activePortfolioId(): number | null {
      return usePortfolioStore().activePortfolio?.id ?? null;
    },

    activePortfolioType(): 'TRADER' | 'INVESTOR' | null {
      return usePortfolioStore().activePortfolio?.portfolio_type ?? null;
    },

    selectedPrice(state): number | null {
      if (!state.selectedSymbol) {
        return null;
      }

      return state.quotes[state.selectedSymbol] ?? null;
    },

    hasSelectedAnalysis: (state) => state.technicalAnalysis !== null,

    earningsItems: (state) => state.earningsCalendar?.items ?? [],

    isLoading(state) {
      return (
        state.isLoadingQuotes ||
        state.isLoadingHistory ||
        state.isLoadingAnalysis ||
        state.isLoadingEarnings ||
        state.isLoadingStoredPrices ||
        state.isSyncing
      );
    },
  },

  actions: {
    clearError() {
      this.error = null;
    },

    setSelectedSymbol(symbol: string | null) {
      this.selectedSymbol = symbol ? symbol.trim().toUpperCase() : null;
    },

    setInterval(interval: HistoricalInterval) {
      this.selectedInterval = interval;
    },

    async fetchQuotes(symbols: string[]) {
      this.isLoadingQuotes = true;
      this.error = null;

      try {
        const quotes = await marketService.getQuotes(symbols);

        this.quotes = {
          ...this.quotes,
          ...quotes,
        };

        return quotes;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.quotesFailed);
        throw error;
      } finally {
        this.isLoadingQuotes = false;
      }
    },

    async fetchQuote(symbol: string) {
      const normalized = symbol.trim().toUpperCase();

      this.setSelectedSymbol(normalized);

      const result = await this.fetchQuotes([normalized]);

      return result[normalized] ?? null;
    },

    async fetchHistory(symbol: string, from: string, to: string, interval?: HistoricalInterval) {
      interval ??= this.selectedInterval;
      this.isLoadingHistory = true;
      this.error = null;

      const normalized = symbol.trim().toUpperCase();

      this.setSelectedSymbol(normalized);
      this.selectedInterval = interval;

      try {
        const history = await marketService.getHistory({
          symbol: normalized,
          from,
          to,
          interval,
        });

        this.history = history;

        return history;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.historyFailed);
        this.history = [];
        throw error;
      } finally {
        this.isLoadingHistory = false;
      }
    },

    async fetchTechnicalAnalysis(symbol: string) {
      this.isLoadingAnalysis = true;
      this.error = null;

      const normalized = symbol.trim().toUpperCase();

      this.setSelectedSymbol(normalized);

      try {
        const analysis = await marketService.getTechnicalAnalysis(normalized);

        this.technicalAnalysis = analysis;

        this.quotes[normalized] = analysis.currentPrice;

        return analysis;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.analysisFailed);
        this.technicalAnalysis = null;
        throw error;
      } finally {
        this.isLoadingAnalysis = false;
      }
    },

    async fetchSymbolSnapshot(symbol: string) {
      const normalized = symbol.trim().toUpperCase();

      const [quote, analysis] = await Promise.all([
        this.fetchQuote(normalized),
        this.fetchTechnicalAnalysis(normalized),
      ]);

      return {
        quote,
        analysis,
      };
    },

    async fetchEarningsCalendar(daysAhead = DEFAULT_EARNINGS_DAYS_AHEAD) {
      this.isLoadingEarnings = true;
      this.error = null;

      const normalizedDays =
        Number.isInteger(daysAhead) && daysAhead > 0 && daysAhead <= MAX_EARNINGS_DAYS_AHEAD
          ? daysAhead
          : DEFAULT_EARNINGS_DAYS_AHEAD;

      try {
        const calendar = await marketService.getEarningsCalendar(normalizedDays);

        this.earningsCalendar = calendar;

        return calendar;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.earningsFailed);
        throw error;
      } finally {
        this.isLoadingEarnings = false;
      }
    },

    async fetchStoredPrices(symbols?: string[], currency?: string) {
      this.isLoadingStoredPrices = true;
      this.error = null;

      try {
        const rows = await marketService.getStoredPrices({
          ...(symbols !== undefined ? { symbols } : {}),
          ...(currency !== undefined ? { currency } : {}),
        });

        this.storedPrices = rows;

        for (const row of rows) {
          this.quotes[row.symbol] = Number(row.price);
        }

        return rows;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.storedPricesFailed);
        throw error;
      } finally {
        this.isLoadingStoredPrices = false;
      }
    },

    async syncInvestorSymbol(symbol: string, currency = 'USD') {
      this.isSyncing = true;
      this.error = null;

      try {
        const row = await marketService.syncSymbol(symbol, currency);

        this.quotes[row.symbol] = Number(row.price);

        this.upsertStoredPrice(row);

        return row;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.syncSymbolFailed);
        throw error;
      } finally {
        this.isSyncing = false;
      }
    },

    async syncActiveInvestorPortfolio() {
      const portfolio = usePortfolioStore().activePortfolio;

      if (!portfolio || portfolio.portfolio_type !== 'INVESTOR') {
        throw new Error('ฟังก์ชันนี้ใช้กับ Investor Portfolio เท่านั้น');
      }

      this.isSyncing = true;
      this.error = null;

      try {
        const result = await marketService.syncPortfolio(portfolio.id);

        this.lastPortfolioSync = result;

        for (const row of result.prices) {
          const price = Number(row.price);

          if (Number.isFinite(price)) {
            this.quotes[row.symbol] = price;
          }

          this.upsertStoredPrice(row);
        }

        return result;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.syncPortfolioFailed);
        throw error;
      } finally {
        this.isSyncing = false;
      }
    },

    async fetchCacheStats() {
      try {
        const stats = await marketService.getCacheStats();

        this.cacheStats = stats;

        return stats;
      } catch (error) {
        this.error = getMarketErrorMessage(error, MARKET_MESSAGES.cacheFailed);
        throw error;
      }
    },

    upsertStoredPrice(row: MarketPriceRow) {
      const index = this.storedPrices.findIndex(
        (item) => item.symbol === row.symbol && item.currency === row.currency,
      );

      if (index >= 0) {
        this.storedPrices[index] = row;
      } else {
        this.storedPrices.push(row);
      }
    },

    clearSelectedMarketData() {
      this.selectedSymbol = null;
      this.history = [];
      this.technicalAnalysis = null;
    },

    clear() {
      this.quotes = {};
      this.clearSelectedMarketData();
      this.selectedInterval = DEFAULT_MARKET_INTERVAL;
      this.earningsCalendar = null;
      this.storedPrices = [];
      this.cacheStats = null;
      this.lastPortfolioSync = null;
      this.isLoadingQuotes = false;
      this.isLoadingHistory = false;
      this.isLoadingAnalysis = false;
      this.isLoadingEarnings = false;
      this.isLoadingStoredPrices = false;
      this.isSyncing = false;
      this.error = null;
    },
  },
});

import { defineStore } from 'pinia';
import { WATCHLIST_DEFAULTS, WATCHLIST_MESSAGES } from '../constants/watchlist.constants';
import { getWatchlistErrorMessage, watchlistService } from '../services/watchlist.service';
import { usePortfolioStore } from './PortfolioStore';
import type { UserWatchlistQuery, WatchlistItem, WatchlistScope } from '../types/watchlist.types';

export const useWatchlistStore = defineStore('watchlist', {
  state: () => ({
    items: [] as WatchlistItem[],
    loadedPortfolioId: null as number | null,
    activeScope: 'ALL' as WatchlistScope,
    currency: WATCHLIST_DEFAULTS.currency as string,
    isLoading: false,
    isSubmitting: false,
    error: null as string | null,
  }),

  getters: {
    activePortfolioId(): number | null {
      return usePortfolioStore().activePortfolio?.id ?? null;
    },

    activePortfolioType(): 'TRADER' | 'INVESTOR' | null {
      return usePortfolioStore().activePortfolio?.portfolio_type ?? null;
    },

    currentItems(state): WatchlistItem[] {
      const type = this.activePortfolioType;

      if (!type) {
        return [];
      }

      return state.items.filter((item) => item.portfolio_type === type);
    },

    traderItems: (state) => state.items.filter((item) => item.portfolio_type === 'TRADER'),

    investorItems: (state) => state.items.filter((item) => item.portfolio_type === 'INVESTOR'),

    thaiItems: (state) => state.items.filter((item) => item.market_region === 'TH'),

    globalItems: (state) => state.items.filter((item) => item.market_region !== 'TH'),
  },

  actions: {
    clearError() {
      this.error = null;
    },

    async loadForPortfolio(portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isLoading = true;
      this.error = null;

      try {
        const items = await watchlistService.getForPortfolio(id);

        this.items = items;
        this.loadedPortfolioId = id;
        this.activeScope = this.activePortfolioType ?? 'ALL';

        return items;
      } catch (error) {
        this.error = getWatchlistErrorMessage(error, WATCHLIST_MESSAGES.loadFailed);
        this.items = [];
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async loadUserWatchlist(query: UserWatchlistQuery = {}) {
      this.isLoading = true;
      this.error = null;

      try {
        const scope = query.scope ?? WATCHLIST_DEFAULTS.scope;
        const currency = query.currency ?? this.currency;

        const items = await watchlistService.getUserWatchlist({
          scope,
          currency,
        });

        this.items = items;
        this.activeScope = scope;
        this.currency = currency;

        return items;
      } catch (error) {
        this.error = getWatchlistErrorMessage(error, WATCHLIST_MESSAGES.loadFailed);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async addAsset(symbol: string, portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isSubmitting = true;
      this.error = null;

      try {
        const created = await watchlistService.add(id, { symbol });

        this.upsertItem(created);

        return created;
      } catch (error) {
        this.error = getWatchlistErrorMessage(error, WATCHLIST_MESSAGES.addFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async removeAsset(symbol: string, portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isSubmitting = true;
      this.error = null;

      try {
        const removed = await watchlistService.remove(id, symbol);

        const normalized = symbol.trim().toUpperCase();

        this.items = this.items.filter((item) => item.symbol !== normalized);

        return removed;
      } catch (error) {
        this.error = getWatchlistErrorMessage(error, WATCHLIST_MESSAGES.removeFailed);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },

    async checkSymbol(symbol: string, portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      try {
        return await watchlistService.check(id, symbol);
      } catch (error) {
        this.error = getWatchlistErrorMessage(error, WATCHLIST_MESSAGES.checkFailed);
        throw error;
      }
    },

    upsertItem(item: WatchlistItem) {
      const index = this.items.findIndex((current) => current.symbol === item.symbol);

      if (index >= 0) {
        this.items[index] = item;
      } else {
        this.items.unshift(item);
      }
    },

    requirePortfolioId(portfolioId: number | null): number {
      if (portfolioId === null) {
        throw new Error(WATCHLIST_MESSAGES.portfolioRequired);
      }

      return portfolioId;
    },

    clear() {
      this.items = [];
      this.loadedPortfolioId = null;
      this.activeScope = 'ALL';
      this.currency = WATCHLIST_DEFAULTS.currency;
      this.isLoading = false;
      this.isSubmitting = false;
      this.error = null;
    },
  },
});

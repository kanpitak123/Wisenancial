import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useWatchlistStore } from '../stores/WatchlistStore';
import type { UserWatchlistQuery } from '../types/watchlist.types';

export function useWatchlist() {
  const store = useWatchlistStore();

  const { items, loadedPortfolioId, activeScope, currency, isLoading, isSubmitting, error } =
    storeToRefs(store);

  const activePortfolioId = computed(() => store.activePortfolioId);

  const activePortfolioType = computed(() => store.activePortfolioType);

  const currentItems = computed(() => store.currentItems);

  const traderItems = computed(() => store.traderItems);

  const investorItems = computed(() => store.investorItems);

  const thaiItems = computed(() => store.thaiItems);

  const globalItems = computed(() => store.globalItems);

  return {
    items,
    loadedPortfolioId,
    activeScope,
    currency,
    isLoading,
    isSubmitting,
    error,

    activePortfolioId,
    activePortfolioType,
    currentItems,
    traderItems,
    investorItems,
    thaiItems,
    globalItems,

    loadForPortfolio: (portfolioId?: number | null) => store.loadForPortfolio(portfolioId),
    loadUserWatchlist: (query: UserWatchlistQuery = {}) => store.loadUserWatchlist(query),
    addAsset: (symbol: string, portfolioId?: number | null) => store.addAsset(symbol, portfolioId),
    removeAsset: (symbol: string, portfolioId?: number | null) =>
      store.removeAsset(symbol, portfolioId),
    checkSymbol: (symbol: string, portfolioId?: number | null) =>
      store.checkSymbol(symbol, portfolioId),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

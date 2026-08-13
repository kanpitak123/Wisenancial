import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useMarketStore } from '../stores/MarketStore';
import type { HistoricalInterval } from '../types/market.types';

export function useMarket() {
  const store = useMarketStore();

  const {
    quotes,
    selectedSymbol,
    history,
    selectedInterval,
    technicalAnalysis,
    earningsCalendar,
    storedPrices,
    cacheStats,
    lastPortfolioSync,
    isLoadingQuotes,
    isLoadingHistory,
    isLoadingAnalysis,
    isLoadingEarnings,
    isLoadingStoredPrices,
    isSyncing,
    error,
  } = storeToRefs(store);

  const selectedPrice = computed(() => store.selectedPrice);

  const earningsItems = computed(() => store.earningsItems);

  const isLoading = computed(() => store.isLoading);

  const activePortfolioId = computed(() => store.activePortfolioId);

  const activePortfolioType = computed(() => store.activePortfolioType);

  return {
    quotes,
    selectedSymbol,
    history,
    selectedInterval,
    technicalAnalysis,
    earningsCalendar,
    storedPrices,
    cacheStats,
    lastPortfolioSync,
    isLoadingQuotes,
    isLoadingHistory,
    isLoadingAnalysis,
    isLoadingEarnings,
    isLoadingStoredPrices,
    isSyncing,
    error,

    selectedPrice,
    earningsItems,
    isLoading,
    activePortfolioId,
    activePortfolioType,

    setSelectedSymbol: (symbol: string | null) => store.setSelectedSymbol(symbol),
    setInterval: (interval: HistoricalInterval) => store.setInterval(interval),
    fetchQuotes: (symbols: string[]) => store.fetchQuotes(symbols),
    fetchQuote: (symbol: string) => store.fetchQuote(symbol),
    fetchHistory: (symbol: string, from: string, to: string, interval?: HistoricalInterval) =>
      store.fetchHistory(symbol, from, to, interval),
    fetchTechnicalAnalysis: (symbol: string) => store.fetchTechnicalAnalysis(symbol),
    fetchSymbolSnapshot: (symbol: string) => store.fetchSymbolSnapshot(symbol),
    fetchEarningsCalendar: (daysAhead?: number) => store.fetchEarningsCalendar(daysAhead),
    fetchStoredPrices: (symbols?: string[], currency?: string) =>
      store.fetchStoredPrices(symbols, currency),
    syncInvestorSymbol: (symbol: string, currency?: string) =>
      store.syncInvestorSymbol(symbol, currency),
    syncActiveInvestorPortfolio: () => store.syncActiveInvestorPortfolio(),
    fetchCacheStats: () => store.fetchCacheStats(),
    clearError: () => store.clearError(),
    clearSelectedMarketData: () => store.clearSelectedMarketData(),
    clear: () => store.clear(),
  };
}

import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useAssetStore } from '../stores/AssetStore';
import type { Asset, ChartInterval } from '../types/asset.types';

export function useAssets() {
  const store = useAssetStore();

  const {
    assets,
    activeAsset,
    chartData,
    monthlyData,
    investorOverview,
    investorNews,
    corporateEvents,
    trendingStocks,
    valuation,
    loadedPortfolioId,
    selectedSector,
    selectedInterval,
    isLoading,
    isLoadingChart,
    isLoadingDetails,
    error,
  } = storeToRefs(store);

  const activePortfolioId = computed(() => store.activePortfolioId);

  const activePortfolioType = computed(() => store.activePortfolioType);

  const traderAssets = computed(() => store.traderAssets);

  const investorAssets = computed(() => store.investorAssets);

  const sectors = computed(() => store.sectors);

  return {
    assets,
    activeAsset,
    chartData,
    monthlyData,
    investorOverview,
    investorNews,
    corporateEvents,
    trendingStocks,
    valuation,
    loadedPortfolioId,
    selectedSector,
    selectedInterval,
    isLoading,
    isLoadingChart,
    isLoadingDetails,
    error,

    activePortfolioId,
    activePortfolioType,
    traderAssets,
    investorAssets,
    sectors,

    fetchAssets: (sector?: string) => store.fetchAssets(sector),
    setActiveAsset: (asset: Asset, interval?: ChartInterval) =>
      store.setActiveAsset(asset, interval),
    fetchChartData: (symbol: string, interval?: ChartInterval) =>
      store.fetchChartData(symbol, interval),
    fetchMonthlyData: (assetId: number) => store.fetchMonthlyData(assetId),
    fetchInvestorOverview: () => store.fetchInvestorOverview(),
    fetchInvestorNews: (symbol: string) => store.fetchInvestorNews(symbol),
    fetchCorporateEvents: (symbol: string) => store.fetchCorporateEvents(symbol),
    fetchTrendingStocks: (sector?: string) => store.fetchTrendingStocks(sector),
    fetchStockValuation: (symbol: string) => store.fetchStockValuation(symbol),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

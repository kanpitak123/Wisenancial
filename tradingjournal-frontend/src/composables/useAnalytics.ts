import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useAnalyticsStore } from '../stores/AnalyticsStore';
import type {
  AnalyticsDateRange,
  AnalyticsPortfolioType,
  AnalyticsTimeframe,
  DCASimulatorRequest,
} from '../types/analytics.types';

export function useAnalytics() {
  const store = useAnalyticsStore();

  const {
    portfolioId,
    portfolioType,
    timeframe,
    dateRange,
    overview,
    performance,
    dailyPnl,
    monthlyGrowth,
    behavioral,
    winRate,
    timeline,
    allocation,
    benchmark,
    timeWeightedReturn,
    heatmap,
    performers,
    holdingPeriod,
    cashFlow,
    dcaSimulation,
    selectedBenchmark,
    isLoading,
    isLoadingDetails,
    isLoadingAdvanced,
    isSimulatingDca,
    paidAccessDenied,
    error,
  } = storeToRefs(store);

  const isTrader = computed(() => store.isTrader);

  const isInvestor = computed(() => store.isInvestor);

  const summary = computed(() => store.summary);

  const holdings = computed(() => store.holdings);

  const recentActivity = computed(() => store.recentActivity);

  const chartData = computed(() => store.chartData);

  return {
    portfolioId,
    portfolioType,
    timeframe,
    dateRange,
    overview,
    performance,
    dailyPnl,
    monthlyGrowth,
    behavioral,
    winRate,
    timeline,
    allocation,
    benchmark,
    timeWeightedReturn,
    heatmap,
    performers,
    holdingPeriod,
    cashFlow,
    dcaSimulation,
    selectedBenchmark,
    isLoading,
    isLoadingDetails,
    isLoadingAdvanced,
    isSimulatingDca,
    paidAccessDenied,
    error,

    isTrader,
    isInvestor,
    summary,
    holdings,
    recentActivity,
    chartData,

    initialize: (id?: number, type?: AnalyticsPortfolioType) => store.initialize(id, type),

    loadCore: (range?: AnalyticsDateRange) => store.loadCore(range),

    loadDetails: (range?: AnalyticsDateRange) => store.loadDetails(range),

    loadAdvanced: (benchmarkSymbol?: string) => store.loadAdvanced(benchmarkSymbol),

    setTimeframe: (value: AnalyticsTimeframe) => store.setTimeframe(value),

    setDateRange: (range: AnalyticsDateRange) => store.setDateRange(range),

    simulateDca: (payload: DCASimulatorRequest) => store.simulateDca(payload),

    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

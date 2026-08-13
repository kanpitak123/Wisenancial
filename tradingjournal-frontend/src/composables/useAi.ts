import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAiStore } from 'src/stores/AiStore';
import type { PortfolioRiskHolding } from 'src/types/ai.types';

export function useAi() {
  const store = useAiStore();

  const {
    models,
    minBalance,
    selectedModelId,
    insights,
    portfolioReview,
    growthRecommendations,
    riskAnalysis,
    normalizedRiskHoldings,
    quiz,
    loadingModels,
    loadingInsight,
    loadingReview,
    loadingRecommendations,
    loadingRisk,
    loadingQuiz,
    loadingCredits,
    insufficientCredits,
    error,
  } = storeToRefs(store);

  const credits = computed(() => store.credits);
  const canAfford = computed(() => store.canAfford);
  const selectedModel = computed(() => store.selectedModel);
  const traderReview = computed(() => store.traderReview);
  const investorReview = computed(() => store.investorReview);
  const isLoading = computed(() => store.isLoading);

  return {
    store,
    models,
    minBalance,
    selectedModelId,
    insights,
    portfolioReview,
    growthRecommendations,
    riskAnalysis,
    normalizedRiskHoldings,
    quiz,
    loadingModels,
    loadingInsight,
    loadingReview,
    loadingRecommendations,
    loadingRisk,
    loadingQuiz,
    loadingCredits,
    insufficientCredits,
    error,

    credits,
    canAfford,
    selectedModel,
    traderReview,
    investorReview,
    isLoading,

    fetchModels: (force?: boolean) => store.fetchModels(force),

    setSelectedModel: (modelId: string | null) => store.setSelectedModel(modelId),

    analyzeChart: (payload: Parameters<typeof store.analyzeChart>[0]) =>
      store.analyzeChart(payload),

    reviewPortfolio: (
      portfolioId: number,
      items?: unknown[],
      analytics?: Record<string, unknown>,
    ) => store.reviewPortfolio(portfolioId, items, analytics),

    loadGrowthRecommendations: () => store.loadGrowthRecommendations(),

    analyzeRisk: (holdings: PortfolioRiskHolding[]) => store.analyzeRisk(holdings),

    generateQuiz: (lessonTitle: string, lessonDescription: string) =>
      store.generateQuiz(lessonTitle, lessonDescription),

    refreshCredits: () => store.refreshCredits(),

    clearInsight: (key: string) => store.clearInsight(key),

    clearError: () => store.clearError(),

    clear: () => store.clear(),
  };
}

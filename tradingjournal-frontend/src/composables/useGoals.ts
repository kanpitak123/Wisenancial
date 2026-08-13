import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useGoalStore } from '../stores/GoalStore';

export function useGoals() {
  const store = useGoalStore();

  const { monthlyPlan, dailyPnl, isLoading, isSubmitting, error } = storeToRefs(store);

  const activePortfolioId = computed(() => store.activePortfolioId);

  const activePortfolioType = computed(() => store.activePortfolioType);

  const hasGoal = computed(() => store.hasGoal);

  const isGoalReached = computed(() => store.isGoalReached);

  return {
    monthlyPlan,
    dailyPnl,
    isLoading,
    isSubmitting,
    error,

    activePortfolioId,
    activePortfolioType,
    hasGoal,
    isGoalReached,

    initialize: (year?: number, month?: number) => store.initialize(year, month),
    loadGoalByMonth: (portfolioId: number, year: number, month: number) =>
      store.loadGoalByMonth(portfolioId, year, month),
    setTargetPnL: (portfolioId: number, year: number, month: number, target: number) =>
      store.setTargetPnL(portfolioId, year, month, target),
    setActivePortfolioGoal: (year: number, month: number, target: number) =>
      store.setActivePortfolioGoal(year, month, target),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

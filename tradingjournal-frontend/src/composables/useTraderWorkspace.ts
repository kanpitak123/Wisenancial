import { computed } from 'vue';
import { useTraderStore } from 'src/stores/TraderStore';

export function useTraderWorkspace() {
  const traderStore = useTraderStore();

  return {
    loading: computed(() => traderStore.loading),
    initialized: computed(() => traderStore.initialized),
    activePortfolio: computed(() => traderStore.activePortfolio),
    activePortfolioId: computed(() => traderStore.activePortfolioId),
    hasPortfolio: computed(() => traderStore.hasPortfolio),
    initialize: (...args: Parameters<typeof traderStore.initialize>) =>
      traderStore.initialize(...args),
    selectPortfolio: (...args: Parameters<typeof traderStore.selectPortfolio>) =>
      traderStore.selectPortfolio(...args),
    refreshPortfolio: (...args: Parameters<typeof traderStore.refreshPortfolio>) =>
      traderStore.refreshPortfolio(...args),
  };
}

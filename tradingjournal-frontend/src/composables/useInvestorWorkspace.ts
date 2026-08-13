import { computed } from 'vue';
import { useInvestorStore } from 'src/stores/InvestorStore';

export function useInvestorWorkspace() {
  const investorStore = useInvestorStore();

  return {
    loading: computed(() => investorStore.loading),
    initialized: computed(() => investorStore.initialized),
    activePortfolio: computed(() => investorStore.activePortfolio),
    activePortfolioId: computed(() => investorStore.activePortfolioId),
    hasPortfolio: computed(() => investorStore.hasPortfolio),
    initialize: (...args: Parameters<typeof investorStore.initialize>) =>
      investorStore.initialize(...args),
    selectPortfolio: (...args: Parameters<typeof investorStore.selectPortfolio>) =>
      investorStore.selectPortfolio(...args),
    refreshPortfolio: (...args: Parameters<typeof investorStore.refreshPortfolio>) =>
      investorStore.refreshPortfolio(...args),
  };
}

import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { usePortfolioStore } from '../stores/PortfolioStore';
import type {
  CreatePortfolioPayload,
  PortfolioType,
  UpdatePortfolioPayload,
} from '../types/portfolio.types';

export function usePortfolio() {
  const store = usePortfolioStore();

  const {
    portfolios,
    activePortfolioIds,
    activeType,
    isLoading,
    isSubmitting,
    hasLoadedAll,
    loadedTypes,
    error,
  } = storeToRefs(store);

  const traderPortfolios = computed(() => store.traderPortfolios);

  const investorPortfolios = computed(() => store.investorPortfolios);

  const currentPortfolios = computed(() => store.currentPortfolios);

  const activePortfolio = computed(() => store.activePortfolio);

  const activePortfolioId = computed(() => store.activePortfolioId);

  const activeTraderPortfolio = computed(() => store.activeTraderPortfolio);

  const activeInvestorPortfolio = computed(() => store.activeInvestorPortfolio);

  const loadPortfolios = (type?: PortfolioType, force = false) => store.loadPortfolios(type, force);

  const fetchPortfolio = (id: number) => store.fetchPortfolio(id);

  const createPortfolio = (payload: CreatePortfolioPayload) => store.createPortfolio(payload);

  const updatePortfolio = (id: number, payload: UpdatePortfolioPayload) =>
    store.updatePortfolio(id, payload);

  const deletePortfolio = (id: number) => store.deletePortfolio(id);

  return {
    portfolios,
    activePortfolioIds,
    activeType,
    isLoading,
    isSubmitting,
    hasLoadedAll,
    loadedTypes,
    error,

    traderPortfolios,
    investorPortfolios,
    currentPortfolios,
    activePortfolio,
    activePortfolioId,
    activeTraderPortfolio,
    activeInvestorPortfolio,

    loadPortfolios,
    fetchPortfolio,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    selectPortfolio: (id: number) => store.selectPortfolio(id),
    setActiveType: (type: PortfolioType) => store.setActiveType(type),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

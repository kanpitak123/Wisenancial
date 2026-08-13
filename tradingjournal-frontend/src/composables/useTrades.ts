import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useJournalStore } from '../stores/JournalStore';
import type {
  CalculatePnlPayload,
  CloseTradePayload,
  CreateTradePayload,
  ImportTradesPayload,
  UpdateTradePayload,
} from '../types/trade.types';

export function useTrades() {
  const store = useJournalStore();

  const {
    trades,
    currentPortfolioId,
    pnlPreview,
    leaderboard,
    isLoading,
    isSubmitting,
    isImporting,
    isCalculatingPnl,
    isLoadingLeaderboard,
    error,
  } = storeToRefs(store);

  const activeTrades = computed(() => store.activeTrades);

  const closedTrades = computed(() => store.closedTrades);

  const winningTrades = computed(() => store.winningTrades);

  const losingTrades = computed(() => store.losingTrades);

  const totalPnl = computed(() => store.totalPnl);

  const winRate = computed(() => store.winRate);

  return {
    trades,
    currentPortfolioId,
    pnlPreview,
    leaderboard,
    isLoading,
    isSubmitting,
    isImporting,
    isCalculatingPnl,
    isLoadingLeaderboard,
    error,

    activeTrades,
    closedTrades,
    winningTrades,
    losingTrades,
    totalPnl,
    winRate,

    loadPortfolio: (...args: Parameters<typeof store.loadPortfolio>) =>
      store.loadPortfolio(...args),
    refresh: () => store.refresh(),
    createOpenTrade: (payload: CreateTradePayload) => store.createOpenTrade(payload),
    createClosedTrade: (payload: CreateTradePayload) => store.createClosedTrade(payload),
    updateOpenTrade: (id: number, payload: UpdateTradePayload) =>
      store.updateOpenTrade(id, payload),
    closeTrade: (id: number, payload: CloseTradePayload) => store.closeTrade(id, payload),
    removeTrade: (id: number) => store.removeTrade(id),
    importBrokerTrades: (payload: ImportTradesPayload) => store.importBrokerTrades(payload),
    calculatePnl: (payload: CalculatePnlPayload) => store.calculatePnl(payload),
    fetchLeaderboard: (...args: Parameters<typeof store.fetchLeaderboard>) =>
      store.fetchLeaderboard(...args),
    clearPnlPreview: () => store.clearPnlPreview(),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useShareStore } from '../stores/ShareStore';
import type { LogShareActivityPayload, SharePlatform } from '../types/share.types';

export function useShare() {
  const store = useShareStore();

  const {
    statistics,
    generatedMessages,
    generatedImage,
    socialData,
    logs,
    selectedPlatform,
    loadedPortfolioId,
    isLoadingStatistics,
    isGeneratingMessage,
    isGeneratingImage,
    isLoadingSocialData,
    isLoadingLogs,
    isLoggingShare,
    paidAccessDenied,
    error,
  } = storeToRefs(store);

  const activePortfolioId = computed(() => store.activePortfolioId);

  const activePortfolioType = computed(() => store.activePortfolioType);

  const currentMessage = computed(() => store.currentMessage);

  const currentShareUrl = computed(() => store.currentShareUrl);

  const isLoading = computed(() => store.isLoading);

  return {
    statistics,
    generatedMessages,
    generatedImage,
    socialData,
    logs,
    selectedPlatform,
    loadedPortfolioId,
    isLoadingStatistics,
    isGeneratingMessage,
    isGeneratingImage,
    isLoadingSocialData,
    isLoadingLogs,
    isLoggingShare,
    paidAccessDenied,
    error,

    activePortfolioId,
    activePortfolioType,
    currentMessage,
    currentShareUrl,
    isLoading,

    initialize: (portfolioId?: number | null) => store.initialize(portfolioId),
    setSelectedPlatform: (platform: SharePlatform) => store.setSelectedPlatform(platform),
    loadStatistics: (portfolioId?: number | null) => store.loadStatistics(portfolioId),
    generateMessage: (platform?: SharePlatform) => store.generateMessage(platform),
    generateImage: (portfolioId?: number | null) => store.generateImage(portfolioId),
    loadSocialData: (portfolioId?: number | null) => store.loadSocialData(portfolioId),
    logShare: (payload: LogShareActivityPayload) => store.logShare(payload),
    loadLogs: (portfolioId?: number | null, limit?: number) => store.loadLogs(portfolioId, limit),
    prepareSocialShare: (platform: 'twitter' | 'facebook' | 'linkedin') =>
      store.prepareSocialShare(platform),
    logGeneratedImageShare: (platform: SharePlatform) => store.logGeneratedImageShare(platform),
    logGeneratedMessageShare: (platform: SharePlatform) => store.logGeneratedMessageShare(platform),
    clearGeneratedContent: () => store.clearGeneratedContent(),
    clearError: () => store.clearError(),
    clear: () => store.clear(),
  };
}

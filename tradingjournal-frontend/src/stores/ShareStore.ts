import { defineStore } from 'pinia';
import {
  DEFAULT_SHARE_LOG_LIMIT,
  MAX_SHARE_LOG_LIMIT,
  SHARE_MESSAGES,
} from '../constants/share.constants';
import { getShareErrorMessage, isPaidAccessError, shareService } from '../services/share.service';
import { usePortfolioStore } from './PortfolioStore';
import type {
  GenerateShareMessageResponse,
  LogShareActivityPayload,
  ShareImageData,
  ShareLog,
  SharePlatform,
  ShareStatistics,
  SocialSharingData,
} from '../types/share.types';

export const useShareStore = defineStore('share', {
  state: () => ({
    statistics: null as ShareStatistics | null,

    generatedMessages: {} as Partial<Record<SharePlatform, GenerateShareMessageResponse>>,

    generatedImage: null as ShareImageData | null,

    socialData: null as SocialSharingData | null,

    logs: [] as ShareLog[],

    selectedPlatform: 'twitter' as SharePlatform,

    loadedPortfolioId: null as number | null,

    isLoadingStatistics: false,
    isGeneratingMessage: false,
    isGeneratingImage: false,
    isLoadingSocialData: false,
    isLoadingLogs: false,
    isLoggingShare: false,

    paidAccessDenied: false,

    error: null as string | null,
  }),

  getters: {
    activePortfolioId(): number | null {
      return usePortfolioStore().activePortfolio?.id ?? null;
    },

    activePortfolioType(): 'TRADER' | 'INVESTOR' | null {
      return usePortfolioStore().activePortfolio?.portfolio_type ?? null;
    },

    currentMessage(state): string | null {
      return state.generatedMessages[state.selectedPlatform]?.message ?? null;
    },

    currentShareUrl(state): string | null {
      if (!state.socialData) {
        return null;
      }

      const platform = state.selectedPlatform;

      if (platform === 'twitter' || platform === 'facebook' || platform === 'linkedin') {
        return state.socialData.share_urls[platform] ?? null;
      }

      if (platform === 'copy_link') {
        return state.socialData.public_url;
      }

      return null;
    },

    isLoading(state) {
      return (
        state.isLoadingStatistics ||
        state.isGeneratingMessage ||
        state.isGeneratingImage ||
        state.isLoadingSocialData ||
        state.isLoadingLogs ||
        state.isLoggingShare
      );
    },
  },

  actions: {
    clearError() {
      this.error = null;
      this.paidAccessDenied = false;
    },

    setSelectedPlatform(platform: SharePlatform) {
      this.selectedPlatform = platform;
    },

    async initialize(portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.loadedPortfolioId = id;

      const [statistics, socialData, logs] = await Promise.all([
        this.loadStatistics(id),
        this.loadSocialData(id),
        this.loadLogs(id),
      ]);

      return {
        statistics,
        socialData,
        logs,
      };
    },

    async loadStatistics(portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isLoadingStatistics = true;
      this.error = null;
      this.paidAccessDenied = false;

      try {
        const stats = await shareService.getStatistics(id);

        this.statistics = stats;
        this.loadedPortfolioId = id;

        return stats;
      } catch (error) {
        this.handleError(error, SHARE_MESSAGES.statisticsFailed);
        throw error;
      } finally {
        this.isLoadingStatistics = false;
      }
    },

    async generateMessage(platform?: SharePlatform, portfolioId?: number | null) {
      platform ??= this.selectedPlatform;
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isGeneratingMessage = true;
      this.error = null;
      this.paidAccessDenied = false;

      try {
        const result = await shareService.generateMessage(id, platform);

        this.generatedMessages[platform] = result;

        this.statistics = result.stats;
        this.selectedPlatform = platform;
        this.loadedPortfolioId = id;

        return result;
      } catch (error) {
        this.handleError(error, SHARE_MESSAGES.messageFailed);
        throw error;
      } finally {
        this.isGeneratingMessage = false;
      }
    },

    async generateImage(portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isGeneratingImage = true;
      this.error = null;
      this.paidAccessDenied = false;

      try {
        const result = await shareService.generateImage(id);

        this.generatedImage = result;
        this.loadedPortfolioId = id;

        return result;
      } catch (error) {
        this.handleError(error, SHARE_MESSAGES.imageFailed);
        throw error;
      } finally {
        this.isGeneratingImage = false;
      }
    },

    async loadSocialData(portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isLoadingSocialData = true;
      this.error = null;
      this.paidAccessDenied = false;

      try {
        const result = await shareService.getSocialData(id);

        this.socialData = result;
        this.statistics = result.statistics;
        this.loadedPortfolioId = id;

        return result;
      } catch (error) {
        this.handleError(error, SHARE_MESSAGES.socialDataFailed);
        throw error;
      } finally {
        this.isLoadingSocialData = false;
      }
    },

    async logShare(payload: LogShareActivityPayload, portfolioId?: number | null) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isLoggingShare = true;
      this.error = null;
      this.paidAccessDenied = false;

      try {
        const result = await shareService.logShare(id, payload);

        this.logs.unshift(result.log);

        return result;
      } catch (error) {
        this.handleError(error, SHARE_MESSAGES.logFailed);
        throw error;
      } finally {
        this.isLoggingShare = false;
      }
    },

    async loadLogs(portfolioId?: number | null, limit = DEFAULT_SHARE_LOG_LIMIT) {
      portfolioId ??= this.activePortfolioId;
      const id = this.requirePortfolioId(portfolioId);

      this.isLoadingLogs = true;
      this.error = null;
      this.paidAccessDenied = false;

      const safeLimit = Number.isInteger(limit)
        ? Math.min(MAX_SHARE_LOG_LIMIT, Math.max(1, limit))
        : DEFAULT_SHARE_LOG_LIMIT;

      try {
        const logs = await shareService.getLogs(id, safeLimit);

        this.logs = logs;
        this.loadedPortfolioId = id;

        return logs;
      } catch (error) {
        this.handleError(error, SHARE_MESSAGES.logsFailed);
        throw error;
      } finally {
        this.isLoadingLogs = false;
      }
    },

    async prepareSocialShare(platform: 'twitter' | 'facebook' | 'linkedin') {
      this.setSelectedPlatform(platform);

      if (!this.socialData) {
        await this.loadSocialData();
      }

      const message = this.socialData?.share_messages[platform];

      const url = this.socialData?.share_urls[platform];

      if (!message || !url) {
        return null;
      }

      return {
        platform,
        message,
        url,
      };
    },

    async logGeneratedImageShare(platform: SharePlatform) {
      if (!this.generatedImage) {
        await this.generateImage();
      }

      const imageUrl = this.generatedImage?.image_url;

      if (!imageUrl) {
        return null;
      }

      return this.logShare({
        platform,
        content_type: 'IMAGE',
        image_url: imageUrl,
        ...(this.socialData?.public_url ? { public_url: this.socialData.public_url } : {}),
      });
    },

    async logGeneratedMessageShare(platform: SharePlatform) {
      let message = this.generatedMessages[platform]?.message;

      if (!message) {
        const generated = await this.generateMessage(platform);

        message = generated.message;
      }

      return this.logShare({
        platform,
        content_type: 'MESSAGE',
        message,
        ...(this.socialData?.public_url ? { public_url: this.socialData.public_url } : {}),
      });
    },

    handleError(error: unknown, fallback: string) {
      this.error = getShareErrorMessage(error, fallback);

      this.paidAccessDenied = isPaidAccessError(error);
    },

    requirePortfolioId(portfolioId: number | null): number {
      if (portfolioId === null) {
        throw new Error(SHARE_MESSAGES.portfolioRequired);
      }

      return portfolioId;
    },

    clearGeneratedContent() {
      this.generatedMessages = {};
      this.generatedImage = null;
    },

    clear() {
      this.statistics = null;
      this.generatedMessages = {};
      this.generatedImage = null;
      this.socialData = null;
      this.logs = [];
      this.selectedPlatform = 'twitter';
      this.loadedPortfolioId = null;

      this.isLoadingStatistics = false;
      this.isGeneratingMessage = false;
      this.isGeneratingImage = false;
      this.isLoadingSocialData = false;
      this.isLoadingLogs = false;
      this.isLoggingShare = false;

      this.paidAccessDenied = false;
      this.error = null;
    },
  },
});

import { defineStore } from 'pinia';
import { aiService, getAiErrorMessage, isAiCreditError } from 'src/services/ai.service';
import { useAuthStore } from 'src/stores/AuthStore';
import { useLanguageStore } from 'src/stores/LanguageStore';
import type {
  AiFeatureId,
  AiFeaturePricing,
  AiOutputLanguage,
  AiPortfolioType,
  AnalyzeChartPayload,
  ChartInsight,
  GenerateQuizPayload,
  InvestorReviewResult,
  PortfolioReviewResponse,
  PortfolioRiskAnalysis,
  PortfolioRiskHolding,
  QuizResponse,
  ReviewPortfolioPayload,
  StockRecommendation,
  TraderReviewResult,
} from 'src/types/ai.types';

export const useAiStore = defineStore('ai', {
  state: () => ({
    /** feature -> flat price, filled from GET /ai/pricing */
    pricing: {} as Partial<Record<AiFeatureId, AiFeaturePricing>>,
    /** highest single-feature price; a balance at or above it can run any feature */
    minBalance: 20,
    insights: {} as Record<string, ChartInsight>,
    portfolioReview: null as PortfolioReviewResponse | null,
    growthRecommendations: [] as StockRecommendation[],
    riskAnalysis: null as PortfolioRiskAnalysis | null,
    normalizedRiskHoldings: [] as PortfolioRiskHolding[],
    quiz: null as QuizResponse | null,

    loadingPricing: false,
    loadingInsight: {} as Record<string, boolean>,
    loadingReview: false,
    loadingRecommendations: false,
    loadingRisk: false,
    loadingQuiz: false,
    loadingCredits: false,

    loadedPricing: false,
    insufficientCredits: false,
    error: null as string | null,
  }),

  getters: {
    credits(): number {
      const auth = useAuthStore();
      const user = auth.user as
        | {
            ai_token_balance?: number;
            ai_credits?: number;
          }
        | null
        | undefined;

      return Number(user?.ai_token_balance ?? user?.ai_credits ?? 0);
    },

    /** Can the user run the most expensive feature? (used by the credits badge) */
    canAfford(): boolean {
      return this.credits >= this.minBalance;
    },

    /** Flat credits of one feature, or null until GET /ai/pricing has answered. */
    costOf: (state) => (feature: AiFeatureId): number | null =>
      state.pricing[feature]?.credits ?? null,

    /** Can the user pay for this feature? Before pricing loads, falls back to the balance floor. */
    canAffordFeature(): (feature: AiFeatureId) => boolean {
      return (feature) => this.credits >= (this.pricing[feature]?.credits ?? this.minBalance);
    },

    traderReview(): TraderReviewResult | null {
      return this.portfolioReview?.portfolioType === 'TRADER' ? this.portfolioReview.data : null;
    },

    investorReview(): InvestorReviewResult | null {
      return this.portfolioReview?.portfolioType === 'INVESTOR' ? this.portfolioReview.data : null;
    },

    isLoading(state): boolean {
      return (
        state.loadingPricing ||
        state.loadingReview ||
        state.loadingRecommendations ||
        state.loadingRisk ||
        state.loadingQuiz ||
        state.loadingCredits ||
        Object.values(state.loadingInsight).some(Boolean)
      );
    },
  },

  actions: {
    /**
     * ภาษาที่จะขอให้ AI ตอบ — อ่านตอนเรียกทุกครั้ง ไม่ได้ cache ไว้
     * ผู้ใช้สลับภาษากลางคันแล้วกดวิเคราะห์ใหม่ ต้องได้ภาษาใหม่ทันที
     */
    outputLanguage(): AiOutputLanguage {
      return useLanguageStore().currentLanguage;
    },

    clearError() {
      this.error = null;
      this.insufficientCredits = false;
    },

    /** Loads the flat feature prices once (cached); the backend config is the only source. */
    async fetchPricing(force = false) {
      if ((!force && this.loadedPricing) || this.loadingPricing) {
        return this.pricing;
      }

      this.loadingPricing = true;

      try {
        const response = await aiService.getPricing();
        this.pricing = Object.fromEntries(
          response.features.map((entry) => [entry.feature, entry]),
        );
        this.minBalance = response.minBalance;
        this.loadedPricing = true;
        return this.pricing;
      } catch (error) {
        // prices only decorate the buttons; a failure must not block the page
        this.handleError(error);
        throw error;
      } finally {
        this.loadingPricing = false;
      }
    },

    async analyzeChart(payload: {
      key: string;
      portfolioId?: number;
      portfolioType: AiPortfolioType;
      chartType: string;
      data: unknown;
      extraContext?: Record<string, unknown>;
      useRuleBased?: boolean;
    }) {
      if (this.loadingInsight[payload.key]) {
        return this.insights[payload.key] ?? null;
      }

      this.loadingInsight = {
        ...this.loadingInsight,
        [payload.key]: true,
      };

      this.error = null;
      this.insufficientCredits = false;

      try {
        const request: AnalyzeChartPayload = {
          portfolioType: payload.portfolioType,
          chartType: payload.chartType,
          data: payload.data,
          outputLanguage: this.outputLanguage(),
          ...(payload.portfolioId !== undefined ? { portfolioId: payload.portfolioId } : {}),
          ...(payload.extraContext !== undefined ? { extraContext: payload.extraContext } : {}),
          ...(payload.useRuleBased !== undefined ? { useRuleBased: payload.useRuleBased } : {}),
        };

        const result = await aiService.analyzeChart(request);

        this.insights = {
          ...this.insights,
          [payload.key]: result,
        };

        this.syncCredits(result.creditsRemaining);
        return result;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingInsight = {
          ...this.loadingInsight,
          [payload.key]: false,
        };
      }
    },

    async reviewPortfolio(
      portfolioId: number,
      items?: unknown[],
      analytics?: Record<string, unknown>,
    ) {
      this.loadingReview = true;
      this.error = null;
      this.insufficientCredits = false;

      try {
        const payload: ReviewPortfolioPayload = {
          outputLanguage: this.outputLanguage(),
          ...(items !== undefined ? { items } : {}),
          ...(analytics !== undefined ? { analytics } : {}),
        };

        const result = await aiService.reviewPortfolio(portfolioId, payload);
        this.portfolioReview = result;
        this.syncCredits(result.creditsRemaining);
        return result;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingReview = false;
      }
    },

    async loadGrowthRecommendations() {
      this.loadingRecommendations = true;
      this.error = null;
      this.insufficientCredits = false;

      try {
        const result = await aiService.getGrowthRecommendations(this.outputLanguage());
        this.growthRecommendations = result.data;
        this.syncCredits(result.creditsRemaining);
        return result;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingRecommendations = false;
      }
    },

    async analyzeRisk(holdings: PortfolioRiskHolding[]) {
      this.loadingRisk = true;
      this.error = null;
      this.insufficientCredits = false;

      try {
        const result = await aiService.analyzeRisk({
          holdings,
          outputLanguage: this.outputLanguage(),
        });
        this.riskAnalysis = result.data;
        this.normalizedRiskHoldings = result.holdingsData;
        this.syncCredits(result.creditsRemaining);
        return result;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingRisk = false;
      }
    },

    async generateQuiz(lessonTitle: string, lessonDescription: string) {
      this.loadingQuiz = true;
      this.error = null;
      this.insufficientCredits = false;

      try {
        const payload: GenerateQuizPayload = {
          lessonTitle,
          lessonDescription,
          outputLanguage: this.outputLanguage(),
        };

        const result = await aiService.generateQuiz(payload);
        this.quiz = result.data;
        this.syncCredits(result.creditsRemaining);
        return result;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingQuiz = false;
      }
    },

    async refreshCredits() {
      this.loadingCredits = true;
      this.error = null;

      try {
        const response = await aiService.getCredits();
        this.minBalance = response.minBalance;
        this.syncCredits(response.balance);
        return response.balance;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingCredits = false;
      }
    },

    syncCredits(balance?: number) {
      if (typeof balance !== 'number') {
        return;
      }

      const auth = useAuthStore() as {
        setAiCredits?: (balance: number) => void;
        user?: Record<string, unknown> | null;
      };

      if (typeof auth.setAiCredits === 'function') {
        auth.setAiCredits(balance);
        return;
      }

      if (auth.user) {
        auth.user.ai_token_balance = balance;
      }
    },

    handleError(error: unknown) {
      this.error = getAiErrorMessage(error);
      this.insufficientCredits = isAiCreditError(error);
    },

    clearInsight(key: string) {
      this.insights = Object.fromEntries(
        Object.entries(this.insights).filter(([entryKey]) => entryKey !== key),
      );
    },

    clear() {
      this.insights = {};
      this.portfolioReview = null;
      this.growthRecommendations = [];
      this.riskAnalysis = null;
      this.normalizedRiskHoldings = [];
      this.quiz = null;
      this.error = null;
      this.insufficientCredits = false;
    },
  },
});

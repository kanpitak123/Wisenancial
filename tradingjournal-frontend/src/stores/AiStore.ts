import { defineStore } from 'pinia';
import { aiService, getAiErrorMessage, isAiCreditError } from 'src/services/ai.service';
import { useAuthStore } from 'src/stores/AuthStore';
import type {
  AiModel,
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
    models: [] as AiModel[],
    minBalance: 10,
    selectedModelId: null as string | null,
    insights: {} as Record<string, ChartInsight>,
    portfolioReview: null as PortfolioReviewResponse | null,
    growthRecommendations: [] as StockRecommendation[],
    riskAnalysis: null as PortfolioRiskAnalysis | null,
    normalizedRiskHoldings: [] as PortfolioRiskHolding[],
    quiz: null as QuizResponse | null,

    loadingModels: false,
    loadingInsight: {} as Record<string, boolean>,
    loadingReview: false,
    loadingRecommendations: false,
    loadingRisk: false,
    loadingQuiz: false,
    loadingCredits: false,

    loadedModels: false,
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

    canAfford(): boolean {
      return this.credits >= this.minBalance;
    },

    selectedModel(state): AiModel | null {
      return state.models.find((model) => model.id === state.selectedModelId) ?? null;
    },

    traderReview(): TraderReviewResult | null {
      return this.portfolioReview?.portfolioType === 'TRADER' ? this.portfolioReview.data : null;
    },

    investorReview(): InvestorReviewResult | null {
      return this.portfolioReview?.portfolioType === 'INVESTOR' ? this.portfolioReview.data : null;
    },

    isLoading(state): boolean {
      return (
        state.loadingModels ||
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
    clearError() {
      this.error = null;
      this.insufficientCredits = false;
    },

    async fetchModels(force = false) {
      if ((!force && this.loadedModels) || this.loadingModels) {
        return this.models;
      }

      this.loadingModels = true;
      this.error = null;

      try {
        const response = await aiService.getModels();
        this.models = response.models;
        this.minBalance = response.minBalance;

        const selectedStillExists = this.models.some((model) => model.id === this.selectedModelId);

        if (!selectedStillExists) {
          this.selectedModelId = this.models[0]?.id ?? null;
        }

        this.loadedModels = true;
        return this.models;
      } catch (error) {
        this.handleError(error);
        throw error;
      } finally {
        this.loadingModels = false;
      }
    },

    setSelectedModel(modelId: string | null) {
      if (modelId === null) {
        this.selectedModelId = null;
        return;
      }

      const exists = this.models.some((model) => model.id === modelId);
      if (!exists) {
        throw new Error('AI model นี้ไม่พร้อมใช้งาน');
      }

      this.selectedModelId = modelId;
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
          ...(payload.portfolioId !== undefined ? { portfolioId: payload.portfolioId } : {}),
          ...(payload.extraContext !== undefined ? { extraContext: payload.extraContext } : {}),
          ...(payload.useRuleBased !== undefined ? { useRuleBased: payload.useRuleBased } : {}),
          ...(!payload.useRuleBased && this.selectedModelId
            ? { modelId: this.selectedModelId }
            : {}),
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
      const modelId = this.requireSelectedModel();
      this.loadingReview = true;
      this.error = null;
      this.insufficientCredits = false;

      try {
        const payload: ReviewPortfolioPayload = {
          modelId,
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
        const result = await aiService.getGrowthRecommendations();
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
      const modelId = this.requireSelectedModel();
      this.loadingRisk = true;
      this.error = null;
      this.insufficientCredits = false;

      try {
        const result = await aiService.analyzeRisk({ holdings, modelId });
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

    requireSelectedModel(): string {
      if (!this.selectedModelId) {
        throw new Error('ยังไม่ได้เลือก AI model');
      }

      return this.selectedModelId;
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

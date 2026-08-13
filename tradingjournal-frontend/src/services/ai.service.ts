import type { AxiosError } from 'axios';
import { api } from 'boot/axios';
import type {
  AiActionResponse,
  AiCreditsResponse,
  AiModelsResponse,
  AnalyzeChartPayload,
  ApiErrorResponse,
  ChartInsight,
  GenerateQuizPayload,
  PortfolioReviewResponse,
  PortfolioRiskHolding,
  QuizResponse,
  ReviewPortfolioPayload,
  RiskAnalysisResponse,
  StockRecommendation,
} from 'src/types/ai.types';

export function getAiErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาดจากระบบ AI'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.response?.data?.error ?? axiosError.message ?? fallback;
}

export function isAiCreditError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return axiosError.response?.status === 402 || axiosError.response?.status === 403;
}

export const aiService = {
  async getModels(): Promise<AiModelsResponse> {
    const { data } = await api.get<AiModelsResponse>('/ai/models');
    return data;
  },

  async getCredits(): Promise<AiCreditsResponse> {
    const { data } = await api.get<AiCreditsResponse>('/ai/credits');
    return data;
  },

  async analyzeChart(payload: AnalyzeChartPayload): Promise<ChartInsight> {
    const { data } = await api.post<ChartInsight>('/ai/analyze', payload);
    return data;
  },

  async reviewPortfolio(
    portfolioId: number,
    payload: ReviewPortfolioPayload,
  ): Promise<PortfolioReviewResponse> {
    const { data } = await api.post<PortfolioReviewResponse>(
      `/ai/portfolio/${portfolioId}/review`,
      payload,
    );
    return data;
  },

  async getGrowthRecommendations(): Promise<AiActionResponse<StockRecommendation[]>> {
    const { data } = await api.get<AiActionResponse<StockRecommendation[]>>(
      '/ai/recommendations/growth',
    );
    return data;
  },

  async analyzeRisk(payload: {
    holdings: PortfolioRiskHolding[];
    modelId: string;
  }): Promise<RiskAnalysisResponse> {
    const { data } = await api.post<RiskAnalysisResponse>('/ai/portfolio/risk-analysis', payload);
    return data;
  },

  async generateQuiz(payload: GenerateQuizPayload): Promise<AiActionResponse<QuizResponse>> {
    const { data } = await api.post<AiActionResponse<QuizResponse>>('/ai/education/quiz', payload);
    return data;
  },
};

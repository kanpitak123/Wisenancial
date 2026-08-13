export type AiPortfolioType = 'TRADER' | 'INVESTOR';

export type AiModelId = string;

export interface AiModel {
  id: AiModelId;
  label: string;
  creditsPer1kInput: number;
  creditsPer1kOutput: number;
}

export interface AiModelsResponse {
  models: AiModel[];
  minBalance: number;
}

export interface AiCreditsResponse {
  balance: number;
  minBalance: number;
}

export interface AnalyzeChartPayload {
  portfolioId?: number;
  portfolioType: AiPortfolioType;
  chartType: string;
  data: unknown;
  extraContext?: Record<string, unknown>;
  modelId?: string;
  useRuleBased?: boolean;
}

export interface ChartInsight {
  insight: string;
  source: 'RULE_BASED' | 'LLM';
  model?: string;
  creditsCharged?: number;
  creditsRemaining?: number;
}

export interface TraderReviewResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskWarnings: string[];
  actionableRecommendations: string[];
  disciplineScore: number;
}

export interface InvestorReviewResult {
  summary: string;
  diversificationScore: number;
  riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  concentrationRisks: string[];
  strengths: string[];
  actionableRecommendations: string[];
}

interface BasePortfolioReviewResponse {
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
}

export interface TraderPortfolioReviewResponse extends BasePortfolioReviewResponse {
  portfolioType: 'TRADER';
  data: TraderReviewResult;
}

export interface InvestorPortfolioReviewResponse extends BasePortfolioReviewResponse {
  portfolioType: 'INVESTOR';
  data: InvestorReviewResult;
}

export type PortfolioReviewResponse =
  | TraderPortfolioReviewResponse
  | InvestorPortfolioReviewResponse;

export interface ReviewPortfolioPayload {
  modelId: string;
  items?: unknown[];
  analytics?: Record<string, unknown>;
}

export interface StockRecommendation {
  symbol: string;
  name: string;
  sector: string;
  reasoning: {
    growth: string;
    profit: string;
    customerBase: string;
    liquidity: string;
  };
  aiSummary: string;
}

export interface AiActionResponse<T> {
  data: T;
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
}

export interface PortfolioRiskHolding {
  symbol: string;
  quantity: number;
  weight?: number;
  beta?: number | null;
  debtToEquity?: number | null;
  peRatio?: number | null;
  currentPrice?: number;
}

export interface PortfolioRiskAnalysis {
  riskLevel: 'Low' | 'Moderate' | 'Aggressive';
  riskScore: number;
  analysisSummary: string;
  keyRiskFactors: string[];
}

export interface RiskAnalysisResponse extends AiActionResponse<PortfolioRiskAnalysis> {
  holdingsData: PortfolioRiskHolding[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface QuizResponse {
  questions: QuizQuestion[];
}

export interface GenerateQuizPayload {
  lessonTitle: string;
  lessonDescription: string;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

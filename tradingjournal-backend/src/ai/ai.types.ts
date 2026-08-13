import type { AiModelId } from './ai.models';
import type { NewsEnrichmentResult } from './ai-news.types';

export type AiPortfolioType = 'TRADER' | 'INVESTOR';
export type AiDomain = AiPortfolioType | 'NEWS' | 'EDUCATION';

export interface AnalyzeChartDto {
  portfolioId?: number;
  portfolioType: AiPortfolioType;
  chartType: string;
  data: unknown;
  extraContext?: Record<string, unknown>;
  modelId?: string;
  useRuleBased?: boolean;
}

export interface ChartInsightResponse {
  insight: string;
  source: 'RULE_BASED' | 'LLM';
  model?: AiModelId;
  creditsCharged?: number;
  creditsRemaining?: number;
}

export interface TradeReviewInput {
  portfolioId: number;
  modelId: string;
  trades?: unknown[];
  analytics?: Record<string, unknown>;
}

export interface TraderReviewResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskWarnings: string[];
  actionableRecommendations: string[];
  disciplineScore: number;
}

export interface InvestorReviewInput {
  portfolioId: number;
  modelId: string;
  holdings?: unknown[];
  analytics?: Record<string, unknown>;
}

export interface InvestorReviewResult {
  summary: string;
  diversificationScore: number;
  riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  concentrationRisks: string[];
  strengths: string[];
  actionableRecommendations: string[];
}

export interface UnifiedPortfolioReviewResponse<T> {
  portfolioType: AiPortfolioType;
  data: T;
  model: AiModelId;
  creditsCharged: number;
  creditsRemaining: number;
}

export type { NewsEnrichmentResult };

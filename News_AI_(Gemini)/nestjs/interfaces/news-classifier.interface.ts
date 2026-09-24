export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type Importance = 'HIGH' | 'MEDIUM' | 'LOW';

export type NewsCategory =
  | 'MACROECONOMIC'
  | 'CENTRAL_BANK'
  | 'CORPORATE_EARNINGS'
  | 'GEOPOLITICAL_COMMODITIES'
  | 'REGULATORY_LEGAL'
  | 'GENERAL_FINANCIAL';

export type MarketStance = 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
export type AssetClass = 'EQUITIES' | 'FIXED_INCOME' | 'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'GENERAL';
export type Timeframe = 'SHORT_TERM' | 'MEDIUM_TERM';

export interface ImpactDetail {
  target: string;
  asset_class: AssetClass;
  mechanism: string;
  timeframe: Timeframe;
}

export interface DualImpactAnalysis {
  positive_impacts: ImpactDetail[];
  negative_impacts: ImpactDetail[];
}

export interface ReasoningSteps {
  key_facts: string[];
  transmission_mechanism: string;
  counter_perspective: string;
}

export interface V5AnalyzeNewsResult {
  article_id: string;
  news_category: NewsCategory;
  importance: Importance;
  market_stance: MarketStance;
  confidence: number;
  review_required: boolean;
  reasoning_steps: ReasoningSteps;
  dual_impact_analysis: DualImpactAnalysis;
  uncertainties: string[];
  neutrality_score: number;
  compliance_disclaimer: string;
  compliance_flags: string[];
  model: string;
  prompt_version: string;
  cached?: boolean;
}

export interface BatchV5AnalyzeNewsResult {
  results: V5AnalyzeNewsResult[];
  total: number;
  review_count: number;
  duration_ms: number;
}

// V.4 compatibility interfaces
export interface FewShotExample {
  article_id?: string;
  title: string;
  description: string;
  label: {
    sentiment?: Sentiment;
    importance?: Importance;
    [key: string]: any;
  };
  selection?: string;
}

export interface ClassifyNewsPayload {
  article_id?: string;
  title: string;
  description?: string;
}

export interface ClassifyNewsResult {
  article_id: string;
  sentiment: Sentiment;
  importance: Importance;
  confidence: number;
  review_required: boolean;
  model: string;
  prompt_version: string;
  cached?: boolean;
  dual_impact?: DualImpactAnalysis;
  reasoning?: ReasoningSteps;
}

export interface BatchClassifyNewsResult {
  results: ClassifyNewsResult[];
  total: number;
  review_count: number;
  duration_ms: number;
}

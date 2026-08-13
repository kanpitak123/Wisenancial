export type AiTrend = 'UP' | 'DOWN' | 'SIDEWAY';

export type NewsImportance = 'HIGH' | 'MEDIUM' | 'LOW';

export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface NewsEnrichmentInput {
  headline: string;
  summary: string;
  content?: string;
  language?: 'en' | 'th';
}

export interface NewsEnrichmentResult {
  aiSummary: string;
  aiTrend: AiTrend;
  aiImpactProbability: number;
  stockImpactAnalysis: string;
  sector: string;
  importance: NewsImportance;
  sentiment: NewsSentiment;
  aiTranslatedSummary?: { en: string; th: string };
  fromFallback: boolean;
}

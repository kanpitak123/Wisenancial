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

/**
 * NewsEnrichmentResult plus which path actually served the item (Chunk A — first-pass
 * classifier) and, when the classifier served it, its self-reported confidence.
 * `confidence` is null for anything that went through the pre-existing enrichment
 * chain, which has no concept of a confidence score.
 */
export interface NewsEnrichmentOutcome extends NewsEnrichmentResult {
  confidence: number | null;
  servedBy: 'classifier' | 'legacy-chain' | 'fallback-chain';
}

export type NewsScope = 'ALL' | 'TRADER' | 'INVESTOR';

export type NewsItemScope = Exclude<NewsScope, 'ALL'>;

export type NewsLanguage = 'en' | 'th';

export type NewsKind = 'ECONOMIC_EVENT' | 'MARKET_ARTICLE';

export type NewsImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type NewsSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type NewsAiTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type NewsTranslatedSummary = string | Record<string, unknown> | unknown[] | null;

export interface UnifiedNewsItem {
  id: string;
  sourceId: number;
  scope: NewsItemScope;
  kind: NewsKind;
  title: string;
  summary: string;
  source: string | null;
  url: string | null;
  importance: NewsImportance;
  sentiment: NewsSentiment;
  aiSummary: string | null;
  impactAnalysis: string | null;
  aiTrend: NewsAiTrend | null;
  aiImpactProbability: number | null;
  translatedSummary: NewsTranslatedSummary;
  relatedSymbols: string[];
  country: string | null;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  sector: string | null;
  publishedAt: string;
  isPinned: boolean;
}

export interface NewsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface NewsFeedResponse {
  success: true;
  scope: NewsScope;
  data: UnifiedNewsItem[];
  pagination: NewsPagination;
}

export interface NewsQuery {
  scope?: NewsScope;
  page?: number;
  limit?: number;
  country?: string;
  impact?: string;
  sector?: string;
  sentiment?: string;
  symbol?: string;
  language?: NewsLanguage;
}

export interface NewsFilters {
  country: string;
  impact: string;
  sector: string;
  sentiment: string;
  symbol: string;
  search: string;
  importance: string;
}

export interface FetchNewsOptions extends NewsQuery {
  append?: boolean;
}

export interface TogglePinResponse {
  pinned: boolean;
}

export interface NewsSocketPayload {
  scope: NewsItemScope;
  data: unknown;
}

export type NewsSocketEvent = 'new_news' | 'news_data_changed' | 'news_ai_enriched';

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

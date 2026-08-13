export type HistoricalInterval = '1d' | '1wk' | '1mo';

export type MarketTrend = 'bullish' | 'bearish' | 'neutral';

export interface HistoricalPricePoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface TechnicalAnalysisSummary {
  th: string;
  en: string;
}

export interface TechnicalAnalysis {
  symbol: string;
  rsi: number;
  resistance1: number;
  resistance2: number;
  support1: number;
  support2: number;
  aiSummary: TechnicalAnalysisSummary;
  trend: MarketTrend;
  confidence: number;
  currentPrice: number;
  lastUpdated: string;
}

export interface EarningsCalendarItem {
  symbol: string;
  companyName: string | null;
  earningsDate: string;
  epsEstimate: number | null;
  epsActual: number | null;
}

export interface EarningsCalendar {
  from: string;
  to: string;
  items: EarningsCalendarItem[];
}

export interface MarketCacheStats {
  size: number;
  symbols: string[];
  ttlMs: number;
}

export interface MarketPriceRow {
  id?: number;
  symbol: string;
  currency: string;
  price: string | number;
  price_date: string;
  source: string;
}

export interface MarketPriceQuery {
  symbols?: string[];
  currency?: string;
}

export type SyncSymbolResponse = MarketPriceRow;

export interface SyncPortfolioFailure {
  symbol: string;
  reason: string;
}

export interface SyncPortfolioResponse {
  requested: number;
  updated: number;
  failed: number;
  prices: MarketPriceRow[];
  failures: SyncPortfolioFailure[];
}

export interface MarketHistoryQuery {
  symbol: string;
  from: string;
  to: string;
  interval?: HistoricalInterval;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

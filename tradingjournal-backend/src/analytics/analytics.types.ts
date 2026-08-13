export type AnalyticsPortfolioType = 'TRADER' | 'INVESTOR';
export type AnalyticsTimeframe =
  | '1W'
  | '1M'
  | '3M'
  | '6M'
  | '9M'
  | '1Y'
  | 'ALL';

export interface AnalyticsContext {
  portfolioId: number;
  userId: number;
  portfolioType: AnalyticsPortfolioType;
}

export interface AnalyticsSummary {
  portfolio_id: number;
  portfolio_type: AnalyticsPortfolioType;
  current_value: number;
  total_pnl: number;
  total_pnl_percent: number;
  realized_pnl: number;
  unrealized_pnl: number;
}

export interface PerformancePoint {
  date: string | Date;
  value: number;
  event?: string;
  amount?: number;
}

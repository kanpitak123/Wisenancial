import type { PortfolioType } from './portfolio.types';

export type SharePlatform = 'twitter' | 'facebook' | 'linkedin' | 'download' | 'copy_link';

export type ShareContentType = 'MESSAGE' | 'IMAGE' | 'LINK';

export interface SharePortfolioInfo {
  id: number;
  name: string;
  currency: string;
  created_at: string | null;
  current_balance: number;
  initial_balance: number;
}

export interface SharePerformanceSummary {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_return: number;
  total_pnl: number;
  active_days: number;
  open_holdings: number;

  realized_pnl?: number;
  unrealized_pnl?: number;
  dividend_income?: number;
}

export interface ShareProfitabilityMetrics {
  max_profit?: number;
  max_loss?: number;
  average_profit?: number;
  average_loss?: number;
  profit_factor?: number | null;

  best_sale?: number;
  worst_sale?: number;
  average_realized_pnl?: number;
}

export interface ShareRiskMetrics {
  sharpe_ratio: number;
  max_drawdown: number;
  volatility: number;
}

export interface ShareMonthlyPerformance {
  month: string;
  pnl: number;
}

export interface ShareHolding {
  symbol: string;
  shares: number;
  total_cost: number;
  market_value: number;
  unrealized_pnl: number;
  average_cost: number;
}

export interface ShareStatistics {
  portfolio_type: PortfolioType;
  portfolio_info: SharePortfolioInfo;
  performance_summary: SharePerformanceSummary;
  profitability_metrics: ShareProfitabilityMetrics;
  risk_metrics: ShareRiskMetrics;
  monthly_performance: ShareMonthlyPerformance[];
  current_holdings: ShareHolding[];
}

export interface GenerateShareMessageResponse {
  message: string;
  stats: ShareStatistics;
  platform: SharePlatform;
}

export interface ShareImageMetric {
  label: string;
  value: string | number;
}

export interface ShareImageData {
  image_url: string;
  relative_url: string;
  mime_type: string;
  file_name: string;
  template: 'TRADER_PERFORMANCE' | 'INVESTOR_PERFORMANCE';
  generated_at: string;
  stats_for_image: {
    title: string;
    portfolio_type: PortfolioType;
    currency: string;
    return: string;
    pnl: number;
    primary_metric: ShareImageMetric;
  };
}

export interface LogShareActivityPayload {
  platform: SharePlatform;
  message?: string;
  content_type?: ShareContentType;
  image_url?: string;
  public_url?: string;
}

export interface ShareLog {
  id: number;
  user_id: number;
  portfolio_id: number;
  portfolio_type: PortfolioType;
  platform: SharePlatform;
  content_type: ShareContentType;
  message: string | null;
  image_url: string | null;
  public_url: string | null;
  stats_snapshot: Record<string, unknown>;
  created_at: string;
}

export interface LogShareActivityResponse {
  success: boolean;
  persisted: boolean;
  log: ShareLog;
}

export interface SocialSharingData {
  statistics: ShareStatistics;
  share_messages: {
    twitter: string;
    facebook: string;
    linkedin: string;
  };
  share_urls: {
    twitter: string;
    facebook: string;
    linkedin: string;
  };
  public_url: string;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

import type { PortfolioType } from './portfolio.types';

export type WatchlistScope = 'ALL' | PortfolioType;

export interface WatchlistItem {
  id: number;
  user_id: number;
  symbol: string;
  name: string | null;
  asset_type: string;
  market_region: string;
  portfolio_type: PortfolioType;
  current_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface AddWatchlistPayload {
  symbol: string;
}

export interface UserWatchlistQuery {
  scope?: WatchlistScope;
  currency?: string;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

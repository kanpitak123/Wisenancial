import type { PortfolioType } from './portfolio.types';

export type ChartInterval = '1d' | '1wk' | '1mo';

export interface Asset {
  id: number;
  symbol: string;
  name: string | null;
  asset_type: string;
  portfolio_type: PortfolioType;
  market_region: string;
  sector: string | null;
  exchange: string | null;
  currency: string | null;
  is_active: boolean;
}

export interface ChartDataPoint {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  value: number;
}

export interface AssetMonthlyData {
  id: number;
  asset_id: number;
  record_date: string;
  open_price: string | number;
  high_price: string | number;
  low_price: string | number;
  close_price: string | number;
  volume: string | number | null;
}

export interface InvestorOverviewStock {
  stock_symbol: string;
  stock_name: string | null;
  total_shares: number;
  total_cost: number;
  average_cost: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
}

export interface InvestorAssetOverview {
  portfolio: {
    id: number;
    name: string;
    currency: string | null;
    current_balance: number;
    total_invested: number;
    total_value: number;
  };
  stocks: InvestorOverviewStock[];
}

export interface AssetNewsItem {
  id: number;
  title: string;
  content: string | null;
  source: string;
  url: string;
  sentiment: string;
  sentiment_label: string;
  stock_symbols: string[];
  published_at: string;
}

export interface CorporateEvent {
  id: number;
  stock_symbol: string;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
}

export interface TrendingStock {
  id: number;
  symbol: string;
  name: string | null;
  sector: string | null;
  estimated_growth: string | number;
}

export interface ValuationScenario {
  price: number;
  growthRate: number;
  reasoning: string;
}

export interface StockValuation {
  currentPrice: number;
  intrinsicValue: number;
  valuationPercentage: number;
  isOvervalued: boolean;
  scenarios: {
    bear: ValuationScenario;
    base: ValuationScenario;
    bull: ValuationScenario;
  };
  wallStreetTargets: {
    low: number | null;
    mean: number | null;
    high: number | null;
  };
  dcfInputs: {
    freeCashFlow: number | null;
    growthRate: number;
    discountRate: number;
    terminalGrowthRate: number;
    sharesOutstanding: number | null;
    isEstimated?: boolean;
  };
}

export interface AssetListQuery {
  sector?: string;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

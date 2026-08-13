export type CostMethod = 'FIFO' | 'LIFO' | 'AVERAGE';

export interface BuyStockInput {
  stock_symbol: string;
  stock_name?: string;
  shares_count: number;
  purchase_price: number;
  fees?: number;
  currency?: string;
  purchase_date?: string;
  notes?: string;
}

export interface SellStockInput {
  stock_symbol: string;
  shares_count: number;
  sold_price: number;
  fees?: number;
  cost_method?: CostMethod;
  sold_date?: string;
  notes?: string;
}

export interface InvestorHolding {
  symbol: string;
  name?: string | null;
  currency: string;
  shares: number;
  average_cost: number;
  cost_basis: number;
  market_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_percent: number | null;
}

export interface InvestorActivity {
  id: number;
  type: string;
  amount: number | string;
  symbol?: string | null;
  description?: string | null;
  occurred_at: string;
  source?: string | null;
  status?: string;
}

export interface InvestorSale {
  id: number;
  portfolio_id: number;
  stock_symbol: string;
  shares_count: number | string;
  sold_price: number | string;
  gross_amount?: number | string;
  fees?: number | string;
  cost_basis?: number | string;
  realized_pnl?: number | string;
  cost_method?: CostMethod;
  sold_date: string;
  notes?: string | null;
}

export interface InvestorPerformancePoint {
  date: string;
  value: number;
  cash?: number;
  deposits?: number;
  withdrawals?: number;
}

export interface InvestorDashboard {
  portfolio: {
    id: number;
    name: string;
    currency: string;
  };
  summary: {
    cash: number;
    invested_cost: number;
    market_value: number;
    portfolio_value: number;
    realized_pnl: number;
    unrealized_pnl: number;
    dividends: number;
    total_pnl: number;
    total_return_percent: number;
    open_holdings: number;
    closed_sales: number;
  };
  holdings: InvestorHolding[];
  recent_activity: InvestorActivity[];
}

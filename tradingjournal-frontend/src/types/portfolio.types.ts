export type PortfolioType = 'TRADER' | 'INVESTOR';

export type InvestorCostMethod = 'FIFO' | 'LIFO' | 'AVERAGE';

export interface Portfolio {
  id: number;
  user_id: number | null;
  name: string;
  initial_balance: string | number;
  current_balance: string | number;
  portfolio_type: PortfolioType;
  investor_cost_method: InvestorCostMethod;
  currency: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreatePortfolioPayload {
  name: string;
  initial_balance: number;
  portfolio_type?: PortfolioType;
  currency?: string;
  icon?: string;
  color?: string;
  is_default?: boolean;
}

export interface UpdatePortfolioPayload {
  name?: string;
  initial_balance?: number;
  portfolio_type?: PortfolioType;
  currency?: string;
  icon?: string | null;
  color?: string | null;
  is_default?: boolean;
}

export interface ListPortfoliosQuery {
  type?: PortfolioType;
}

export interface DeletePortfolioResponse {
  message: string;
  deleted_id: number;
}

export interface PortfolioState {
  portfolios: Portfolio[];
  activePortfolioIds: Record<PortfolioType, number | null>;
  activeType: PortfolioType;
  isLoading: boolean;
  isSubmitting: boolean;
  hasLoadedAll: boolean;
  loadedTypes: Record<PortfolioType, boolean>;
  error: string | null;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

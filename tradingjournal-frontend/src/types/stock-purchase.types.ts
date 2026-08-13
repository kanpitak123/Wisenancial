export type StockPurchaseStatus = 'OPEN' | 'CLOSED';

export interface StockPurchase {
  id: number;
  portfolio_id: number;
  stock_symbol: string;
  stock_name: string | null;
  shares_count: number;
  purchase_price: number;
  total_amount: number;
  currency: string;
  purchase_reason: string | null;
  expectation: string | null;
  target_price: number | null;
  stop_loss: number | null;
  strategy: string | null;
  emotion: string | null;
  notes: string | null;
  folder_name: string | null;
  status: StockPurchaseStatus;
  sold_price: number | null;
  sold_date: string | null;
  purchase_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStockPurchasePayload {
  stock_symbol: string;
  stock_name?: string;
  shares_count: number;
  purchase_price: number;
  currency?: string;
  purchase_reason?: string;
  expectation?: string;
  target_price?: number;
  stop_loss?: number;
  strategy?: string;
  emotion?: string;
  notes?: string;
  folder_name?: string;
  purchase_date?: string;
}

export type UpdateStockPurchasePayload = Partial<CreateStockPurchasePayload>;

export interface SellStockPurchasePayload {
  sold_price: number;
  sold_date?: string;
}

export interface StockPurchaseSummary {
  total_records: number;
  open_positions: number;
  closed_positions: number;
  invested_amount: number;
  realized_pnl: number;
}

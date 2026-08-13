export type TradeSide = 'BUY' | 'SELL';

export type TradeSource = 'manual' | 'import';

export type TradeResult = 'OPEN' | 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface Trade {
  id: number;
  user_id: number | null;
  portfolio_id: number | null;
  import_id: number | null;
  broker: string | null;
  account_id: string | null;
  ticket_id: string | null;
  source: TradeSource;
  pair: string;
  trade_type: TradeSide;
  volume: string | number | null;
  open_price: string | number | null;
  close_price: string | number | null;
  stop_loss: string | number | null;
  take_profit: string | number | null;
  commission: string | number | null;
  swap: string | number | null;
  pnl: string | number | null;
  result_status: TradeResult;
  opened_at: string | null;
  closed_at: string | null;
  timeframe: string | null;
  trend: string | null;
  strategy: string | null;
  emotion: string | null;
  entry_reason: string | null;
  note: string | null;
  asset_name: string | null;
  rsi: number | null;
  macd: string | null;
  target_points: string | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateTradePayload {
  pair: string;
  trade_type: TradeSide;
  volume?: number;
  contract_size?: number;
  open_price?: number;
  close_price?: number;
  stop_loss?: number;
  take_profit?: number;
  commission?: number;
  swap?: number;
  pnl?: number;
  opened_at?: string;
  closed_at?: string;
  timeframe?: string;
  trend?: string;
  strategy?: string;
  emotion?: string;
  entry_reason?: string;
  note?: string;
  asset_name?: string;
  rsi?: number;
  macd?: string;
  target_points?: string;
}

export type UpdateTradePayload = Partial<CreateTradePayload>;

export interface CloseTradePayload {
  close_price: number;
  pnl?: number;
  closed_at?: string;
  note?: string;
}

export interface CalculatePnlPayload {
  trade_type: TradeSide;
  open_price: number;
  close_price: number;
  volume: number;
  contract_size?: number;
  commission?: number;
  swap?: number;
}

export interface PnlBreakdown {
  direction: 1 | -1;
  price_difference: number;
  volume: number;
  contract_size: number;
  gross_pnl: number;
  commission_cost: number;
  swap: number;
  net_pnl: number;
  result_status: 'WIN' | 'LOSS' | 'BREAKEVEN';
}

export interface ImportTradesPayload {
  file: File;
  broker: string;
  accountId: string;
}

export interface ImportTradesResponse {
  success: boolean;
  imported_count: number;
  skipped_count: number;
  import_id: number;
}

export interface DeleteTradeResponse {
  message: string;
  deleted_id: number;
}

export interface LeaderboardApiItem {
  username: string;
  initial_balance: number;
  current_balance: number;
  win_rate: number | null;
  total_pnl: number;
}

export interface LeaderboardUser {
  rank: number;
  username: string;
  initials: string;
  initial: number;
  net: number;
  totalPnl: number;
  winRate: number | null;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

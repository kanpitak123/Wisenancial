export type RecordType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'FEE'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'TRADE_PNL'
  | 'STOCK_BUY'
  | 'STOCK_SELL'
  | 'DIVIDEND'
  | 'TAX'
  | 'REVERSAL';

export type RecordSource =
  | 'MANUAL'
  | 'TRADE'
  | 'STOCK_PURCHASE'
  | 'DIVIDEND'
  | 'TRANSFER'
  | 'SYSTEM';

export type RecordStatus = 'ACTIVE' | 'REVERSED';

export type ManualRecordType = 'DEPOSIT' | 'WITHDRAW' | 'ADJUSTMENT' | 'FEE' | 'TAX';

export interface PortfolioRecord {
  id: number;
  portfolio_id: number;
  type: RecordType;
  amount: string | number;
  currency: string;
  description: string | null;
  source: RecordSource;
  source_id: number | null;
  occurred_at: string;
  status: RecordStatus;
  reversal_of_id: number | null;
  transfer_group_id: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface RecordSummaryItem {
  amount: number;
  count: number;
}

export interface RecordsSummary {
  portfolio_id: number;
  totals: Partial<Record<RecordType, RecordSummaryItem>>;
  net_amount: number;
  record_count: number;
}

export interface RecordsQuery {
  type?: RecordType;
  limit?: number;
  from?: string;
  to?: string;
  status?: RecordStatus;
}

export interface CreateManualRecordPayload {
  type: ManualRecordType;
  amount: number;
  currency?: string;
  description?: string;
  occurred_at?: string;
}

export interface CreateManualRecordResponse {
  record: PortfolioRecord;
  current_balance: number;
}

export interface CreateTransferPayload {
  from_portfolio_id: number;
  to_portfolio_id: number;
  amount: number;
  description?: string;
}

export interface TransferResponse {
  transfer_group_id: string;
  transfer_out: PortfolioRecord;
  transfer_in: PortfolioRecord;
}

export interface ReverseRecordPayload {
  reason?: string;
}

export interface RebuildBalanceResponse {
  portfolio_id: number;
  initial_balance: number;
  records_total: number;
  previous_balance: number;
  rebuilt_balance: number;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

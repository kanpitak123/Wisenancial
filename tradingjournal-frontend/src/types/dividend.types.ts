export type DividendStatus = 'ACTIVE' | 'REVERSED';

export interface Dividend {
  id: number;
  user_id: number;
  portfolio_id: number;
  symbol: string;
  name: string | null;
  payment_date: string;
  shares: string | number;
  dividend_per_share: string | number;
  wht_rate: string | number;
  gross_amount: string | number;
  tax_withheld: string | number;
  net_amount: string | number;
  status: DividendStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface DividendSummary {
  portfolio_id: number;
  year: number | null;
  count: number;
  gross_amount: number;
  tax_withheld: number;
  net_amount: number;
}

export interface CreateDividendPayload {
  symbol: string;
  name?: string;
  payment_date: string;
  shares: number;
  dividend_per_share: number;
  wht_rate?: number;
}

export type UpdateDividendPayload = Partial<CreateDividendPayload>;

export interface DividendRecord {
  id: number;
  portfolio_id: number;
  type: 'DIVIDEND';
  amount: string | number;
  currency: string;
  description: string | null;
  source: 'DIVIDEND';
  source_id: number | null;
  occurred_at: string;
  status: 'ACTIVE';
}

export interface CreateDividendResponse {
  dividend: Dividend;
  record: DividendRecord;
  current_balance: number;
}

export interface UpdateDividendResponse {
  dividend: Dividend;
  current_balance: number;
}

export interface RemoveDividendResponse {
  message: string;
  reversed_id: number;
  dividend: Dividend;
  reversal: {
    id: number;
    portfolio_id: number;
    type: 'REVERSAL';
    amount: string | number;
    currency: string;
    source: 'SYSTEM';
    source_id: number | null;
    reversal_of_id: number | null;
  };
  current_balance: number;
}

export interface DividendQuery {
  year?: number;
}

/** หนึ่งรายการเงินปันผลในรายงานภาษี (GET /dividends/portfolio/:id/tax-summary) */
export interface DividendTaxRecord {
  id: number;
  symbol: string;
  name: string;
  /** yyyy-mm-dd */
  paymentDate: string;
  shares: number;
  dividendPerShare: number;
  grossAmount: number;
  /** สัดส่วน ไม่ใช่เปอร์เซ็นต์ — 0.1 = 10% */
  whtRate: number;
  taxWithheld: number;
  netAmount: number;
}

export interface DividendWhtRateBucket {
  whtRate: number;
  count: number;
  grossAmount: number;
  taxWithheld: number;
}

export interface DividendTaxSummary {
  portfolio_id: number;
  year: number;
  records: DividendTaxRecord[];
  totalGross: number;
  totalTaxWithheld: number;
  totalNet: number;
  byWhtRate: DividendWhtRateBucket[];
}

export interface ApiErrorResponse {
  message?: string | string[];
}

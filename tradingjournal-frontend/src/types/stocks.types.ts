export type StockExchange = 'NASDAQ' | 'NYSE' | 'SET';

export type StockSector =
  | 'Technology'
  | 'Financials'
  | 'Energy'
  | 'Healthcare'
  | 'Consumer'
  | 'Industrials'
  | 'Communication';

/** A single row in the all-stocks universe table. */
export interface StockListing {
  symbol: string;
  name: string;
  exchange: StockExchange;
  sector: StockSector;
  price: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  dividendYield: number | null;
  volume: number;
}

export interface StockListParams {
  search?: string;
  exchange?: StockExchange | 'ALL';
  /** Restricts the universe to Thai (SET) or non-Thai listings, independent of `exchange`. */
  market?: 'TH' | 'GLOBAL';
  sector?: StockSector | 'ALL';
  sortBy?: keyof Pick<
    StockListing,
    'symbol' | 'price' | 'changePercent' | 'marketCap' | 'peRatio' | 'dividendYield' | 'volume'
  >;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface StockListResponse {
  rows: StockListing[];
  total: number;
  page: number;
  pageSize: number;
}

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

/**
 * แถวหุ้นยอดนิยมที่ใช้บนแผงซ้ายของ Stock Terminal
 *
 * /stocks/popular (สหรัฐ) กับ /stocks/popular-th (ไทย) คืนคนละรูปร่างกัน — ฝั่งไทยมี
 * support/resistance/valueMB ส่วนฝั่งสหรัฐมี support1/2, resistance1/2, marketCap
 * ตรงกลางที่ทั้งคู่มีเหมือนกันคือ 4 ฟิลด์นี้ ซึ่งพอดีกับที่แผงต้องใช้ จึงประกาศเป็น
 * ตัวร่วมไว้ ไม่ต้องแปลงรูปร่างหรือรวมสองอินเทอร์เฟซเข้าด้วยกัน
 */
export interface PopularStockRow {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
}

/** ตลาดของแผงหุ้นยอดนิยม — คนละความหมายกับ StockExchange (NASDAQ/NYSE/SET) */
export type PopularMarket = 'TH' | 'US';

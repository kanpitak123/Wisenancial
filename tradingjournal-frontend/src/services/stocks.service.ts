import { api } from 'src/boot/axios';
import type {
  PopularMarket,
  PopularStockRow,
  StockExchange,
  StockListParams,
  StockListResponse,
  StockSector,
} from 'src/types/stocks.types';

// Wired to the backend:
//   GET /stocks/listing?search=&exchange=&sector=&sortBy=&sortDir=&page=&pageSize=
//   GET /stocks/radar
//   GET /stocks/popular, GET /stocks/popular-th
// Errors propagate to the caller so the UI can surface a real error/empty state.

const SECTORS: StockSector[] = [
  'Technology',
  'Financials',
  'Energy',
  'Healthcare',
  'Consumer',
  'Industrials',
  'Communication',
];

export const SECTOR_OPTIONS = SECTORS;
export const EXCHANGE_OPTIONS: StockExchange[] = ['NASDAQ', 'NYSE', 'SET'];

// ---- Momentum Radar feed ----

export type RadarCategory = 'Upside' | 'Downside' | 'Near-recommended' | 'Not-recommended';

export type RadarDateBucket = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';

export interface RadarStock {
  symbol: string;
  name: string;
  category: RadarCategory;
  sector: StockSector;
  dateBucket: RadarDateBucket;
  initialPrice: number;
  currentPrice: number;
  startDate: string;
  returnPercent: number;
}

/** ปัจจัยพื้นฐานรายตัวจาก GET /stocks/fundamentals — null = Yahoo ไม่มีข้อมูลให้ */
export interface RiskFundamental {
  symbol: string;
  peRatio: number | null;
  beta: number | null;
}

export const stocksService = {
  async list(params: StockListParams = {}): Promise<StockListResponse> {
    const {
      search = '',
      exchange = 'ALL',
      market,
      sector = 'ALL',
      sortBy = 'marketCap',
      sortDir = 'desc',
      page = 1,
      pageSize = 10,
    } = params;

    const { data } = await api.get<StockListResponse>('/stocks/listing', {
      params: { search, exchange, market, sector, sortBy, sortDir, page, pageSize },
    });
    return data;
  },

  /** Fetch the Momentum Radar feed (price-momentum buckets computed by the backend). */
  async getRadar(): Promise<RadarStock[]> {
    const { data } = await api.get<RadarStock[]>('/stocks/radar');
    return data;
  },

  /**
   * P/E + beta ของหลาย symbol ในคำขอเดียว — ใช้ประกอบ AI Risk Analysis
   *
   * ยิงรวมทีเดียวไม่ใช่วนทีละตัว พอร์ตหลายสิบหุ้นจะได้ไม่กลายเป็นหลายสิบ request
   * (debtToEquity ยังไม่มีในนี้ — ดู "รอดำเนินการ — debtToEquity" ใน ai-prompt-audit.md)
   */
  async getRiskFundamentals(symbols: string[]): Promise<RiskFundamental[]> {
    if (symbols.length === 0) return [];

    const { data } = await api.get<RiskFundamental[]>('/stocks/fundamentals', {
      params: { symbols: symbols.join(',') },
    });
    return data;
  },

  /**
   * หุ้นยอดนิยมของตลาดที่ระบุ — ทั้งสอง endpoint มีอยู่จริงและมีคนใช้อยู่แล้ว
   * (/stocks/popular ใช้ใน StockAnalysisPage, /stocks/popular-th ใช้ใน MarketOverviewSection)
   * ไม่ใช่ dead code ที่เพิ่งขุดมา — ที่นี่แค่รวมทางเข้าไว้ที่เดียว
   *
   * รายชื่อหุ้นถูก hardcode ไว้ฝั่ง backend (popularSymbols 10 ตัว / SET 8 ตัว) ส่วนราคา
   * มาจาก Yahoo จริง — ไม่ได้อ่านจากตาราง stocks จึงไม่ขึ้นกับ seed
   */
  async getPopular(market: PopularMarket): Promise<PopularStockRow[]> {
    const { data } = await api.get<PopularStockRow[]>(
      market === 'TH' ? '/stocks/popular-th' : '/stocks/popular',
    );
    return data ?? [];
  },
};

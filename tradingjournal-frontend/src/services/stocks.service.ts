import { api } from 'src/boot/axios';
import type {
  StockExchange,
  StockListParams,
  StockListResponse,
  StockSector,
} from 'src/types/stocks.types';

// Wired to the backend:
//   GET /stocks/listing?search=&exchange=&sector=&sortBy=&sortDir=&page=&pageSize=
//   GET /stocks/radar
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

// ---- AI radar feed ----

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

  /** Fetch the AI radar recommendations (real momentum data from the backend). */
  async getRadar(): Promise<RadarStock[]> {
    const { data } = await api.get<RadarStock[]>('/stocks/radar');
    return data;
  },
};

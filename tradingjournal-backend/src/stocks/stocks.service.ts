import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService, type ListingMetric } from './market-data.service';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  exchange: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  sector: string | null;
}

export type StockListingExchange = 'NASDAQ' | 'NYSE' | 'SET';

export interface StockListingRow {
  symbol: string;
  name: string;
  exchange: StockListingExchange;
  sector: string;
  price: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  dividendYield: number | null;
  volume: number;
}

export interface StockListingResponse {
  rows: StockListingRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StockListingParams {
  search?: string;
  exchange?: StockListingExchange | 'ALL';
  sector?: string | 'ALL';
  sortBy?: keyof Pick<
    StockListingRow,
    | 'symbol'
    | 'price'
    | 'changePercent'
    | 'marketCap'
    | 'peRatio'
    | 'dividendYield'
    | 'volume'
  >;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// ---- AI radar (stock recommendations feed) ----

export type RadarCategory =
  | 'Upside'
  | 'Downside'
  | 'Near-recommended'
  | 'Not-recommended';

export type RadarDateBucket = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';

export type RadarSector =
  | 'Technology'
  | 'Financials'
  | 'Energy'
  | 'Healthcare'
  | 'Consumer'
  | 'Industrials'
  | 'Communication';

export interface RadarRecommendation {
  symbol: string;
  name: string;
  category: RadarCategory;
  sector: RadarSector;
  dateBucket: RadarDateBucket;
  initialPrice: number;
  currentPrice: number;
  /** ISO date (yyyy-mm-dd) the window starts. */
  startDate: string;
  returnPercent: number;
}

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataService,
  ) {}

  /**
   * Get all active stocks from the database
   * Optionally filter by search query (symbol or name)
   */
  async getStocks(search?: string): Promise<StockSearchResult[]> {
    const term = search?.trim() ?? '';
    const dbStocks = await this.queryDbStocks(term);

    // No search term → the seeded universe (US + Thai) is the initial list.
    if (term.length === 0) {
      return dbStocks;
    }

    // With a search term, also ask Yahoo so any symbol that isn't seeded —
    // including Thai `.BK` names — is still findable. DB matches win on
    // symbol collisions; Yahoo is best-effort and never blocks DB results.
    const yahooStocks = await this.searchYahoo(term);
    const bySymbol = new Map<string, StockSearchResult>();
    for (const stock of [...dbStocks, ...yahooStocks]) {
      const key = stock.symbol.toUpperCase();
      if (!bySymbol.has(key)) bySymbol.set(key, stock);
    }
    return Array.from(bySymbol.values()).slice(0, 50);
  }

  private async queryDbStocks(term: string): Promise<StockSearchResult[]> {
    try {
      const whereClause: any = {
        is_active: true,
      };

      if (term.length > 0) {
        const searchTerm = term.toUpperCase();
        whereClause.OR = [
          { symbol: { contains: searchTerm, mode: 'insensitive' } },
          { name: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      return await this.prisma.stocks.findMany({
        where: whereClause,
        select: {
          symbol: true,
          name: true,
          sector: true,
        },
        orderBy: [{ symbol: 'asc' }],
        take: 200, // covers the full seeded universe; search narrows from there
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch stocks from database: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to fetch stocks from the database',
      );
    }
  }

  /** Best-effort symbol/company lookup via Yahoo. Returns [] on any failure. */
  private async searchYahoo(query: string): Promise<StockSearchResult[]> {
    try {
      const result = await yahooFinance.search(query, {
        quotesCount: 20,
        newsCount: 0,
      });
      const quotes = (result?.quotes ?? []) as Array<Record<string, any>>;
      return quotes
        .filter(
          (q) =>
            q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'),
        )
        .map((q) => ({
          symbol: String(q.symbol).toUpperCase(),
          name: String(q.shortname || q.longname || q.symbol),
          sector: null,
        }));
    } catch (error) {
      this.logger.warn(
        `Yahoo search failed for "${query}": ${error instanceof Error ? error.message : error}`,
      );
      return [];
    }
  }

  /**
   * Get a single stock by symbol
   */
  async getStockBySymbol(symbol: string): Promise<Stock | null> {
    try {
      const stock = await this.prisma.stocks.findUnique({
        where: {
          symbol: symbol.toUpperCase(),
        },
      });

      return stock;
    } catch (error) {
      this.logger.error(
        `Failed to fetch stock ${symbol}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(`Failed to fetch stock ${symbol}`);
    }
  }

  /**
   * Create a new stock entry
   */
  async createStock(
    symbol: string,
    name: string,
    sector?: string,
    exchange?: string,
  ): Promise<Stock> {
    try {
      const stock = await this.prisma.stocks.create({
        data: {
          symbol: symbol.toUpperCase(),
          name,
          sector,
          exchange,
          is_active: true,
        },
      });

      return stock;
    } catch (error) {
      this.logger.error(
        `Failed to create stock ${symbol}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to create stock ${symbol}`,
      );
    }
  }

  /**
   * Paginated, sortable, filterable stock universe for the All Stocks table.
   *
   * Reads the base universe from the `stocks` table when populated, otherwise
   * falls back to a built-in seed list. Market metrics (price, change, cap,
   * P/E, yield, volume) are real Yahoo quotes fetched in batch and cached for a
   * few minutes (see MarketDataService.getListingMetrics).
   */
  async getListing(
    params: StockListingParams = {},
  ): Promise<StockListingResponse> {
    const {
      search = '',
      exchange = 'ALL',
      sector = 'ALL',
      sortBy = 'marketCap',
      sortDir = 'desc',
      page = 1,
      pageSize = 10,
    } = params;

    const universe = await this.buildListingUniverse();

    let rows = universe;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      );
    }
    if (exchange !== 'ALL') rows = rows.filter((r) => r.exchange === exchange);
    if (sector !== 'ALL') rows = rows.filter((r) => r.sector === sector);

    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      return (av - bv) * dir;
    });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);

    return { rows: paged, total, page, pageSize };
  }

  private async buildListingUniverse(): Promise<StockListingRow[]> {
    // Prefer the DB-backed universe; fall back to the seed list if empty.
    let base: {
      symbol: string;
      name: string;
      sector: string | null;
      exchange: string | null;
    }[] = [];
    try {
      base = await this.prisma.stocks.findMany({
        where: { is_active: true },
        select: { symbol: true, name: true, sector: true, exchange: true },
        take: 500,
      });
    } catch {
      base = [];
    }

    if (base.length === 0) {
      base = LISTING_SEED.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        exchange: s.exchange,
      }));
    }

    // Real quote metrics (Yahoo, cached). A symbol Yahoo can't quote is absent
    // from the map and renders as a "no data" row rather than fabricated numbers.
    const metrics = await this.marketData.getListingMetrics(
      base.map((s) => s.symbol),
    );

    return base.map((s) => this.enrichListing(s, metrics.get(s.symbol)));
  }

  private enrichListing(
    s: {
      symbol: string;
      name: string;
      sector: string | null;
      exchange: string | null;
    },
    metric?: ListingMetric,
  ): StockListingRow {
    const exchange: StockListingExchange = inferExchange(s.exchange, s.symbol);

    return {
      symbol: s.symbol,
      name: s.name,
      exchange,
      sector: s.sector ?? 'Other',
      price: metric?.price ?? 0,
      changePercent: metric?.changePercent ?? 0,
      marketCap: metric?.marketCap ?? 0,
      peRatio: metric?.peRatio ?? null,
      dividendYield: metric?.dividendYield ?? null,
      volume: metric?.volume ?? 0,
    };
  }

  /**
   * AI radar feed — momentum-based stock picks computed from live Yahoo Finance
   * price history (no mock data). One entry per symbol, bucketed by whichever
   * window (1D / 1W / 1M) produced the largest absolute move, then categorized
   * by that return.
   */
  async getRadar(): Promise<RadarRecommendation[]> {
    const entries = await Promise.all(
      LISTING_SEED.map((seed) => this.buildRadarEntry(seed)),
    );
    return entries.filter((e): e is RadarRecommendation => e !== null);
  }

  private async buildRadarEntry(
    seed: ListingSeed,
  ): Promise<RadarRecommendation | null> {
    try {
      const history = await this.marketData.getHistoricalData(seed.symbol, {
        timeframe: '1M',
      });
      if (!history || history.length < 2) return null;

      const sorted = [...history]
        .filter((p) => p.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length < 2) return null;

      const len = sorted.length;
      const currentPrice = sorted[len - 1].close;

      const windows: Array<{ bucket: RadarDateBucket; idx: number }> = [
        { bucket: 'TODAY', idx: len - 2 },
        { bucket: 'THIS_WEEK', idx: Math.max(0, len - 6) },
        { bucket: 'THIS_MONTH', idx: 0 },
      ];

      // Choose the window with the largest absolute return.
      let best: {
        bucket: RadarDateBucket;
        initialPrice: number;
        startDate: string;
        returnPercent: number;
      } | null = null;

      for (const w of windows) {
        const point = sorted[w.idx];
        if (!point || point.close <= 0) continue;
        const initialPrice = point.close;
        const returnPercent = Number(
          (((currentPrice - initialPrice) / initialPrice) * 100).toFixed(2),
        );
        if (!best || Math.abs(returnPercent) > Math.abs(best.returnPercent)) {
          best = {
            bucket: w.bucket,
            initialPrice: Number(initialPrice.toFixed(2)),
            startDate: point.date.slice(0, 10),
            returnPercent,
          };
        }
      }

      if (!best) return null;

      return {
        symbol: seed.symbol,
        name: seed.name,
        category: this.categorizeReturn(best.returnPercent),
        sector: seed.sector as RadarSector,
        dateBucket: best.bucket,
        initialPrice: best.initialPrice,
        currentPrice: Number(currentPrice.toFixed(2)),
        startDate: best.startDate,
        returnPercent: best.returnPercent,
      };
    } catch (error) {
      this.logger.warn(
        `Radar: failed to build entry for ${seed.symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private categorizeReturn(returnPercent: number): RadarCategory {
    if (returnPercent >= 10) return 'Upside';
    if (returnPercent >= 3) return 'Near-recommended';
    if (returnPercent <= -10) return 'Downside';
    return 'Not-recommended';
  }
}

interface ListingSeed {
  symbol: string;
  name: string;
  exchange: StockListingExchange;
  sector: string;
}

const LISTING_SEED: ListingSeed[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    sector: 'Technology',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    exchange: 'NASDAQ',
    sector: 'Technology',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    exchange: 'NASDAQ',
    sector: 'Technology',
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    exchange: 'NASDAQ',
    sector: 'Technology',
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    exchange: 'NASDAQ',
    sector: 'Communication',
  },
  {
    symbol: 'META',
    name: 'Meta Platforms',
    exchange: 'NASDAQ',
    sector: 'Communication',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com',
    exchange: 'NASDAQ',
    sector: 'Consumer',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    exchange: 'NASDAQ',
    sector: 'Consumer',
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    exchange: 'NYSE',
    sector: 'Financials',
  },
  {
    symbol: 'BAC',
    name: 'Bank of America',
    exchange: 'NYSE',
    sector: 'Financials',
  },
  {
    symbol: 'GS',
    name: 'Goldman Sachs',
    exchange: 'NYSE',
    sector: 'Financials',
  },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', sector: 'Financials' },
  { symbol: 'XOM', name: 'Exxon Mobil', exchange: 'NYSE', sector: 'Energy' },
  { symbol: 'CVX', name: 'Chevron Corp.', exchange: 'NYSE', sector: 'Energy' },
  {
    symbol: 'JNJ',
    name: 'Johnson & Johnson',
    exchange: 'NYSE',
    sector: 'Healthcare',
  },
  { symbol: 'LLY', name: 'Eli Lilly', exchange: 'NYSE', sector: 'Healthcare' },
  {
    symbol: 'PFE',
    name: 'Pfizer Inc.',
    exchange: 'NYSE',
    sector: 'Healthcare',
  },
  { symbol: 'BA', name: 'Boeing Co.', exchange: 'NYSE', sector: 'Industrials' },
  {
    symbol: 'CAT',
    name: 'Caterpillar',
    exchange: 'NYSE',
    sector: 'Industrials',
  },
  { symbol: 'PTT.BK', name: 'PTT PCL', exchange: 'SET', sector: 'Energy' },
  {
    symbol: 'DELTA.BK',
    name: 'Delta Electronics (Thailand)',
    exchange: 'SET',
    sector: 'Technology',
  },
  {
    symbol: 'KBANK.BK',
    name: 'Kasikornbank',
    exchange: 'SET',
    sector: 'Financials',
  },
  { symbol: 'SCB.BK', name: 'SCB X', exchange: 'SET', sector: 'Financials' },
  {
    symbol: 'AOT.BK',
    name: 'Airports of Thailand',
    exchange: 'SET',
    sector: 'Industrials',
  },
  { symbol: 'CPALL.BK', name: 'CP All', exchange: 'SET', sector: 'Consumer' },
  {
    symbol: 'GULF.BK',
    name: 'Gulf Energy Development',
    exchange: 'SET',
    sector: 'Energy',
  },
  {
    symbol: 'ADVANC.BK',
    name: 'Advanced Info Service',
    exchange: 'SET',
    sector: 'Communication',
  },
];

function inferExchange(
  exchange: string | null,
  symbol: string,
): StockListingExchange {
  const ex = (exchange ?? '').toUpperCase();
  if (ex === 'NASDAQ' || ex === 'NYSE' || ex === 'SET') return ex;
  if (symbol.toUpperCase().endsWith('.BK')) return 'SET';
  return 'NASDAQ';
}

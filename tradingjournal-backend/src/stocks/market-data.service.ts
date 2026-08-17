import { Injectable, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

/** Real per-symbol metrics for the All-Stocks listing table. */
export interface ListingMetric {
  price: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  dividendYield: number | null;
  volume: number;
}

/** Real index-level stats for the Market Overview header (e.g. ^SET.BK). */
export interface IndexQuote {
  price: number;
  changePercent: number;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  previousClose: number | null;
  /** Classic floor-trader pivots from the session's real high/low/close. */
  support1: number | null;
  resistance1: number | null;
}

/** Real quote row for the Market Overview "Popular Stocks" table. */
export interface PopularStockRow {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  support: number | null;
  resistance: number | null;
  /** Trading value in millions (price × volume / 1e6). */
  valueMB: number | null;
  pe: number | null;
  eps: number | null;
  dividendPct: number | null;
}

/** Batched Yahoo quotes are cached briefly so pagination/sorting don't refetch. */
const LISTING_METRIC_TTL_MS = 5 * 60 * 1000;
const listingMetricCache = new Map<
  string,
  { metric: ListingMetric; expires: number }
>();

function mapQuoteToListingMetric(quote: any): ListingMetric {
  const num = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  // Yahoo reports trailingAnnualDividendYield as a fraction (0.032 = 3.2%).
  const yieldFraction = num(quote?.trailingAnnualDividendYield);
  const round2 = (value: number | null): number | null =>
    value === null ? null : Number(value.toFixed(2));
  return {
    price: round2(num(quote?.regularMarketPrice)) ?? 0,
    changePercent: round2(num(quote?.regularMarketChangePercent)) ?? 0,
    marketCap: num(quote?.marketCap) ?? 0,
    peRatio: round2(num(quote?.trailingPE)),
    dividendYield:
      yieldFraction !== null ? Number((yieldFraction * 100).toFixed(2)) : null,
    volume: num(quote?.regularMarketVolume) ?? 0,
  };
}

export interface StockProfile {
  symbol: string;
  name: string;
  description: string;
  ceo: string;
  website: string;
  industry: string;
  marketCap: number;
  sector: string;
  headquarters: string;
  currentPrice: number;
  /** Trailing annual dividend yield as a percentage (e.g. 0.53 = 0.53%). */
  dividendYield: number | null;
}

export interface FinancialData {
  symbol: string;
  revenue: number;
  netIncome: number;
  eps: number;
  peRatio: number;
  quarter: string;
  year: number;
}

export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternCoordinate {
  date: string;
  price: number;
}

export interface DetectedPattern {
  name: string | null;
  detectedAt: string | null;
  coordinates: PatternCoordinate[];
}

export interface EmaSeries {
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema100: (number | null)[];
}

export interface StochasticResult {
  k: number;
  d: number;
}

export type OverboughtOversoldStatus =
  | 'Strong Buy'
  | 'Buy Signal'
  | 'Strong Sell'
  | 'Sell Signal'
  | 'Neutral';

export interface OverboughtOversoldSignal {
  status: OverboughtOversoldStatus;
  rsi: number;
  stochasticK: number;
  stochasticD: number;
  /** True when BOTH RSI and Stochastic %K agree (high-probability reversal). */
  isStrongReversal: boolean;
  description: string;
}

export interface TechnicalIndicators {
  rsi: number;
  stochastic: StochasticResult;
  overboughtOversold: OverboughtOversoldSignal;
  supportLevels: number[];
  resistanceLevels: number[];
  currentPrice: number;
  detectedPattern: DetectedPattern;
  emas: EmaSeries;
}

export interface PivotPoint {
  index: number;
  date: string;
  price: number;
  type: 'peak' | 'trough';
}

export interface IntrinsicValueAnalysis {
  symbol: string;
  currentPrice: number;
  intrinsicValue: number;
  status: 'Undervalued' | 'Fair Value' | 'Overvalued';
  discountPremium: number; // Percentage difference
  analysis: {
    peAnalysis: string;
    epsGrowth: string;
    revenueQuality: string;
    overall: string;
  };
  confidence: number; // 0-100
}

export interface StockAnalysisResponse {
  profile: StockProfile;
  financials: FinancialData[];
  historicalData: HistoricalDataPoint[];
  technicalIndicators: TechnicalIndicators;
}

export interface StockAnalysisWithValuationResponse extends StockAnalysisResponse {
  intrinsicValue: IntrinsicValueAnalysis;
}

export interface MonthlySeasonality {
  month: string;
  monthNumber: number;
  winRate: number;
  averageChangePercent: number;
  averageChangePrice: number;
  positiveYears: number;
  totalYears: number;
}

export interface SeasonalityAnalysis {
  symbol: string;
  analysis: MonthlySeasonality[];
  overallWinRate: number;
  bestMonth: MonthlySeasonality;
  worstMonth: MonthlySeasonality;
  totalYearsAnalyzed: number;
}

export interface EarningsEvent {
  id: string;
  symbol: string;
  companyName: string;
  date: string; // ISO date string
  time: string; // "Before Market Open" or "After Market Close"
  estimatedEPS?: number;
  previousEPS?: number;
  quarter: string; // "Q1 2024", "Q2 2024", etc.
}

export interface EarningsCalendar {
  events: EarningsEvent[];
  totalEvents: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export interface PopularStockQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  support1: number | null;
  support2: number | null;
  resistance1: number | null;
  resistance2: number | null;
  /** Trailing annual dividend yield as a percentage (e.g. 0.53 = 0.53%). */
  dividendYield: number | null;
  marketCap: number | null;
}

export interface AnalystRecommendation {
  symbol: string;
  /** e.g. 'strong_buy' | 'buy' | 'hold' | 'underperform' | 'sell', or null if no coverage. */
  recommendationKey: string | null;
  /** 1 (Strong Buy) to 5 (Sell) consensus average. */
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  /** yahoo-finance2 doesn't expose a genuine last-updated timestamp for this data; always null for now. */
  updatedAt: string | null;
}

export type YahooFinanceInterval =
  | '1m'
  | '2m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | '90m'
  | '1h'
  | '1d'
  | '5d'
  | '1wk'
  | '1mo'
  | '3mo';

interface AnalysisQueryOptions {
  timeframe?: string;
  interval?: YahooFinanceInterval;
  range?: string;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  /**
   * Real per-symbol quote metrics (price, %chg, cap, P/E, yield, volume) for a
   * batch of symbols, from Yahoo. Cached for a few minutes so the listing
   * table's pagination/sorting/filtering don't refetch every request. Symbols
   * Yahoo can't quote are simply absent from the map (caller shows "no data"
   * rather than a fabricated number).
   */
  async getListingMetrics(
    symbols: string[],
  ): Promise<Map<string, ListingMetric>> {
    const now = Date.now();
    const out = new Map<string, ListingMetric>();
    const toFetch: string[] = [];

    for (const symbol of symbols) {
      const cached = listingMetricCache.get(symbol);
      if (cached && cached.expires > now) {
        out.set(symbol, cached.metric);
      } else {
        toFetch.push(symbol);
      }
    }
    if (toFetch.length === 0) return out;

    // Chunk to keep each Yahoo request a sane size.
    for (let i = 0; i < toFetch.length; i += 40) {
      const chunk = toFetch.slice(i, i + 40);
      try {
        const quotes = await yahooFinance.quote(chunk);
        const arr = (Array.isArray(quotes) ? quotes : [quotes]) as any[];
        for (const quote of arr) {
          const symbol = quote?.symbol;
          if (!symbol) continue;
          const metric = mapQuoteToListingMetric(quote);
          listingMetricCache.set(symbol, {
            metric,
            expires: now + LISTING_METRIC_TTL_MS,
          });
          out.set(symbol, metric);
        }
      } catch (error) {
        this.logger.warn(
          `Yahoo batch quote failed for [${chunk.join(', ')}]: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return out;
  }

  /** Real index-level quote + pivots for the Market Overview header. */
  async getIndexQuote(symbol: string): Promise<IndexQuote> {
    const num = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const r2 = (value: number | null): number | null =>
      value === null ? null : Number(value.toFixed(2));

    const quote = (await yahooFinance.quote(symbol)) as any;
    const high = num(quote?.regularMarketDayHigh);
    const low = num(quote?.regularMarketDayLow);
    const close = num(quote?.regularMarketPrice);

    let support1: number | null = null;
    let resistance1: number | null = null;
    if (high !== null && low !== null && close !== null) {
      const pivot = (high + low + close) / 3;
      support1 = r2(2 * pivot - high);
      resistance1 = r2(2 * pivot - low);
    }

    return {
      price: close ?? 0,
      changePercent: r2(num(quote?.regularMarketChangePercent)) ?? 0,
      dayHigh: high,
      dayLow: low,
      week52High: num(quote?.fiftyTwoWeekHigh),
      week52Low: num(quote?.fiftyTwoWeekLow),
      previousClose: num(quote?.regularMarketPreviousClose),
      support1,
      resistance1,
    };
  }

  /** Real quotes for a set of symbols, shaped for the popular-stocks table. */
  async getPopularStockRows(symbols: string[]): Promise<PopularStockRow[]> {
    const num = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const r2 = (value: number | null): number | null =>
      value === null ? null : Number(value.toFixed(2));

    const results = await Promise.allSettled(
      symbols.map((symbol) => yahooFinance.quote(symbol)),
    );

    return results.flatMap((result, index) => {
      const requested = symbols[index];
      if (result.status === 'rejected' || !result.value) {
        this.logger.warn(`Could not fetch popular quote for ${requested}`);
        return [];
      }
      const quote = result.value as any;

      const high = num(quote?.regularMarketDayHigh);
      const low = num(quote?.regularMarketDayLow);
      const price = num(quote?.regularMarketPrice);
      const volume = num(quote?.regularMarketVolume);

      let support: number | null = null;
      let resistance: number | null = null;
      if (high !== null && low !== null && price !== null) {
        const pivot = (high + low + price) / 3;
        support = r2(2 * pivot - high);
        resistance = r2(2 * pivot - low);
      }

      const dividendFraction = num(quote?.trailingAnnualDividendYield);

      return [
        {
          symbol: quote?.symbol || requested,
          name: quote?.shortName || quote?.longName || requested,
          price: r2(price),
          changePercent: r2(num(quote?.regularMarketChangePercent)),
          preMarketPrice: r2(num(quote?.preMarketPrice)),
          preMarketChangePercent: r2(num(quote?.preMarketChangePercent)),
          support,
          resistance,
          valueMB:
            price !== null && volume !== null
              ? r2((price * volume) / 1_000_000)
              : null,
          pe: r2(num(quote?.trailingPE)),
          eps: r2(num(quote?.epsTrailingTwelveMonths)),
          dividendPct:
            dividendFraction !== null ? r2(dividendFraction * 100) : null,
        },
      ];
    });
  }

  async getStockProfile(symbol: string): Promise<StockProfile> {
    try {
      const quote = await yahooFinance.quote(symbol);
      const summary = (await yahooFinance
        .quoteSummary(symbol, {
          modules: ['assetProfile', 'summaryProfile'],
        })
        .catch(() => null)) as any;

      const assetProf = summary?.assetProfile || {};
      const sumProf = summary?.summaryProfile || {};
      const dividendYieldFraction = Number(quote.trailingAnnualDividendYield);

      return {
        symbol: quote.symbol || symbol,
        name: quote.shortName || quote.longName || symbol,
        description:
          assetProf.longBusinessSummary ||
          sumProf.longBusinessSummary ||
          'Company information not available',
        ceo: assetProf.companyOfficers?.[0]?.name || 'N/A',
        website: assetProf.website || 'N/A',
        industry: assetProf.industry || 'N/A',
        marketCap: quote.marketCap || 0,
        sector: assetProf.sector || 'N/A',
        headquarters:
          assetProf.city && assetProf.state
            ? `${assetProf.city}, ${assetProf.state}`
            : 'N/A',
        currentPrice: quote.regularMarketPrice || quote.currentPrice || 0,
        dividendYield: Number.isFinite(dividendYieldFraction)
          ? Number((dividendYieldFraction * 100).toFixed(2))
          : null,
      };
    } catch (error: any) {
      console.warn(`Could not fetch profile for ${symbol}:`, error.message);
      return this.getFallbackStockProfile(symbol);
    }
  }

  /** Symbols shown in the "Popular Stocks" table on the stock analysis page. */
  private readonly popularSymbols = [
    'AAPL',
    'MSFT',
    'NVDA',
    'GOOGL',
    'AMZN',
    'META',
    'TSLA',
    'AMD',
    'NFLX',
    'AVGO',
  ];

  /**
   * Live quotes for the popular-stocks table. Support/resistance are classic
   * floor-trader pivots computed from the current session's real OHLC.
   */
  async getPopularStocks(): Promise<PopularStockQuote[]> {
    const results = await Promise.allSettled(
      this.popularSymbols.map((symbol) => yahooFinance.quote(symbol)),
    );

    const toNumber = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const round2 = (value: number): number => Number(value.toFixed(2));

    return results.flatMap((result, index) => {
      const symbol = this.popularSymbols[index];
      if (result.status === 'rejected' || !result.value) {
        console.warn(`Could not fetch popular quote for ${symbol}`);
        return [];
      }
      const quote: any = result.value;

      const high = toNumber(quote.regularMarketDayHigh);
      const low = toNumber(quote.regularMarketDayLow);
      const close = toNumber(quote.regularMarketPrice);

      let support1: number | null = null;
      let support2: number | null = null;
      let resistance1: number | null = null;
      let resistance2: number | null = null;
      if (high !== null && low !== null && close !== null) {
        const pivot = (high + low + close) / 3;
        support1 = round2(2 * pivot - high);
        support2 = round2(pivot - (high - low));
        resistance1 = round2(2 * pivot - low);
        resistance2 = round2(pivot + (high - low));
      }

      const dividendYieldFraction = toNumber(quote.trailingAnnualDividendYield);

      return [
        {
          symbol: quote.symbol || symbol,
          name: quote.shortName || quote.longName || symbol,
          price: close,
          changePercent: toNumber(quote.regularMarketChangePercent),
          preMarketPrice: toNumber(quote.preMarketPrice),
          preMarketChangePercent: toNumber(quote.preMarketChangePercent),
          support1,
          support2,
          resistance1,
          resistance2,
          dividendYield:
            dividendYieldFraction !== null
              ? round2(dividendYieldFraction * 100)
              : null,
          marketCap: toNumber(quote.marketCap),
        },
      ];
    });
  }

  /**
   * Real analyst coverage (price targets + consensus rating) — not AI-generated.
   * Symbols with no analyst coverage legitimately return an all-null result;
   * the caller renders that as an empty state rather than fabricating a rating.
   */
  async getAnalystRecommendations(
    symbol: string,
  ): Promise<AnalystRecommendation> {
    const empty: AnalystRecommendation = {
      symbol,
      recommendationKey: null,
      recommendationMean: null,
      numberOfAnalysts: null,
      targetMeanPrice: null,
      targetHighPrice: null,
      targetLowPrice: null,
      updatedAt: null,
    };

    try {
      const result = (await yahooFinance.quoteSummary(symbol, {
        modules: ['financialData', 'recommendationTrend'],
      })) as any;

      const financialData = result?.financialData;
      if (!financialData) {
        return empty;
      }

      const toNumber = (value: unknown): number | null => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };

      const rawKey =
        typeof financialData.recommendationKey === 'string'
          ? financialData.recommendationKey.trim().toLowerCase()
          : '';
      const recommendationKey = rawKey && rawKey !== 'none' ? rawKey : null;

      return {
        symbol,
        recommendationKey,
        recommendationMean: toNumber(financialData.recommendationMean),
        numberOfAnalysts: toNumber(financialData.numberOfAnalystOpinions),
        targetMeanPrice: toNumber(financialData.targetMeanPrice),
        targetHighPrice: toNumber(financialData.targetHighPrice),
        targetLowPrice: toNumber(financialData.targetLowPrice),
        updatedAt: null,
      };
    } catch (error: any) {
      console.warn(
        `Could not fetch analyst recommendations for ${symbol}:`,
        error.message,
      );
      return empty;
    }
  }

  async getFinancialData(symbol: string): Promise<FinancialData[]> {
    try {
      const quote = await yahooFinance.quote(symbol);
      const peRatio = quote.trailingPE || quote.forwardPE || 0;
      const eps = quote.epsTrailingTwelveMonths || quote.epsForward || 0;

      const result = (await yahooFinance.quoteSummary(symbol, {
        modules: ['earnings'],
      })) as any;

      if (
        !result ||
        !result.earnings ||
        !result.earnings.financialsChart ||
        !result.earnings.financialsChart.quarterly
      ) {
        console.warn(
          `No quarterly earnings array found for ${symbol}, returning fallback with available data`,
        );
        const fallback = this.getFallbackFinancialData(symbol);
        return fallback.map((f) => ({ ...f, eps, peRatio }));
      }

      const financials: FinancialData[] =
        result.earnings.financialsChart.quarterly.map((quarterData: any) => ({
          symbol,
          revenue: quarterData.revenue || 0,
          netIncome: quarterData.earnings || 0,
          eps: eps,
          peRatio: peRatio,
          quarter: quarterData.date || 'Q?',
          year: new Date().getFullYear(),
        }));

      return financials.length > 0
        ? financials
        : this.getFallbackFinancialData(symbol);
    } catch (error: any) {
      console.warn(`Could not fetch financials for ${symbol}:`, error.message);
      return this.getFallbackFinancialData(symbol);
    }
  }

  async getHistoricalData(
    symbol: string,
    options: AnalysisQueryOptions = {},
  ): Promise<HistoricalDataPoint[]> {
    try {
      const { timeframe, interval, range } = options;
      const normalizedTimeframe = (timeframe || '1M').toUpperCase();
      const resolvedInterval: YahooFinanceInterval =
        interval ?? this.getIntervalForTimeframe(normalizedTimeframe);
      let result: any;

      const rangeDays = this.getDaysFromRange(range);
      const period2 = new Date();
      const period1 = new Date();
      const windowDays =
        rangeDays ?? this.getRobustTimeframeDays(normalizedTimeframe);
      period1.setDate(period2.getDate() - windowDays);

      result = await yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: resolvedInterval,
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        throw new Error(`No historical data found for ${symbol}`);
      }

      return result.quotes
        .filter(
          (quote: any) =>
            quote?.open != null &&
            quote?.high != null &&
            quote?.low != null &&
            quote?.close != null,
        )
        .map((quote: any) => ({
          date: this.normalizeDate(quote.date),
          open: Number(quote.open),
          high: Number(quote.high),
          low: Number(quote.low),
          close: Number(quote.close),
          volume: Number(quote.volume) || 0,
        }));
    } catch (error: any) {
      throw new Error(
        `Failed to fetch historical data for ${symbol}: ${error.message}`,
      );
    }
  }

  async getTechnicalIndicators(
    symbol: string,
    options: AnalysisQueryOptions = {},
  ): Promise<TechnicalIndicators> {
    try {
      const [historicalData, stockProfile] = await Promise.all([
        this.getHistoricalData(symbol, options),
        this.getStockProfile(symbol),
      ]);

      const normalizedHistory = historicalData.map((point) => ({
        ...point,
        date: this.normalizeDate(point.date),
      }));

      const closingPrices = normalizedHistory.map((point) => point.close);
      const currentPrice =
        stockProfile?.currentPrice ||
        closingPrices[closingPrices.length - 1] ||
        0;

      const highPrices = normalizedHistory.map((point) => point.high);
      const lowPrices = normalizedHistory.map((point) => point.low);

      const rsi = this.calculateRSI(closingPrices);
      const stochastic = this.calculateStochastic(
        highPrices,
        lowPrices,
        closingPrices,
      );
      const overboughtOversold = this.calculateOverboughtOversold(
        rsi,
        stochastic,
      );
      const { supportLevels, resistanceLevels } =
        this.calculateSupportResistance(normalizedHistory);
      const detectedPattern = this.detectPatterns(normalizedHistory);
      const emas = this.calculateEmaSeries(closingPrices);

      return {
        rsi,
        stochastic,
        overboughtOversold,
        supportLevels,
        resistanceLevels,
        currentPrice,
        detectedPattern,
        emas,
      };
    } catch (error) {
      console.error(
        `Error calculating technical indicators for ${symbol}:`,
        error,
      );
      // Return default values to prevent crashes
      return {
        rsi: 50,
        stochastic: { k: 50, d: 50 },
        overboughtOversold: {
          status: 'Neutral',
          rsi: 50,
          stochasticK: 50,
          stochasticD: 50,
          description: 'Error calculating indicators',
          isStrongReversal: false,
        },
        supportLevels: [],
        resistanceLevels: [],
        currentPrice: 0,
        detectedPattern: { name: null, detectedAt: null, coordinates: [] },
        emas: { ema20: [], ema50: [], ema100: [] },
      };
    }
  }

  async getCompleteAnalysis(
    symbol: string,
    options: AnalysisQueryOptions = {},
  ): Promise<StockAnalysisResponse> {
    try {
      const effectiveOptions: AnalysisQueryOptions = { ...options };
      if (!effectiveOptions.timeframe && !effectiveOptions.range) {
        effectiveOptions.timeframe = '1M';
      }

      const [profile, financials, historicalData, technicalIndicators] =
        await Promise.all([
          this.getStockProfile(symbol),
          this.getFinancialData(symbol),
          this.getHistoricalData(symbol, effectiveOptions),
          this.getTechnicalIndicators(symbol, effectiveOptions),
        ]);

      return {
        profile,
        financials,
        historicalData,
        technicalIndicators,
      };
    } catch (error) {
      console.error(`Error in getCompleteAnalysis for ${symbol}:`, error);
      // Return safe fallback values
      return {
        profile: await this.getStockProfile(symbol).catch(() => ({
          symbol,
          name: symbol,
          description: '',
          ceo: '',
          website: '',
          industry: '',
          marketCap: 0,
          sector: '',
          headquarters: '',
          currentPrice: 0,
          dividendYield: null,
        })),
        financials: [],
        historicalData: [],
        technicalIndicators: {
          rsi: 50,
          stochastic: { k: 50, d: 50 },
          overboughtOversold: {
            status: 'Neutral',
            rsi: 50,
            stochasticK: 50,
            stochasticD: 50,
            description: 'Error',
            isStrongReversal: false,
          },
          supportLevels: [],
          resistanceLevels: [],
          currentPrice: 0,
          detectedPattern: { name: null, detectedAt: null, coordinates: [] },
          emas: { ema20: [], ema50: [], ema100: [] },
        },
      };
    }
  }

  async getCompleteAnalysisWithValuation(
    symbol: string,
    options: AnalysisQueryOptions = {},
  ): Promise<StockAnalysisWithValuationResponse> {
    try {
      const effectiveOptions: AnalysisQueryOptions = { ...options };
      if (!effectiveOptions.timeframe && !effectiveOptions.range) {
        effectiveOptions.timeframe = '1M';
      }

      const [profile, financials, historicalData, technicalIndicators] =
        await Promise.all([
          this.getStockProfile(symbol),
          this.getFinancialData(symbol),
          this.getHistoricalData(symbol, effectiveOptions),
          this.getTechnicalIndicators(symbol, effectiveOptions),
        ]);

      const intrinsicValue = await this.calculateIntrinsicValue(
        symbol,
        profile,
        financials,
      );

      return {
        profile,
        financials,
        historicalData,
        technicalIndicators,
        intrinsicValue,
      };
    } catch (error) {
      console.error(
        `Error in getCompleteAnalysisWithValuation for ${symbol}:`,
        error,
      );
      // Return safe fallback with default intrinsic value
      const fallbackProfile = {
        symbol,
        name: symbol,
        description: '',
        ceo: '',
        website: '',
        industry: '',
        marketCap: 0,
        sector: '',
        headquarters: '',
        currentPrice: 0,
        dividendYield: null,
      };

      return {
        profile: fallbackProfile,
        financials: [],
        historicalData: [],
        technicalIndicators: {
          rsi: 50,
          stochastic: { k: 50, d: 50 },
          overboughtOversold: {
            status: 'Neutral',
            rsi: 50,
            stochasticK: 50,
            stochasticD: 50,
            description: 'Error',
            isStrongReversal: false,
          },
          supportLevels: [],
          resistanceLevels: [],
          currentPrice: 0,
          detectedPattern: { name: null, detectedAt: null, coordinates: [] },
          emas: { ema20: [], ema50: [], ema100: [] },
        },
        intrinsicValue: {
          symbol,
          currentPrice: 0,
          intrinsicValue: 0,
          status: 'Fair Value',
          discountPremium: 0,
          analysis: {
            peAnalysis: 'Error calculating valuation',
            epsGrowth: 'N/A',
            revenueQuality: 'N/A',
            overall: 'Unable to perform valuation analysis',
          },
          confidence: 0,
        },
      };
    }
  }

  async calculateIntrinsicValue(
    symbol: string,
    profile: StockProfile,
    financials: FinancialData[],
  ): Promise<IntrinsicValueAnalysis> {
    try {
      const currentPrice = profile.currentPrice || 0;
      const latestFinancial = financials[0] || {
        peRatio: 0,
        eps: 0,
        revenue: 0,
      };

      // Industry-specific P/E benchmarks
      const industryPEBenchmarks: Record<string, number> = {
        Technology: 25,
        Healthcare: 20,
        Financial: 15,
        'Consumer Discretionary': 18,
        Energy: 12,
        Industrial: 16,
        Utilities: 14,
        'Real Estate': 18,
        Materials: 14,
        'Communication Services': 22,
        'Consumer Staples': 17,
      };

      const industryBenchmark = industryPEBenchmarks[profile.industry] || 18;
      const currentPE = latestFinancial.peRatio || 0;
      const eps = latestFinancial.eps || 0;
      const revenue = latestFinancial.revenue || 0;

      // Intrinsic Value Calculation Method: DCF-based P/E analysis
      // Adjust P/E based on industry, growth potential, and profitability
      let adjustedPE = industryBenchmark;

      // P/E adjustments based on current valuation
      if (currentPE > 0) {
        if (currentPE < industryBenchmark * 0.7) {
          adjustedPE *= 1.2; // Potentially undervalued
        } else if (currentPE > industryBenchmark * 1.5) {
          adjustedPE *= 0.8; // Potentially overvalued
        }
      }

      // EPS quality adjustment
      if (eps > 0) {
        if (eps > 5) adjustedPE *= 1.1; // High-quality earnings
        if (eps < 1) adjustedPE *= 0.9; // Low-quality earnings
      }

      // Revenue quality adjustment
      if (revenue > 0) {
        if (revenue > 50000000000) adjustedPE *= 1.05; // Large cap stability
        if (revenue < 1000000000) adjustedPE *= 0.95; // Small cap risk
      }

      const intrinsicValue = eps * adjustedPE;
      const discountPremium =
        ((intrinsicValue - currentPrice) / currentPrice) * 100;

      let status: 'Undervalued' | 'Fair Value' | 'Overvalued';
      let confidence = 70;

      if (discountPremium > 15) {
        status = 'Undervalued';
        confidence = Math.min(90, confidence + Math.abs(discountPremium) / 2);
      } else if (discountPremium < -15) {
        status = 'Overvalued';
        confidence = Math.min(90, confidence + Math.abs(discountPremium) / 2);
      } else {
        status = 'Fair Value';
        confidence = Math.max(60, confidence - Math.abs(discountPremium));
      }

      // Generate analysis text
      const peAnalysis =
        currentPE > 0
          ? `Current P/E of ${currentPE.toFixed(1)} compared to industry benchmark of ${industryBenchmark}.`
          : 'P/E ratio not available for analysis.';

      const epsGrowth =
        eps > 0
          ? `EPS of $${eps.toFixed(2)} indicates ${eps > 3 ? 'strong' : eps > 1 ? 'moderate' : 'weak'} earnings power.`
          : 'EPS data not available for comprehensive analysis.';

      const revenueQuality =
        revenue > 0
          ? `Annual revenue of $${(revenue / 1000000000).toFixed(1)}B suggests ${revenue > 50000000000 ? 'established' : revenue > 1000000000 ? 'growing' : 'developing'} business scale.`
          : 'Revenue data not available for quality assessment.';

      const overall = `Based on ${adjustedPE.toFixed(1)} adjusted P/E multiple, the stock appears ${status.toLowerCase()} with ${discountPremium > 0 ? discountPremium.toFixed(1) + '% upside potential' : Math.abs(discountPremium).toFixed(1) + '% downside risk'}.`;

      return {
        symbol,
        currentPrice,
        intrinsicValue,
        status,
        discountPremium,
        analysis: {
          peAnalysis,
          epsGrowth,
          revenueQuality,
          overall,
        },
        confidence: Math.round(confidence),
      };
    } catch (error) {
      console.warn(`Error calculating intrinsic value for ${symbol}:`, error);
      return this.getFallbackIntrinsicValue(symbol, profile);
    }
  }

  private getFallbackIntrinsicValue(
    symbol: string,
    profile: StockProfile,
  ): IntrinsicValueAnalysis {
    const currentPrice = profile.currentPrice || 0;
    // ข้อมูลการเงินไม่พอสำหรับประเมินมูลค่า — คืนสถานะ "ไม่พร้อมใช้งาน" แบบตรงไปตรงมา
    // (ไม่ปั้นราคาเหมาะสม/ส่วนลดด้วยการสุ่ม)
    return {
      symbol,
      currentPrice,
      intrinsicValue: currentPrice,
      status: 'Fair Value',
      discountPremium: 0,
      analysis: {
        peAnalysis: 'Insufficient financial data for valuation analysis.',
        epsGrowth: 'Insufficient financial data for valuation analysis.',
        revenueQuality: 'Insufficient financial data for valuation analysis.',
        overall:
          'Intrinsic valuation is unavailable due to insufficient financial data.',
      },
      confidence: 0,
    };
  }

  async getSeasonalityAnalysis(
    symbol: string,
    period: string = '5Y',
  ): Promise<SeasonalityAnalysis> {
    try {
      // Map the requested period to a historical-data timeframe and an optional year filter.
      const isSpecificYear = /^\d{4}$/.test(period);
      const timeframe = period === '6M' ? '6M' : '5Y';
      const yearFilter = isSpecificYear ? parseInt(period, 10) : null;

      const historicalData = await this.getHistoricalData(symbol, {
        timeframe,
      });

      if (historicalData.length < 12) {
        throw new Error(
          'Insufficient historical data for seasonality analysis',
        );
      }

      // Group data by month
      const monthlyData: Record<
        number,
        Array<{
          year: number;
          changePercent: number;
          changePrice: number;
          positive: boolean;
        }>
      > = {};

      // Initialize all months (1-12)
      for (let month = 1; month <= 12; month++) {
        monthlyData[month] = [];
      }

      // Process historical data - calculate monthly changes
      for (let i = 1; i < historicalData.length; i++) {
        const current = historicalData[i];
        const previous = historicalData[i - 1];

        const currentDate = new Date(current.date);
        const previousDate = new Date(previous.date);

        // Only process if it's a month-to-month change
        if (
          currentDate.getMonth() !== previousDate.getMonth() ||
          currentDate.getFullYear() !== previousDate.getFullYear()
        ) {
          const month = currentDate.getMonth() + 1; // 1-12
          const year = currentDate.getFullYear();

          // When a specific year is requested, skip everything else.
          if (yearFilter !== null && year !== yearFilter) {
            continue;
          }

          const changePercent =
            ((current.close - previous.close) / previous.close) * 100;
          const changePrice = current.close - previous.close;
          const positive = changePercent > 0;

          monthlyData[month].push({
            year,
            changePercent,
            changePrice,
            positive,
          });
        }
      }

      // Calculate seasonality metrics for each month
      const monthNames = [
        'JAN',
        'FEB',
        'MAR',
        'APR',
        'MAY',
        'JUN',
        'JUL',
        'AUG',
        'SEP',
        'OCT',
        'NOV',
        'DEC',
      ];
      const analysis: MonthlySeasonality[] = [];

      for (let month = 1; month <= 12; month++) {
        const monthData = monthlyData[month];

        if (monthData.length > 0) {
          const positiveYears = monthData.filter((d) => d.positive).length;
          const totalYears = monthData.length;
          const winRate = (positiveYears / totalYears) * 100;

          const avgChangePercent =
            monthData.reduce((sum, d) => sum + d.changePercent, 0) / totalYears;
          const avgChangePrice =
            monthData.reduce((sum, d) => sum + d.changePrice, 0) / totalYears;

          analysis.push({
            month: monthNames[month - 1],
            monthNumber: month,
            winRate,
            averageChangePercent: avgChangePercent,
            averageChangePrice: avgChangePrice,
            positiveYears,
            totalYears,
          });
        } else {
          // Fallback for months with no data
          analysis.push({
            month: monthNames[month - 1],
            monthNumber: month,
            winRate: 50,
            averageChangePercent: 0,
            averageChangePrice: 0,
            positiveYears: 0,
            totalYears: 0,
          });
        }
      }

      // Calculate overall metrics
      const overallWinRate =
        analysis.reduce(
          (sum, month) => sum + month.winRate * month.totalYears,
          0,
        ) / analysis.reduce((sum, month) => sum + month.totalYears, 0);

      const bestMonth = analysis.reduce(
        (best, month) => (month.winRate > best.winRate ? month : best),
        analysis[0],
      );

      const worstMonth = analysis.reduce(
        (worst, month) => (month.winRate < worst.winRate ? month : worst),
        analysis[0],
      );

      const totalYearsAnalyzed = Math.max(...analysis.map((m) => m.totalYears));

      return {
        symbol,
        analysis,
        overallWinRate,
        bestMonth,
        worstMonth,
        totalYearsAnalyzed,
      };
    } catch (error) {
      // ไม่ปั้นข้อมูลฤดูกาลปลอม — โยน error ให้ปลายทางแสดงสถานะ error/ว่าง
      console.warn(`Error calculating seasonality for ${symbol}:`, error);
      throw error instanceof Error
        ? error
        : new Error(`Failed to calculate seasonality for ${symbol}`);
    }
  }

  async getEarningsCalendar(daysAhead: number = 14): Promise<EarningsCalendar> {
    try {
      // Fetch real earnings data using Yahoo Finance
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      const endDate = new Date(
        today.getTime() + daysAhead * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split('T')[0];

      // Yahoo Finance doesn't have a direct earnings calendar API, so we'll use a combination
      // of approaches to get real earnings data

      // 1. Get major stock symbols that commonly have earnings
      const majorSymbols = [
        'AAPL',
        'MSFT',
        'GOOGL',
        'AMZN',
        'NVDA',
        'META',
        'TSLA',
        'CRM',
        'ZS',
        'NFLX',
        'AMD',
        'DIS',
        'V',
        'MA',
        'JPM',
        'BAC',
        'WMT',
        'HD',
        'KO',
        'PEP',
      ];

      const events: EarningsEvent[] = [];
      const usedDates = new Set<string>();

      // 2. For each symbol, try to get their earnings information
      for (const symbol of majorSymbols) {
        try {
          // Get company profile to check if they have upcoming earnings
          const quote = await yahooFinance.quote(symbol);

          // Yahoo Finance quote doesn't directly provide earnings dates, but we can
          // use the earningsTimestamp if available
          if (quote.earningsTimestamp) {
            const earningsDate = new Date(quote.earningsTimestamp * 1000);

            // Check if the earnings date is within our range
            if (earningsDate >= today && earningsDate <= new Date(endDate)) {
              const dateString = earningsDate.toISOString().split('T')[0];

              if (!usedDates.has(dateString)) {
                usedDates.add(dateString);

                // Get additional company info
                const profile = await yahooFinance.quoteSummary(symbol, {
                  modules: ['earnings', 'defaultKeyStatistics'],
                });

                events.push({
                  id: `earning_${symbol}_${earningsDate.getTime()}`,
                  symbol: symbol,
                  companyName: quote.longName || quote.shortName || symbol,
                  date: dateString,
                  time: 'After Market Close', // Default assumption
                  estimatedEPS:
                    (((
                      profile.earnings?.earningsChart?.quarterly?.[0]
                        ?.estimate as any
                    )?.raw ??
                      profile.earnings?.earningsChart?.quarterly?.[0]
                        ?.estimate) as number) || 0,
                  previousEPS:
                    (((
                      profile.earnings?.earningsChart?.quarterly?.[1]
                        ?.actual as any
                    )?.raw ??
                      profile.earnings?.earningsChart?.quarterly?.[1]
                        ?.actual) as number) || 0,
                  quarter: this.getQuarterString(earningsDate),
                });
              }
            }
          }
        } catch (symbolError) {
          // Continue with other symbols if one fails
          console.debug(
            `Could not fetch earnings data for ${symbol}:`,
            symbolError,
          );
        }
      }

      // Sort events by date
      events.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return {
        events,
        totalEvents: events.length,
        dateRange: {
          startDate,
          endDate,
        },
      };
    } catch (error) {
      console.error('Error fetching real earnings calendar:', error);
      // Return empty calendar if real data fetching fails
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      const endDate = new Date(
        today.getTime() + daysAhead * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split('T')[0];

      return {
        events: [],
        totalEvents: 0,
        dateRange: {
          startDate,
          endDate,
        },
      };
    }
  }

  private getQuarterString(date: Date): string {
    const month = date.getMonth();
    const year = date.getFullYear();
    let quarter: string;

    if (month >= 0 && month <= 2) quarter = 'Q1';
    else if (month >= 3 && month <= 5) quarter = 'Q2';
    else if (month >= 6 && month <= 8) quarter = 'Q3';
    else quarter = 'Q4';

    return `${quarter} ${year}`;
  }

  private getRobustTimeframeDays(timeframe: string): number {
    const normalized = timeframe?.toUpperCase() || '1M';
    const robustTimeframeMap: Record<string, number> = {
      '1H': 7,
      '1D': 5,
      '1W': 14,
      '1M': 40,
      '3M': 120,
      '6M': 200,
      '1Y': 400,
      '3Y': 1100,
      '5Y': 1900,
    };
    return robustTimeframeMap[normalized] || 40;
  }

  private getIntervalForTimeframe(timeframe: string): YahooFinanceInterval {
    const normalized = timeframe?.toUpperCase() || '1M';
    const intervalMap: Record<string, YahooFinanceInterval> = {
      '1H': '1h',
      '1D': '1d',
      '1W': '1d',
      '1M': '1d',
      '3M': '1d',
      '6M': '1d',
      '1Y': '1d',
      '3Y': '1wk',
      '5Y': '1mo',
    };
    return intervalMap[normalized] || '1d';
  }

  private getDaysFromRange(range?: string): number | null {
    if (!range) return null;
    const normalized = range.toLowerCase();
    const rangeMap: Record<string, number> = {
      '5d': 5,
      '1mo': 30,
      '3mo': 90,
      '6mo': 180,
      '1y': 365,
      '3y': 365 * 3,
      '5y': 365 * 5,
    };
    if (rangeMap[normalized] != null) {
      return rangeMap[normalized];
    }

    const match = normalized.match(/^(\d+)(d|mo|y)$/);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value)) return null;
    switch (unit) {
      case 'd':
        return value;
      case 'mo':
        return value * 30;
      case 'y':
        return value * 365;
      default:
        return null;
    }
  }

  private getFallbackStockProfile(symbol: string): StockProfile {
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      description: 'Company information temporarily unavailable',
      ceo: 'N/A',
      website: 'N/A',
      industry: 'N/A',
      marketCap: 0,
      sector: 'N/A',
      headquarters: 'N/A',
      currentPrice: 0,
      dividendYield: null,
    };
  }

  private getFallbackFinancialData(symbol: string): FinancialData[] {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentYear = new Date().getFullYear();

    return quarters.map((quarter, index) => ({
      symbol,
      revenue: 0,
      netIncome: 0,
      eps: 0,
      peRatio: 0,
      quarter,
      year: currentYear - (3 - index),
    }));
  }

  private calculateRSI(closingPrices: number[]): number {
    if (closingPrices.length < 14) return 50;

    const period = 14;
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = closingPrices[i] - closingPrices[i - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closingPrices.length; i++) {
      const change = closingPrices[i] - closingPrices[i - 1];
      if (change >= 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
      } else {
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return Number(rsi.toFixed(2));
  }

  /**
   * Stochastic Oscillator with settings (%K length 25, %K smoothing 3, %D 3).
   * - Raw %K = (close - lowestLow_25) / (highestHigh_25 - lowestLow_25) * 100
   * - Slowed %K = SMA(raw %K, 3)
   * - %D = SMA(slowed %K, 3)
   * Returns the most recent slowed %K and %D values.
   */
  private calculateStochastic(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = 25,
    kSmoothing: number = 3,
    dPeriod: number = 3,
  ): StochasticResult {
    const length = closes.length;

    // Not enough data to compute the oscillator -> neutral midpoint.
    if (length < kPeriod) {
      return { k: 50, d: 50 };
    }

    // 1. Raw %K series.
    const rawK: number[] = [];
    for (let i = kPeriod - 1; i < length; i++) {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        if (highs[j] > highestHigh) highestHigh = highs[j];
        if (lows[j] < lowestLow) lowestLow = lows[j];
      }
      const range = highestHigh - lowestLow;
      const close = closes[i];
      rawK.push(range === 0 ? 100 : ((close - lowestLow) / range) * 100);
    }

    // 2. Slowed %K = SMA(rawK, kSmoothing).
    const slowedK = this.simpleMovingAverage(rawK, kSmoothing);
    // 3. %D = SMA(slowedK, dPeriod).
    const dLine = this.simpleMovingAverage(slowedK, dPeriod);

    const k = slowedK.length > 0 ? slowedK[slowedK.length - 1] : 50;
    const d = dLine.length > 0 ? dLine[dLine.length - 1] : k;

    return {
      k: Number(k.toFixed(2)),
      d: Number(d.toFixed(2)),
    };
  }

  private simpleMovingAverage(values: number[], period: number): number[] {
    if (period <= 1) return [...values];
    const result: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += values[j];
      }
      result.push(sum / period);
    }
    return result;
  }

  /**
   * Confluence of RSI and Stochastic %K to flag overbought / oversold reversals.
   * - Strong Buy  : RSI < 30 AND Stochastic %K < 20 (high-probability bullish reversal)
   * - Buy Signal  : only one of them in the oversold zone
   * - Strong Sell : RSI > 70 AND Stochastic %K > 80 (high-probability bearish reversal)
   * - Sell Signal : only one of them in the overbought zone
   * - Neutral     : neither condition met
   */
  private calculateOverboughtOversold(
    rsi: number,
    stochastic: StochasticResult,
  ): OverboughtOversoldSignal {
    const stochasticK = stochastic.k;

    const rsiOversold = rsi < 30;
    const stochOversold = stochasticK < 20;
    const rsiOverbought = rsi > 70;
    const stochOverbought = stochasticK > 80;

    let status: OverboughtOversoldStatus = 'Neutral';
    let isStrongReversal = false;
    let description = 'No overbought/oversold confluence detected.';

    if (rsiOversold && stochOversold) {
      status = 'Strong Buy';
      isStrongReversal = true;
      description =
        'RSI and Stochastic both oversold — strong bullish reversal expected.';
    } else if (rsiOverbought && stochOverbought) {
      status = 'Strong Sell';
      isStrongReversal = true;
      description =
        'RSI and Stochastic both overbought — strong bearish reversal expected.';
    } else if (rsiOversold || stochOversold) {
      status = 'Buy Signal';
      description = rsiOversold
        ? 'RSI in oversold zone — potential bullish reversal.'
        : 'Stochastic in oversold zone — potential bullish reversal.';
    } else if (rsiOverbought || stochOverbought) {
      status = 'Sell Signal';
      description = rsiOverbought
        ? 'RSI in overbought zone — potential bearish reversal.'
        : 'Stochastic in overbought zone — potential bearish reversal.';
    }

    return {
      status,
      rsi,
      stochasticK,
      stochasticD: stochastic.d,
      isStrongReversal,
      description,
    };
  }

  private calculateSupportResistance(historicalData: HistoricalDataPoint[]): {
    supportLevels: number[];
    resistanceLevels: number[];
  } {
    if (historicalData.length < 20) {
      return { supportLevels: [], resistanceLevels: [] };
    }

    const highs = historicalData.map((point) => point.high);
    const lows = historicalData.map((point) => point.low);

    const resistanceLevels: number[] = [];
    for (let i = 2; i < highs.length - 2; i++) {
      if (
        highs[i] > highs[i - 1] &&
        highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] &&
        highs[i] > highs[i + 2]
      ) {
        resistanceLevels.push(highs[i]);
      }
    }

    const supportLevels: number[] = [];
    for (let i = 2; i < lows.length - 2; i++) {
      if (
        lows[i] < lows[i - 1] &&
        lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] &&
        lows[i] < lows[i + 2]
      ) {
        supportLevels.push(lows[i]);
      }
    }

    const sortedResistance = [...new Set(resistanceLevels)].sort(
      (a, b) => b - a,
    );
    const sortedSupport = [...new Set(supportLevels)].sort((a, b) => a - b);

    return {
      resistanceLevels: sortedResistance.slice(0, 2),
      supportLevels: sortedSupport.slice(0, 2),
    };
  }

  private normalizeDate(date: Date | string): string {
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return String(date);
    }
    return parsed.toISOString();
  }

  /**
   * Identifies local minima (troughs) and maxima (peaks) using a sliding window.
   */
  findPivotPoints(
    data: HistoricalDataPoint[],
    windowSize: number = 3,
  ): { peaks: PivotPoint[]; troughs: PivotPoint[] } {
    const peaks: PivotPoint[] = [];
    const troughs: PivotPoint[] = [];

    if (!data || data.length < windowSize * 2 + 1) {
      return { peaks, troughs };
    }

    const win = Math.max(1, Math.floor(windowSize));

    for (let i = win; i < data.length - win; i++) {
      const point = data[i];
      if (
        !point ||
        !Number.isFinite(point.high) ||
        !Number.isFinite(point.low)
      ) {
        continue;
      }

      let isPeak = true;
      let isTrough = true;

      for (let j = i - win; j <= i + win; j++) {
        if (j === i) continue;
        const neighbor = data[j];
        if (!neighbor) continue;
        if (neighbor.high >= point.high) isPeak = false;
        if (neighbor.low <= point.low) isTrough = false;
      }

      const date = this.normalizeDate(point.date);

      if (isPeak) {
        peaks.push({ index: i, date, price: point.high, type: 'peak' });
      }
      if (isTrough) {
        troughs.push({ index: i, date, price: point.low, type: 'trough' });
      }
    }

    return { peaks, troughs };
  }

  private pricesWithinTolerance(
    priceA: number,
    priceB: number,
    tolerancePercent: number = 2,
  ): boolean {
    if (
      !Number.isFinite(priceA) ||
      !Number.isFinite(priceB) ||
      priceA <= 0 ||
      priceB <= 0
    ) {
      return false;
    }
    const avg = (priceA + priceB) / 2;
    const diffPercent = (Math.abs(priceA - priceB) / avg) * 100;
    return diffPercent <= tolerancePercent;
  }

  /**
   * Scans pivot structure for Double Bottom (W) and Double Top (M) patterns.
   */
  detectPatterns(historicalData: HistoricalDataPoint[]): DetectedPattern {
    const empty: DetectedPattern = {
      name: null,
      detectedAt: null,
      coordinates: [],
    };

    if (!historicalData || historicalData.length < 20) {
      return empty;
    }

    const windowSize = Math.min(3, Math.floor(historicalData.length / 20));
    const { peaks, troughs } = this.findPivotPoints(historicalData, windowSize);

    const doubleBottom = this.findDoubleBottom(historicalData, peaks, troughs);
    if (doubleBottom) return doubleBottom;

    const doubleTop = this.findDoubleTop(historicalData, peaks, troughs);
    if (doubleTop) return doubleTop;

    return empty;
  }

  private findDoubleBottom(
    data: HistoricalDataPoint[],
    peaks: PivotPoint[],
    troughs: PivotPoint[],
  ): DetectedPattern | null {
    if (troughs.length < 2) return null;

    const recentTroughs = troughs.slice(-6);
    let best: DetectedPattern | null = null;
    let bestScore = -1;

    for (let i = 0; i < recentTroughs.length - 1; i++) {
      for (let j = i + 1; j < recentTroughs.length; j++) {
        const t1 = recentTroughs[i];
        const t2 = recentTroughs[j];

        if (t2.index - t1.index < 3) continue;
        if (!this.pricesWithinTolerance(t1.price, t2.price, 2)) continue;

        const middlePeaks = peaks.filter(
          (p) => p.index > t1.index && p.index < t2.index,
        );
        if (middlePeaks.length === 0) continue;

        const neckline = middlePeaks.reduce((bestPeak, p) =>
          p.price > bestPeak.price ? p : bestPeak,
        );

        const priorPeaks = peaks.filter((p) => p.index < t1.index);
        const startPeak =
          priorPeaks.length > 0
            ? priorPeaks[priorPeaks.length - 1]
            : this.inferStartPeak(data, t1.index);

        const lastPoint = data[data.length - 1];
        const endPrice = lastPoint?.close ?? t2.price;
        const endDate = lastPoint
          ? this.normalizeDate(lastPoint.date)
          : t2.date;

        const coordinates: PatternCoordinate[] = [
          { date: startPeak.date, price: startPeak.price },
          { date: t1.date, price: t1.price },
          { date: neckline.date, price: neckline.price },
          { date: t2.date, price: t2.price },
          { date: endDate, price: endPrice },
        ];

        const score = t2.index;
        if (score > bestScore) {
          bestScore = score;
          best = {
            name: 'Double Bottom',
            detectedAt: t2.date,
            coordinates,
          };
        }
      }
    }

    return best;
  }

  private findDoubleTop(
    data: HistoricalDataPoint[],
    peaks: PivotPoint[],
    troughs: PivotPoint[],
  ): DetectedPattern | null {
    if (peaks.length < 2) return null;

    const recentPeaks = peaks.slice(-6);
    let best: DetectedPattern | null = null;
    let bestScore = -1;

    for (let i = 0; i < recentPeaks.length - 1; i++) {
      for (let j = i + 1; j < recentPeaks.length; j++) {
        const p1 = recentPeaks[i];
        const p2 = recentPeaks[j];

        if (p2.index - p1.index < 3) continue;
        if (!this.pricesWithinTolerance(p1.price, p2.price, 2)) continue;

        const middleTroughs = troughs.filter(
          (t) => t.index > p1.index && t.index < p2.index,
        );
        if (middleTroughs.length === 0) continue;

        const valley = middleTroughs.reduce((bestTrough, t) =>
          t.price < bestTrough.price ? t : bestTrough,
        );

        const priorTroughs = troughs.filter((t) => t.index < p1.index);
        const startTrough =
          priorTroughs.length > 0
            ? priorTroughs[priorTroughs.length - 1]
            : this.inferStartTrough(data, p1.index);

        const lastPoint = data[data.length - 1];
        const endPrice = lastPoint?.close ?? p2.price;
        const endDate = lastPoint
          ? this.normalizeDate(lastPoint.date)
          : p2.date;

        const coordinates: PatternCoordinate[] = [
          { date: startTrough.date, price: startTrough.price },
          { date: p1.date, price: p1.price },
          { date: valley.date, price: valley.price },
          { date: p2.date, price: p2.price },
          { date: endDate, price: endPrice },
        ];

        const score = p2.index;
        if (score > bestScore) {
          bestScore = score;
          best = {
            name: 'Double Top',
            detectedAt: p2.date,
            coordinates,
          };
        }
      }
    }

    return best;
  }

  private inferStartPeak(
    data: HistoricalDataPoint[],
    beforeIndex: number,
  ): PivotPoint {
    const lookback = Math.max(0, beforeIndex - 5);
    let maxIdx = lookback;
    for (let i = lookback; i < beforeIndex; i++) {
      if ((data[i]?.high ?? 0) > (data[maxIdx]?.high ?? 0)) maxIdx = i;
    }
    const point = data[maxIdx] ?? data[beforeIndex];
    return {
      index: maxIdx,
      date: this.normalizeDate(point.date),
      price: point.high,
      type: 'peak',
    };
  }

  private inferStartTrough(
    data: HistoricalDataPoint[],
    beforeIndex: number,
  ): PivotPoint {
    const lookback = Math.max(0, beforeIndex - 5);
    let minIdx = lookback;
    for (let i = lookback; i < beforeIndex; i++) {
      if ((data[i]?.low ?? Infinity) < (data[minIdx]?.low ?? Infinity))
        minIdx = i;
    }
    const point = data[minIdx] ?? data[beforeIndex];
    return {
      index: minIdx,
      date: this.normalizeDate(point.date),
      price: point.low,
      type: 'trough',
    };
  }

  private calculateEMA(prices: number[], period: number): (number | null)[] {
    const result: (number | null)[] = new Array(prices.length).fill(null);

    if (!prices.length || period < 1 || prices.length < period) {
      return result;
    }

    const multiplier = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i] ?? 0;
    }
    let ema = sum / period;
    result[period - 1] = Number(ema.toFixed(4));

    for (let i = period; i < prices.length; i++) {
      const price = prices[i] ?? 0;
      ema = (price - ema) * multiplier + ema;
      result[i] = Number(ema.toFixed(4));
    }

    return result;
  }

  private calculateEmaSeries(closingPrices: number[]): EmaSeries {
    return {
      ema20: this.calculateEMA(closingPrices, 20),
      ema50: this.calculateEMA(closingPrices, 50),
      ema100: this.calculateEMA(closingPrices, 100),
    };
  }
}

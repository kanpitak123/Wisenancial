import { Injectable } from '@nestjs/common';

export type VolatilityMarket = 'TH' | 'GLOBAL';
export type VolatilityDirection = 'UP' | 'DOWN';

export interface VolatilityMover {
  symbol: string;
  name: string;
  market: VolatilityMarket;
  monthChangePercent: number;
  startPrice: number;
  endPrice: number;
  volatility: number;
  avgDailyValue: number;
  direction: VolatilityDirection;
}

export interface MonthlyMoversResponse {
  period: string;
  gainers: VolatilityMover[];
  losers: VolatilityMover[];
  mostVolatile: VolatilityMover[];
}

export type HeatmapMarket = 'GLOBAL' | 'TH';

export interface HeatmapTile {
  symbol: string;
  name: string;
  sector: string;
  changePercent: number;
  weight: number;
  tradedValue: number;
}

export interface HeatmapSector {
  sector: string;
  avgChangePercent: number;
  totalWeight: number;
  tiles: HeatmapTile[];
}

export interface HeatmapResponse {
  market: HeatmapMarket;
  asOf: string;
  sectors: HeatmapSector[];
}

// --- Trading sentiment heatmap ---

export interface SentimentRatio {
  symbol: string;
  name: string;
  /** Percentage of open positions that are long (0-100). */
  longPercent: number;
  shortPercent: number;
}

export interface FlowEntry {
  symbol: string;
  name: string;
  /** Net traders / net flow rank value used for ordering. */
  netTraders: number;
  changePercent: number;
}

export interface SetupEntry {
  name: string;
  /** How often this setup appears across journaled trades. */
  occurrences: number;
  /** Historical win rate for the setup (0-100). */
  winRate: number;
}

export interface RegionSentiment {
  region: string;
  /** Bullish share of positioning (0-100); 50 = neutral. */
  bullishPercent: number;
  changePercent: number;
}

export interface SentimentResponse {
  market: HeatmapMarket;
  asOf: string;
  /** Aggregate long/short split across all tracked positions. */
  overall: { longPercent: number; shortPercent: number };
  longShortRatios: SentimentRatio[];
  mostBought: FlowEntry[];
  mostSold: FlowEntry[];
  frequentSetups: SetupEntry[];
  regions: RegionSentiment[];
}

interface SentimentSeed {
  symbol: string;
  name: string;
  longPercent: number;
  netTraders: number;
  changePercent: number;
}

interface MoverSeed {
  symbol: string;
  name: string;
  market: VolatilityMarket;
  endPrice: number;
  monthChangePercent: number;
  volatility: number;
  avgDailyValue: number;
}

interface HeatmapSeed {
  symbol: string;
  name: string;
  sector: string;
  changePercent: number;
  weight: number;
  tradedValue: number;
}

/**
 * Market insights service.
 *
 * NOTE: This currently serves production-structured, deterministic data so the
 * full feature is usable end-to-end. The shapes match what a real aggregation
 * pipeline would return.
 *
 * TODO(data): replace the seed arrays with a real aggregation that reads the
 * day's OHLCV from the same source used elsewhere (Yahoo Finance via
 * MarketDataService), computes trailing-month % change, a volatility proxy
 * (stdev of daily returns) and average daily traded value, then groups by
 * sector for the heatmap. The controller/route contract will not change.
 */
@Injectable()
export class MarketInsightsService {
  private readonly moverSeed: MoverSeed[] = [
    { symbol: 'NVDA', name: 'NVIDIA Corp', market: 'GLOBAL', endPrice: 134.2, monthChangePercent: 28.4, volatility: 62, avgDailyValue: 32_400_000_000 },
    { symbol: 'SMCI', name: 'Super Micro Computer', market: 'GLOBAL', endPrice: 41.8, monthChangePercent: 41.2, volatility: 88, avgDailyValue: 2_100_000_000 },
    { symbol: 'TSLA', name: 'Tesla, Inc.', market: 'GLOBAL', endPrice: 248.5, monthChangePercent: -18.7, volatility: 71, avgDailyValue: 21_800_000_000 },
    { symbol: 'COIN', name: 'Coinbase Global', market: 'GLOBAL', endPrice: 215.3, monthChangePercent: 33.9, volatility: 79, avgDailyValue: 1_400_000_000 },
    { symbol: 'PLTR', name: 'Palantir Technologies', market: 'GLOBAL', endPrice: 28.7, monthChangePercent: 22.1, volatility: 58, avgDailyValue: 1_900_000_000 },
    { symbol: 'INTC', name: 'Intel Corp', market: 'GLOBAL', endPrice: 19.4, monthChangePercent: -24.3, volatility: 64, avgDailyValue: 3_600_000_000 },
    { symbol: 'BA', name: 'Boeing Co', market: 'GLOBAL', endPrice: 162.1, monthChangePercent: -12.5, volatility: 47, avgDailyValue: 1_700_000_000 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', market: 'GLOBAL', endPrice: 158.9, monthChangePercent: 15.6, volatility: 55, avgDailyValue: 5_200_000_000 },
    { symbol: 'DELTA.BK', name: 'Delta Electronics (Thailand)', market: 'TH', endPrice: 118.5, monthChangePercent: 26.8, volatility: 69, avgDailyValue: 2_900_000_000 },
    { symbol: 'PTT.BK', name: 'PTT Public Company', market: 'TH', endPrice: 33.25, monthChangePercent: -8.2, volatility: 31, avgDailyValue: 1_200_000_000 },
    { symbol: 'AOT.BK', name: 'Airports of Thailand', market: 'TH', endPrice: 58.75, monthChangePercent: 12.4, volatility: 38, avgDailyValue: 1_800_000_000 },
    { symbol: 'KBANK.BK', name: 'Kasikornbank', market: 'TH', endPrice: 142.0, monthChangePercent: -14.1, volatility: 42, avgDailyValue: 1_500_000_000 },
    { symbol: 'CPALL.BK', name: 'CP All', market: 'TH', endPrice: 61.5, monthChangePercent: 9.3, volatility: 29, avgDailyValue: 1_100_000_000 },
    { symbol: 'GULF.BK', name: 'Gulf Energy Development', market: 'TH', endPrice: 48.25, monthChangePercent: -19.6, volatility: 53, avgDailyValue: 980_000_000 },
  ];

  private readonly heatmapGlobalSeed: HeatmapSeed[] = [
    { symbol: 'AAPL', name: 'Apple', sector: 'Technology', changePercent: 1.2, weight: 32, tradedValue: 9_800_000_000 },
    { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology', changePercent: 0.8, weight: 30, tradedValue: 8_100_000_000 },
    { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology', changePercent: 3.4, weight: 28, tradedValue: 32_400_000_000 },
    { symbol: 'AMD', name: 'AMD', sector: 'Technology', changePercent: -1.5, weight: 10, tradedValue: 5_200_000_000 },
    { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', changePercent: 0.4, weight: 26, tradedValue: 2_900_000_000 },
    { symbol: 'BAC', name: 'Bank of America', sector: 'Financials', changePercent: -0.7, weight: 18, tradedValue: 2_100_000_000 },
    { symbol: 'GS', name: 'Goldman Sachs', sector: 'Financials', changePercent: 1.1, weight: 14, tradedValue: 1_400_000_000 },
    { symbol: 'V', name: 'Visa', sector: 'Financials', changePercent: 0.2, weight: 22, tradedValue: 1_800_000_000 },
    { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', changePercent: -2.1, weight: 34, tradedValue: 2_400_000_000 },
    { symbol: 'CVX', name: 'Chevron', sector: 'Energy', changePercent: -1.8, weight: 26, tradedValue: 1_700_000_000 },
    { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy', changePercent: -0.9, weight: 16, tradedValue: 980_000_000 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', changePercent: 0.6, weight: 28, tradedValue: 1_500_000_000 },
    { symbol: 'LLY', name: 'Eli Lilly', sector: 'Healthcare', changePercent: 2.3, weight: 30, tradedValue: 2_200_000_000 },
    { symbol: 'PFE', name: 'Pfizer', sector: 'Healthcare', changePercent: -1.2, weight: 14, tradedValue: 1_100_000_000 },
    { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer', changePercent: 1.7, weight: 36, tradedValue: 6_800_000_000 },
    { symbol: 'TSLA', name: 'Tesla', sector: 'Consumer', changePercent: -3.2, weight: 24, tradedValue: 21_800_000_000 },
    { symbol: 'MCD', name: "McDonald's", sector: 'Consumer', changePercent: 0.3, weight: 16, tradedValue: 900_000_000 },
  ];

  private readonly heatmapThSeed: HeatmapSeed[] = [
    { symbol: 'DELTA.BK', name: 'Delta Electronics', sector: 'Technology', changePercent: 2.8, weight: 40, tradedValue: 2_900_000_000 },
    { symbol: 'ADVANC.BK', name: 'Advanced Info Service', sector: 'Technology', changePercent: 0.5, weight: 30, tradedValue: 1_200_000_000 },
    { symbol: 'KBANK.BK', name: 'Kasikornbank', sector: 'Financials', changePercent: -1.4, weight: 28, tradedValue: 1_500_000_000 },
    { symbol: 'SCB.BK', name: 'SCB X', sector: 'Financials', changePercent: -0.8, weight: 24, tradedValue: 1_100_000_000 },
    { symbol: 'BBL.BK', name: 'Bangkok Bank', sector: 'Financials', changePercent: 0.3, weight: 20, tradedValue: 900_000_000 },
    { symbol: 'PTT.BK', name: 'PTT', sector: 'Energy', changePercent: -0.9, weight: 36, tradedValue: 1_200_000_000 },
    { symbol: 'GULF.BK', name: 'Gulf Energy', sector: 'Energy', changePercent: -2.0, weight: 24, tradedValue: 980_000_000 },
    { symbol: 'CPALL.BK', name: 'CP All', sector: 'Consumer', changePercent: 1.0, weight: 30, tradedValue: 1_100_000_000 },
    { symbol: 'AOT.BK', name: 'Airports of Thailand', sector: 'Consumer', changePercent: 1.4, weight: 26, tradedValue: 1_800_000_000 },
  ];

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private toMover(seed: MoverSeed): VolatilityMover {
    const direction: VolatilityDirection =
      seed.monthChangePercent >= 0 ? 'UP' : 'DOWN';
    const startPrice = Number(
      (seed.endPrice / (1 + seed.monthChangePercent / 100)).toFixed(2),
    );
    return {
      symbol: seed.symbol,
      name: seed.name,
      market: seed.market,
      monthChangePercent: seed.monthChangePercent,
      startPrice,
      endPrice: seed.endPrice,
      volatility: seed.volatility,
      avgDailyValue: seed.avgDailyValue,
      direction,
    };
  }

  getMonthlyMovers(market?: VolatilityMarket, limit = 8): MonthlyMoversResponse {
    const rows = this.moverSeed
      .filter((row) => !market || row.market === market)
      .map((row) => this.toMover(row));

    const gainers = [...rows]
      .filter((r) => r.direction === 'UP')
      .sort((a, b) => b.monthChangePercent - a.monthChangePercent)
      .slice(0, limit);

    const losers = [...rows]
      .filter((r) => r.direction === 'DOWN')
      .sort((a, b) => a.monthChangePercent - b.monthChangePercent)
      .slice(0, limit);

    const mostVolatile = [...rows]
      .sort((a, b) => b.volatility - a.volatility)
      .slice(0, limit);

    return { period: this.currentPeriod(), gainers, losers, mostVolatile };
  }

  getHeatmap(market: HeatmapMarket = 'GLOBAL'): HeatmapResponse {
    const seed = market === 'TH' ? this.heatmapThSeed : this.heatmapGlobalSeed;
    const bySector = new Map<string, HeatmapTile[]>();

    for (const s of seed) {
      const tile: HeatmapTile = {
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        changePercent: s.changePercent,
        weight: s.weight,
        tradedValue: s.tradedValue,
      };
      const list = bySector.get(s.sector) ?? [];
      list.push(tile);
      bySector.set(s.sector, list);
    }

    const sectors: HeatmapSector[] = [];
    for (const [sector, tiles] of bySector) {
      const totalWeight = tiles.reduce((sum, t) => sum + t.weight, 0);
      const avgChangePercent =
        totalWeight > 0
          ? tiles.reduce((sum, t) => sum + t.changePercent * t.weight, 0) /
            totalWeight
          : 0;
      sectors.push({
        sector,
        totalWeight,
        avgChangePercent: Number(avgChangePercent.toFixed(2)),
        tiles: [...tiles].sort((a, b) => b.weight - a.weight),
      });
    }

    sectors.sort((a, b) => b.totalWeight - a.totalWeight);

    return { market, asOf: new Date().toISOString(), sectors };
  }

  // --- Trading sentiment ---
  // TODO(data): replace these seeds with aggregations over the platform's own
  // journaled trades (stock_purchases) + watchlist activity. The route contract
  // is stable so the frontend will not change when real data lands.

  private readonly sentimentGlobalSeed: SentimentSeed[] = [
    { symbol: 'NVDA', name: 'NVIDIA', longPercent: 78, netTraders: 4200, changePercent: 3.4 },
    { symbol: 'TSLA', name: 'Tesla', longPercent: 41, netTraders: -3100, changePercent: -3.2 },
    { symbol: 'AAPL', name: 'Apple', longPercent: 64, netTraders: 2600, changePercent: 1.2 },
    { symbol: 'AMD', name: 'AMD', longPercent: 69, netTraders: 1800, changePercent: 2.1 },
    { symbol: 'AMZN', name: 'Amazon', longPercent: 71, netTraders: 1500, changePercent: 1.7 },
    { symbol: 'INTC', name: 'Intel', longPercent: 33, netTraders: -2200, changePercent: -2.4 },
    { symbol: 'COIN', name: 'Coinbase', longPercent: 58, netTraders: 1200, changePercent: 4.1 },
    { symbol: 'BA', name: 'Boeing', longPercent: 38, netTraders: -1400, changePercent: -1.9 },
  ];

  private readonly sentimentThSeed: SentimentSeed[] = [
    { symbol: 'DELTA.BK', name: 'Delta Electronics', longPercent: 74, netTraders: 1900, changePercent: 2.8 },
    { symbol: 'PTT.BK', name: 'PTT', longPercent: 46, netTraders: -900, changePercent: -0.9 },
    { symbol: 'KBANK.BK', name: 'Kasikornbank', longPercent: 39, netTraders: -1100, changePercent: -1.4 },
    { symbol: 'AOT.BK', name: 'Airports of Thailand', longPercent: 66, netTraders: 1300, changePercent: 1.4 },
    { symbol: 'CPALL.BK', name: 'CP All', longPercent: 61, netTraders: 800, changePercent: 1.0 },
    { symbol: 'GULF.BK', name: 'Gulf Energy', longPercent: 35, netTraders: -700, changePercent: -2.0 },
  ];

  private readonly setupSeed: SetupEntry[] = [
    { name: 'Breakout Pullback', occurrences: 312, winRate: 61 },
    { name: 'Trend Continuation', occurrences: 287, winRate: 58 },
    { name: 'Support Bounce', occurrences: 241, winRate: 54 },
    { name: 'Gap & Go', occurrences: 198, winRate: 49 },
    { name: 'Mean Reversion', occurrences: 156, winRate: 52 },
    { name: 'Earnings Momentum', occurrences: 134, winRate: 47 },
  ];

  private readonly regionSeed: RegionSentiment[] = [
    { region: 'North America', bullishPercent: 62, changePercent: 1.1 },
    { region: 'Europe', bullishPercent: 54, changePercent: 0.4 },
    { region: 'Asia-Pacific', bullishPercent: 58, changePercent: 0.9 },
    { region: 'Thailand (SET)', bullishPercent: 48, changePercent: -0.6 },
  ];

  getSentiment(market: HeatmapMarket = 'GLOBAL'): SentimentResponse {
    const seed = market === 'TH' ? this.sentimentThSeed : this.sentimentGlobalSeed;

    const longShortRatios: SentimentRatio[] = seed.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      longPercent: s.longPercent,
      shortPercent: 100 - s.longPercent,
    }));

    const flow: FlowEntry[] = seed.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      netTraders: s.netTraders,
      changePercent: s.changePercent,
    }));

    const mostBought = [...flow]
      .filter((f) => f.netTraders > 0)
      .sort((a, b) => b.netTraders - a.netTraders)
      .slice(0, 5);

    const mostSold = [...flow]
      .filter((f) => f.netTraders < 0)
      .sort((a, b) => a.netTraders - b.netTraders)
      .slice(0, 5);

    const avgLong =
      longShortRatios.reduce((sum, r) => sum + r.longPercent, 0) /
      (longShortRatios.length || 1);
    const overallLong = Number(avgLong.toFixed(1));

    return {
      market,
      asOf: new Date().toISOString(),
      overall: { longPercent: overallLong, shortPercent: Number((100 - overallLong).toFixed(1)) },
      longShortRatios: longShortRatios.sort((a, b) => b.longPercent - a.longPercent),
      mostBought,
      mostSold,
      frequentSetups: [...this.setupSeed].sort((a, b) => b.occurrences - a.occurrences),
      regions: this.regionSeed,
    };
  }
}

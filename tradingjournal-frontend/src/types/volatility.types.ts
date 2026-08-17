export type VolatilityMarket = 'TH' | 'GLOBAL';

export type VolatilityDirection = 'UP' | 'DOWN';

/** A single monthly mover row (biggest % movers over the trailing month). */
export interface VolatilityMover {
  symbol: string;
  name: string;
  market: VolatilityMarket;
  monthChangePercent: number;
  startPrice: number;
  endPrice: number;
  /** Annualized-ish volatility proxy in %, 0-100+. */
  volatility: number;
  /** Average daily traded value in the asset's currency (proxy for liquidity). */
  avgDailyValue: number;
  direction: VolatilityDirection;
}

export interface MonthlyMoversResponse {
  /** YYYY-MM the data covers. */
  period: string;
  gainers: VolatilityMover[];
  losers: VolatilityMover[];
  /** Highest absolute volatility regardless of direction. */
  mostVolatile: VolatilityMover[];
}

export interface MonthlyMoversParams {
  market?: VolatilityMarket;
  /** YYYY-MM; defaults to current month. */
  period?: string;
  limit?: number;
}

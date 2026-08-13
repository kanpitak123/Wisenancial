import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import {
  MARKET_API_PATH,
  MARKET_DATA_API_PATH,
  MARKET_PRICES_API_PATH,
} from '../constants/market.constants';
import type {
  ApiErrorResponse,
  EarningsCalendar,
  HistoricalPricePoint,
  MarketCacheStats,
  MarketHistoryQuery,
  MarketPriceQuery,
  MarketPriceRow,
  SyncPortfolioResponse,
  SyncSymbolResponse,
  TechnicalAnalysis,
} from '../types/market.types';

export function getMarketErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.response?.data?.error ?? axiosError.message ?? fallback;
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function normalizeSymbols(values: string[]) {
  return [...new Set(values.map(normalizeSymbol).filter(Boolean))];
}

export const marketService = {
  async getQuotes(symbols: string[]): Promise<Record<string, number | null>> {
    const normalized = normalizeSymbols(symbols);

    if (normalized.length === 0) {
      return {};
    }

    const response = await api.get<Record<string, number | null>>(`${MARKET_API_PATH}/prices`, {
      params: {
        symbols: normalized.join(','),
      },
    });

    return response.data;
  },

  async getHistory(query: MarketHistoryQuery): Promise<HistoricalPricePoint[]> {
    const response = await api.get<HistoricalPricePoint[]>(
      `${MARKET_API_PATH}/history/${encodeURIComponent(normalizeSymbol(query.symbol))}`,
      {
        params: {
          from: query.from,
          to: query.to,
          interval: query.interval ?? '1d',
        },
      },
    );

    return response.data;
  },

  async getTechnicalAnalysis(symbol: string): Promise<TechnicalAnalysis> {
    const response = await api.get<TechnicalAnalysis>(
      `${MARKET_API_PATH}/analysis/${encodeURIComponent(normalizeSymbol(symbol))}`,
    );

    return response.data;
  },

  async getEarningsCalendar(daysAhead: number): Promise<EarningsCalendar> {
    const response = await api.get<EarningsCalendar>(`${MARKET_API_PATH}/earnings-calendar`, {
      params: {
        daysAhead,
      },
    });

    return response.data;
  },

  async getCacheStats(): Promise<MarketCacheStats> {
    const response = await api.get<MarketCacheStats>(`${MARKET_API_PATH}/cache`);

    return response.data;
  },

  async getStoredPrices(query: MarketPriceQuery = {}): Promise<MarketPriceRow[]> {
    const normalizedSymbols = query.symbols?.length ? normalizeSymbols(query.symbols) : undefined;

    const response = await api.get<MarketPriceRow[]>(MARKET_PRICES_API_PATH, {
      params: {
        ...(normalizedSymbols?.length
          ? {
              symbols: normalizedSymbols.join(','),
            }
          : {}),
        ...(query.currency
          ? {
              currency: query.currency.trim().toUpperCase(),
            }
          : {}),
      },
    });

    return response.data;
  },

  async syncSymbol(symbol: string, currency = 'USD'): Promise<SyncSymbolResponse> {
    const response = await api.post<SyncSymbolResponse>(
      `${MARKET_DATA_API_PATH}/sync/symbol/${encodeURIComponent(normalizeSymbol(symbol))}`,
      {},
      {
        params: {
          currency: currency.trim().toUpperCase(),
        },
      },
    );

    return response.data;
  },

  async syncPortfolio(portfolioId: number): Promise<SyncPortfolioResponse> {
    const response = await api.post<SyncPortfolioResponse>(
      `${MARKET_DATA_API_PATH}/sync/portfolio/${portfolioId}`,
    );

    return response.data;
  },
};

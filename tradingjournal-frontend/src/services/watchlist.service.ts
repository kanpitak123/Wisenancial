import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { WATCHLIST_API_PATH } from '../constants/watchlist.constants';
import type {
  AddWatchlistPayload,
  ApiErrorResponse,
  UserWatchlistQuery,
  WatchlistItem,
} from '../types/watchlist.types';

export function getWatchlistErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.message ?? fallback;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export const watchlistService = {
  async getUserWatchlist(query: UserWatchlistQuery = {}): Promise<WatchlistItem[]> {
    const response = await api.get<WatchlistItem[]>(WATCHLIST_API_PATH, {
      params: {
        scope: query.scope ?? 'ALL',
        currency: query.currency ?? 'USD',
      },
    });

    return response.data;
  },

  async getForPortfolio(portfolioId: number): Promise<WatchlistItem[]> {
    const response = await api.get<WatchlistItem[]>(
      `${WATCHLIST_API_PATH}/portfolio/${portfolioId}`,
    );

    return response.data;
  },

  async add(portfolioId: number, payload: AddWatchlistPayload): Promise<WatchlistItem> {
    const response = await api.post<WatchlistItem>(
      `${WATCHLIST_API_PATH}/portfolio/${portfolioId}`,
      {
        symbol: normalizeSymbol(payload.symbol),
      },
    );

    return response.data;
  },

  async remove(portfolioId: number, symbol: string): Promise<WatchlistItem> {
    const response = await api.delete<WatchlistItem>(
      `${WATCHLIST_API_PATH}/portfolio/${portfolioId}`,
      {
        params: {
          symbol: normalizeSymbol(symbol),
        },
      },
    );

    return response.data;
  },

  async check(portfolioId: number, symbol: string): Promise<boolean> {
    const response = await api.get<boolean>(
      `${WATCHLIST_API_PATH}/portfolio/${portfolioId}/check`,
      {
        params: {
          symbol: normalizeSymbol(symbol),
        },
      },
    );

    return response.data;
  },
};

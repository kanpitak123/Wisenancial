import type { AxiosError } from 'axios';
import { api } from 'src/boot/axios';
import { NEWS_API_PATH } from '../constants/news.constants';
import type {
  ApiErrorResponse,
  NewsFeedResponse,
  NewsItemScope,
  NewsQuery,
  TogglePinResponse,
} from '../types/news.types';

export function getNewsErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;

  const message = axiosError.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? axiosError.response?.data?.error ?? axiosError.message ?? fallback;
}

function sanitizeQuery(query: NewsQuery): NewsQuery {
  return {
    ...(query.scope && {
      scope: query.scope,
    }),
    ...(query.page !== undefined && {
      page: query.page,
    }),
    ...(query.limit !== undefined && {
      limit: query.limit,
    }),
    ...(query.country?.trim() && {
      country: query.country.trim(),
    }),
    ...(query.impact?.trim() && {
      impact: query.impact.trim(),
    }),
    ...(query.sector?.trim() && {
      sector: query.sector.trim(),
    }),
    ...(query.sentiment?.trim() && {
      sentiment: query.sentiment.trim(),
    }),
    ...(query.symbol?.trim() && {
      symbol: query.symbol.trim().toUpperCase(),
    }),
    ...(query.language && {
      language: query.language,
    }),
  };
}

export const newsService = {
  async getNews(query: NewsQuery): Promise<NewsFeedResponse> {
    const response = await api.get<NewsFeedResponse>(NEWS_API_PATH, {
      params: sanitizeQuery(query),
    });

    return response.data;
  },

  async togglePin(scope: NewsItemScope, sourceId: number): Promise<boolean> {
    const response = await api.post<TogglePinResponse>(
      `${NEWS_API_PATH}/${scope}/${sourceId}/toggle-pin`,
    );

    return response.data.pinned;
  },

  async analyzePendingTraderNews(language: 'en' | 'th' = 'th', limit = 50) {
    const response = await api.post(
      `${NEWS_API_PATH}/trader/analyze-pending`,
      {},
      {
        params: {
          language,
          limit,
        },
      },
    );

    return response.data;
  },
};

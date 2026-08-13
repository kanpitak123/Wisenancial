import type { NewsFilters, NewsPagination, NewsScope } from '../types/news.types';

export const NEWS_API_PATH = '/news';

export const NEWS_SCOPE = {
  ALL: 'ALL',
  TRADER: 'TRADER',
  INVESTOR: 'INVESTOR',
} as const satisfies Record<string, NewsScope>;

export const DEFAULT_NEWS_PAGE_SIZE = 12;

export const MAX_NEWS_PAGE_SIZE = 50;

export const DEFAULT_NEWS_LANGUAGE = 'th' as const;

export const createDefaultNewsFilters = (): NewsFilters => ({
  country: '',
  impact: '',
  sector: 'all',
  sentiment: 'all',
  symbol: '',
  search: '',
  importance: 'all',
});

export const createDefaultNewsPagination = (limit = DEFAULT_NEWS_PAGE_SIZE): NewsPagination => ({
  page: 1,
  limit,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

export const NEWS_SOCKET_EVENTS = {
  CREATED: 'new_news',
  DATA_CHANGED: 'news_data_changed',
  AI_ENRICHED: 'news_ai_enriched',
} as const;

export const NEWS_SOCKET_URL =
  import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') ?? 'http://localhost:3000';

export const NEWS_MESSAGES = {
  loadFailed: 'ไม่สามารถโหลดข่าวได้',
  pinFailed: 'ไม่สามารถอัปเดตการปักหมุดได้',
} as const;

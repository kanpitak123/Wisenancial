import type {
  Pagination,
  PostsQuery,
  PostReferenceType,
  Sentiment,
} from '../types/community.types';

export const COMMUNITY_API_PATH = '/posts';

export const DEFAULT_POSTS_PAGE = 1;
export const DEFAULT_POSTS_LIMIT = 20;
export const MAX_POSTS_LIMIT = 50;

export const DEFAULT_POSTS_QUERY: PostsQuery = {
  page: DEFAULT_POSTS_PAGE,
  limit: DEFAULT_POSTS_LIMIT,
};

export const DEFAULT_PAGINATION: Pagination = {
  page: DEFAULT_POSTS_PAGE,
  limit: DEFAULT_POSTS_LIMIT,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

export const POST_REFERENCE_TYPES: readonly PostReferenceType[] = [
  'NONE',
  'TRADE',
  'STOCK_PURCHASE',
  'STOCK_SALE',
  'DIVIDEND',
  'PORTFOLIO',
];

export const POST_SENTIMENTS: readonly Sentiment[] = ['BULLISH', 'BEARISH', 'NEUTRAL'];

export const POST_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;

export const POST_TYPES = [
  'GENERAL',
  'TRADE_REVIEW',
  'INVESTMENT_IDEA',
  'PORTFOLIO_UPDATE',
  'MARKET_VIEW',
] as const;

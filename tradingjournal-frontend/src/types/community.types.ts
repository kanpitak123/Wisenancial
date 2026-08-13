export type PortfolioType = 'TRADER' | 'INVESTOR';

export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type PostReferenceType =
  | 'NONE'
  | 'TRADE'
  | 'STOCK_PURCHASE'
  | 'STOCK_SALE'
  | 'DIVIDEND'
  | 'PORTFOLIO';

export type PostVisibility = 'PUBLIC' | 'PRIVATE';

export interface PostUser {
  id: number;
  username: string;
  full_name: string;
  avatar_url?: string | null;
}

export interface PostPortfolio {
  id: number;
  name: string;
  portfolio_type: PortfolioType;
}

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  content: string;
  created_at: string;
  users: PostUser;
}

export interface PostImage {
  id: number;
  image_url: string;
}

export interface Post {
  id: number;
  user_id: number;
  portfolio_id: number;
  portfolio_type: PortfolioType;
  asset_symbol: string | null;
  content: string;
  sentiment: Sentiment;
  post_type: string;
  visibility: PostVisibility;
  reference_type: PostReferenceType;
  reference_id: number | null;
  reference: Record<string, unknown> | null;
  likes_count: number;
  comments_count: number;
  isLiked: boolean;
  created_at: string;
  updated_at: string;
  users: PostUser;
  portfolios: PostPortfolio;
  post_images: PostImage[];
  comments: Comment[];
}

export interface PostsQuery {
  portfolio_id?: number;
  portfolio_type?: PortfolioType;
  asset_symbol?: string;
  reference_type?: PostReferenceType;
  sentiment?: Sentiment;
  page?: number;
  limit?: number;
}

export interface CreatePostPayload {
  portfolio_id: number;
  asset_symbol?: string;
  content: string;
  sentiment?: Sentiment;
  post_type?: string;
  visibility?: PostVisibility;
  reference_type?: PostReferenceType;
  reference_id?: number;
  imageFile?: File | null;
}

export interface UpdatePostPayload {
  portfolio_id?: number;
  asset_symbol?: string;
  content?: string;
  sentiment?: Sentiment;
  post_type?: string;
  visibility?: PostVisibility;
  reference_type?: PostReferenceType;
  reference_id?: number | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PostsResponse {
  data: Post[];
  pagination: Pagination;
}

export interface LikeResponse {
  liked: boolean;
  likes_count: number;
}

export interface DeletePostResponse {
  success: boolean;
  deleted_id: number;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

import type { SubscriptionTier, UserRole } from './auth.types';

export interface UserPlan {
  id: number | null;
  name: string;
  price: number;
  description: string | null;
  status: string;
  start_date: string;
  end_date: string;
}

export interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  bio: string | null;
  subscription_tier: SubscriptionTier;
  created_at: string | null;
  updated_at: string | null;
  points_balance: number;
  ai_token_balance: number;
  current_streak: number;
  longest_streak: number;
  plan: UserPlan | null;
}

export interface UpdateUserPayload {
  username?: string;
  full_name?: string;
  bio?: string;
  avatar_url?: string;
}

export interface UpdateUserResponse {
  message: string;
  user: Pick<
    UserProfile,
    | 'id'
    | 'username'
    | 'full_name'
    | 'email'
    | 'role'
    | 'avatar_url'
    | 'bio'
    | 'subscription_tier'
    | 'updated_at'
  >;
}

export interface RemoveAvatarResponse {
  message: string;
  user: {
    id: number;
    avatar_url: null;
    updated_at: string | null;
  };
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

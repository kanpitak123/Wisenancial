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
  /** สวิตช์เปิด/ปิดโปรไฟล์สาธารณะ (คู่กับ users.is_public_profile) */
  is_public_profile?: boolean;
}

/**
 * โปรไฟล์สาธารณะของผู้ใช้คนอื่น — คู่กับ GET /users/profile/:username
 *
 * ไม่มี email/id/password โดยตั้งใจ ฝั่งหลังบ้าน select เฉพาะฟิลด์ที่เปิดเผยได้
 */
export interface PublicProfile {
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  subscription_tier: SubscriptionTier;
  is_public_profile: boolean;
  /** true เมื่อคนที่กำลังดูคือเจ้าของโปรไฟล์เอง — ใช้ตัดสินว่าจะโชว์การ์ดตั้งค่าไหม */
  is_owner: boolean;
  current_streak: number;
  member_since: string | null;
  held_stocks: string[];
  total_asset_value: number;
  total_pnl: number;
  portfolio_count: number;
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

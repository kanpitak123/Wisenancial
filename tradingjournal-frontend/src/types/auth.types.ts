export type UserRole = 'USER' | 'ADMIN';

export type SubscriptionTier = 'PACK_159' | 'PACK_219' | 'PACK_279' | 'PACK_399' | null;

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  bio: string | null;
  subscription_tier: SubscriptionTier;
  points_balance: number;
  ai_token_balance: number;
  current_streak: number;
  longest_streak: number;
  created_at: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  full_name: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  access_token: string;
  user: AuthUser;
}

export interface RegisterResponse {
  message: string;
  user: AuthUser;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

/**
 * /auth/refresh คืนรูปแบบเดียวกับ /auth/login เป๊ะ (ตั้งใจให้เหมือนกันฝั่ง backend)
 * จะได้ส่งเข้า AuthStore.setSession() ตัวเดิมได้เลยโดยไม่ต้องมี branch แยก
 *
 * refresh token เองไม่เคยโผล่มาใน body — อยู่ใน httpOnly cookie ที่ JS อ่านไม่ได้
 */
export type RefreshResponse = AuthResponse;

export interface LogoutResponse {
  message: string;
}

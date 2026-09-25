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
  /** GET /users/me ส่งมาให้ตั้งแต่เพิ่มหน้า Settings — ฝั่ง mock เก่าอาจไม่มีจึงเป็น optional */
  is_public_profile?: boolean;
  /** ISO เวลาที่บัญชีจะถูกลบถาวร — null/ไม่มี = ไม่ได้อยู่ในช่วงรอลบ */
  deletion_scheduled_at?: string | null;
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

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  message: string;
  /** จำนวน refresh token ของเครื่องอื่นที่ถูกยกเลิก */
  other_sessions_revoked: number;
  /** false = หลังบ้านระบุเครื่องนี้ไม่ได้ จึงไล่ออกทุกเครื่องรวมเครื่องนี้ */
  current_session_kept: boolean;
}

export interface RequestAccountDeletionResponse {
  message: string;
  /** ISO เวลาที่บัญชีจะถูกลบถาวร */
  deletion_scheduled_at: string;
  grace_days: number;
}

/** ไฟล์ export ข้อมูลของฉัน — GET /users/me/export */
export interface UserDataExport {
  format_version: number;
  exported_at: string;
  user: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
}

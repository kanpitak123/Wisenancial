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
  /** false = ยังไม่ได้ยืนยันอีเมล (ใช้แอปได้ แต่ฟีเจอร์ AI ถูกล็อกจนกว่าจะยืนยัน) */
  email_verified?: boolean;
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
  /** เวอร์ชัน Terms + Privacy ที่ผู้ใช้เห็นตอนติ๊กยอมรับ (หลังบ้านเทียบกับเวอร์ชันปัจจุบันเอง) */
  accepted_terms_version: string;
}

export interface AuthResponse {
  message: string;
  access_token: string;
  user: AuthUser;
  /**
   * มีเฉพาะตอนที่การล็อกอินครั้งนี้ไปยกเลิกการลบบัญชีที่ตั้งไว้ (ช่วงผ่อนผัน 30 วัน)
   * ต้องแสดงให้ผู้ใช้เห็นชัด ๆ ไม่ใช่เงียบ
   */
  account_deletion_cancelled?: boolean;
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

export interface MessageResponse {
  message: string;
}

export interface ResetPasswordResponse extends MessageResponse {
  /** จำนวน refresh token ที่ถูกยกเลิก — ทุกเครื่องต้องล็อกอินใหม่ */
  sessions_revoked: number;
}

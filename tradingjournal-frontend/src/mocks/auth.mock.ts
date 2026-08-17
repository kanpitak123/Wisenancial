import { AUTH_ENDPOINTS } from 'src/constants/auth.constants';
import { MOCK_USER } from './data/seed';

const MOCK_TOKEN = 'mock.access.token';

const MOCK_AUTH_USER = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  username: MOCK_USER.username,
  display_name: MOCK_USER.display_name,
  role: MOCK_USER.role,
  avatar_url: MOCK_USER.avatar_url,
  bio: MOCK_USER.bio,
  subscription_tier: MOCK_USER.subscription_tier,
  points_balance: MOCK_USER.points_balance,
  ai_token_balance: MOCK_USER.ai_token_balance,
  current_streak: MOCK_USER.current_streak,
  longest_streak: MOCK_USER.longest_streak,
  created_at: MOCK_USER.created_at,
};

/**
 * ตอบ endpoint ของ auth ตอนเปิด mock mode
 *
 * คืน null = ไม่ใช่ path ที่ mock ไว้ ให้ผู้เรียกยิงจริงต่อ
 * ตอน mock: ล็อกอินด้วยอีเมล/รหัสอะไรก็ได้ จะได้ user ตัวอย่างเสมอ
 */
export function mockAuthResponse(path: string, options: RequestInit): unknown {
  const method = (options.method ?? 'GET').toUpperCase();

  if (path === AUTH_ENDPOINTS.login && method === 'POST') {
    return {
      message: 'เข้าสู่ระบบสำเร็จ (mock)',
      access_token: MOCK_TOKEN,
      user: MOCK_AUTH_USER,
    };
  }

  if (path === AUTH_ENDPOINTS.register && method === 'POST') {
    return { message: 'สมัครสมาชิกสำเร็จ (mock)', user: MOCK_AUTH_USER };
  }

  if (path === AUTH_ENDPOINTS.me) {
    return { user: MOCK_AUTH_USER };
  }

  return null;
}

export { MOCK_TOKEN };

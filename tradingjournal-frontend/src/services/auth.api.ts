import { API_BASE_URL, AUTH_ENDPOINTS, AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import { MOCK_LATENCY_MS, isMockEnabled } from 'src/mocks/mock.config';
import { mockAuthResponse } from 'src/mocks/auth.mock';
import type {
  AuthResponse,
  CurrentUserResponse,
  LoginPayload,
  LogoutResponse,
  RefreshResponse,
  RegisterPayload,
  RegisterResponse,
} from 'src/types/auth.types';

interface ErrorPayload {
  message?: string | string[];
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // ไฟล์นี้ใช้ fetch ตรง ๆ ไม่ได้ผ่าน axios จึงต้องเช็ค mock mode เอง
  // ไม่งั้นเปิด mock แล้วจะล็อกอินไม่ได้ถ้า backend ไม่ได้รัน
  if (isMockEnabled()) {
    const mocked = mockAuthResponse(path, options);

    if (mocked !== null) {
      await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
      return mocked as T;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    // refresh token อยู่ใน httpOnly cookie ที่ backend ตั้งให้ตอน login
    // ถ้าไม่ใส่ตรงนี้ เบราว์เซอร์จะไม่แนบ cookie ข้าม origin (:9000 -> :3000)
    // แล้ว /auth/refresh กับ /auth/logout จะมองไม่เห็น token เลย
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = (await response.json().catch(() => null)) as ErrorPayload | T | null;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data ? data.message : undefined;

    throw new Error(
      Array.isArray(message) ? message.join(', ') : (message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ'),
    );
  }

  return data as T;
}

export const authApi = {
  login(payload: LoginPayload) {
    return request<AuthResponse>(AUTH_ENDPOINTS.login, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  register(payload: RegisterPayload) {
    return request<RegisterResponse>(AUTH_ENDPOINTS.register, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMe(token: string) {
    return request<CurrentUserResponse>(AUTH_ENDPOINTS.me, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },

  /**
   * ไม่ต้องส่งอะไรไปเลย — เบราว์เซอร์แนบ refresh token ให้เองผ่าน cookie
   * และไม่ต้องแนบ access token เดิมด้วย เพราะตัวที่หมดอายุไปแล้วนั่นแหละคือเหตุผลที่เรียกอันนี้
   */
  refresh() {
    return request<RefreshResponse>(AUTH_ENDPOINTS.refresh, {
      method: 'POST',
    });
  },

  /** backend จะ revoke refresh token ทั้ง family แล้วสั่งเบราว์เซอร์ลบ cookie ทิ้ง */
  logout() {
    return request<LogoutResponse>(AUTH_ENDPOINTS.logout, {
      method: 'POST',
    });
  },

  readStoredToken() {
    return localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
  },
};

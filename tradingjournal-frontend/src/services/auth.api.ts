import { API_BASE_URL, AUTH_ENDPOINTS, AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import type {
  AuthResponse,
  CurrentUserResponse,
  LoginPayload,
  RegisterPayload,
  RegisterResponse,
} from 'src/types/auth.types';

interface ErrorPayload {
  message?: string | string[];
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
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

  readStoredToken() {
    return localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
  },
};

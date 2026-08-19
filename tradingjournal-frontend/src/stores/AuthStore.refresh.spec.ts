/**
 * เดิม logout ลบแค่ localStorage — token ยังใช้งานได้จริงบน server จนหมดอายุเอง
 * และ initialize() ที่ยิง /auth/me ด้วย fetch ตรง (ไม่ผ่าน axios interceptor)
 * จะ clearSession ทิ้งทันทีเมื่อ access token หมดอายุ ทั้งที่ refresh token ยังดีอยู่
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './AuthStore';
import { AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import type { AuthUser } from 'src/types/auth.types';

const login = vi.fn();
const register = vi.fn();
const getMe = vi.fn();
const refresh = vi.fn();
const logout = vi.fn();

vi.mock('src/services/auth.api', () => ({
  authApi: {
    login: (...args: unknown[]) => login(...args),
    register: (...args: unknown[]) => register(...args),
    getMe: (...args: unknown[]) => getMe(...args),
    refresh: (...args: unknown[]) => refresh(...args),
    logout: (...args: unknown[]) => logout(...args),
    readStoredToken: () => localStorage.getItem(AUTH_STORAGE_KEYS.accessToken),
  },
}));

const USER: AuthUser = {
  id: 1,
  email: 'qa@wisenancial.test',
  username: 'qa',
  display_name: 'QA',
  role: 'USER',
  avatar_url: null,
  bio: null,
  subscription_tier: null,
  points_balance: 0,
  ai_token_balance: 0,
  current_streak: 0,
  longest_streak: 0,
  created_at: null,
};

const FRESH_USER: AuthUser = { ...USER, ai_token_balance: 42 };

describe('AuthStore — refresh & logout', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  describe('refreshSession', () => {
    it('should store the new access token and user when refresh succeeds', async () => {
      refresh.mockResolvedValue({
        message: 'ok',
        access_token: 'new-access-token',
        user: FRESH_USER,
      });

      const auth = useAuthStore();
      const result = await auth.refreshSession();

      expect(result).toEqual(FRESH_USER);
      expect(auth.accessToken).toBe('new-access-token');
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe('new-access-token');
      expect(auth.user?.ai_token_balance).toBe(42);
      expect(auth.isAuthenticated).toBe(true);
    });

    it('should wipe the session when the refresh token is dead', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'stale-token');
      refresh.mockRejectedValue(new Error('Refresh Token หมดอายุหรือไม่ถูกต้อง'));

      const auth = useAuthStore();
      const result = await auth.refreshSession();

      expect(result).toBeNull();
      expect(auth.accessToken).toBeNull();
      expect(auth.user).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).toBeNull();
    });

    it('should not send the refresh token itself — the cookie carries it', async () => {
      refresh.mockResolvedValue({ message: 'ok', access_token: 't', user: USER });

      await useAuthStore().refreshSession();

      expect(refresh).toHaveBeenCalledWith();
    });
  });

  describe('initialize', () => {
    it('should keep the session alive by refreshing when the access token expired', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');

      getMe.mockRejectedValue(new Error('Token หมดอายุหรือไม่ถูกต้อง'));
      refresh.mockResolvedValue({
        message: 'ok',
        access_token: 'refreshed-token',
        user: FRESH_USER,
      });

      const auth = useAuthStore();
      const result = await auth.initialize();

      expect(result).toEqual(FRESH_USER);
      expect(auth.accessToken).toBe('refreshed-token');
      expect(auth.isAuthenticated).toBe(true);
    });

    it('should give up only after refresh also fails', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');

      getMe.mockRejectedValue(new Error('expired'));
      refresh.mockRejectedValue(new Error('also expired'));

      const auth = useAuthStore();

      await expect(auth.initialize()).resolves.toBeNull();
      expect(auth.isAuthenticated).toBe(false);
    });

    it('should not call refresh at all when there is no stored token', async () => {
      const auth = useAuthStore();

      await expect(auth.initialize()).resolves.toBeNull();
      expect(getMe).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should tell the backend to revoke the refresh token', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'token');
      logout.mockResolvedValue({ message: 'ออกจากระบบเรียบร้อย' });

      const auth = useAuthStore();
      await auth.logout();

      expect(logout).toHaveBeenCalledTimes(1);
      expect(auth.accessToken).toBeNull();
      expect(auth.user).toBeNull();
    });

    it('should still clear the local session when the request fails', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'token');
      localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(USER));
      logout.mockRejectedValue(new Error('Network Error'));

      const auth = useAuthStore();

      await expect(auth.logout()).resolves.toBeUndefined();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).toBeNull();
      expect(auth.isAuthenticated).toBe(false);
    });
  });
});

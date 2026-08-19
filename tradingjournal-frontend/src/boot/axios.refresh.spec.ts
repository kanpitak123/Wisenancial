/**
 * 401 interceptor + silent refresh
 *
 * จุดที่ต้องระวังที่สุดคือ backend ทำ token rotation ไว้ — ถ้าหลาย request ที่ 401
 * พร้อมกันต่างคนต่างยิง /auth/refresh ใบที่ 2 เป็นต้นไปจะกลายเป็น "reuse"
 * แล้วโดน revoke ทั้ง family ผู้ใช้หลุดทั้งที่ไม่มีอะไรผิด เทสชุดนี้จึงล็อกพฤติกรรม
 * single-flight ไว้ พร้อมกับกันวนไม่รู้จบ
 */
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import boot, { api, resetRefreshState } from './axios';
import { AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import type { AuthUser } from 'src/types/auth.types';

const refresh = vi.fn();
const logout = vi.fn();

vi.mock('src/services/auth.api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    getMe: vi.fn(),
    refresh: (...args: unknown[]) => refresh(...args),
    logout: (...args: unknown[]) => logout(...args),
    readStoredToken: vi.fn(),
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

/** จำนวน request ที่ adapter จะตอบ 401 ก่อนเริ่มตอบ 200 */
let unauthorizedResponsesLeft = 0;
let alwaysUnauthorized = false;
let adapterCalls: string[] = [];

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  const response = {
    status: 401,
    statusText: 'Unauthorized',
    data: { message: 'Token หมดอายุหรือไม่ถูกต้อง' },
    headers: {},
    config,
  } as AxiosResponse;

  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response);
}

const replace = vi.fn();

function bootApp() {
  const app = { config: { globalProperties: {} } };
  const router = { currentRoute: { value: { path: '/Dashboard' } }, replace };
  const pinia = createPinia();

  setActivePinia(pinia);

  (boot as unknown as (ctx: unknown) => void)({ app, router, store: pinia });
}

describe('boot/axios — 401 silent refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    resetRefreshState();
    adapterCalls = [];
    unauthorizedResponsesLeft = 0;
    alwaysUnauthorized = false;

    // boot() ลง response interceptor ทุกครั้งที่ถูกเรียก — ล้างของรอบก่อนก่อนเสมอ
    api.interceptors.response.clear();

    api.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      adapterCalls.push(config.url ?? '');

      if (alwaysUnauthorized || unauthorizedResponsesLeft > 0) {
        unauthorizedResponsesLeft -= 1;
        return Promise.reject(unauthorized(config));
      }

      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as AxiosResponse);
    };

    bootApp();
  });

  it('should send withCredentials so the refresh cookie travels with every request', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('should refresh once and replay the failed request', async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');
    unauthorizedResponsesLeft = 1;

    refresh.mockImplementation(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'fresh-token');
      return Promise.resolve({ message: 'ok', access_token: 'fresh-token', user: USER });
    });

    const response = await api.get('/portfolios');

    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(adapterCalls).toEqual(['/portfolios', '/portfolios']);
    expect(replace).not.toHaveBeenCalled();
  });

  it('should attach the brand new access token to the replayed request', async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');
    unauthorizedResponsesLeft = 1;

    const seenTokens: unknown[] = [];

    const original = api.defaults.adapter;

    api.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seenTokens.push(config.headers.Authorization);
      return (original as (c: InternalAxiosRequestConfig) => Promise<AxiosResponse>)(config);
    };

    refresh.mockImplementation(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'fresh-token');
      return Promise.resolve({ message: 'ok', access_token: 'fresh-token', user: USER });
    });

    await api.get('/portfolios');

    expect(seenTokens).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
  });

  it('should call /auth/refresh only once when several requests get 401 together', async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');
    unauthorizedResponsesLeft = 3;

    let resolveRefresh: (() => void) | undefined;

    const refreshStarted = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });

    refresh.mockImplementation(async () => {
      resolveRefresh?.();
      // หน่วงให้ทั้งสามคำขอมาถึงจุดรอ refresh พร้อมกันจริง ๆ
      await new Promise((resolve) => setTimeout(resolve, 20));
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'fresh-token');
      return { message: 'ok', access_token: 'fresh-token', user: USER };
    });

    const requests = Promise.all([
      api.get('/portfolios'),
      api.get('/trades'),
      api.get('/goals'),
    ]);

    await refreshStarted;

    const responses = await requests;

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refresh).toHaveBeenCalledTimes(1);
    // 3 ครั้งแรกโดน 401 อีก 3 ครั้งคือการยิงซ้ำหลัง refresh
    expect(adapterCalls).toHaveLength(6);
    expect(replace).not.toHaveBeenCalled();
  });

  it('should force a logout and bounce to login when refresh fails', async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(USER));
    unauthorizedResponsesLeft = 1;

    refresh.mockRejectedValue(new Error('Refresh Token หมดอายุหรือไม่ถูกต้อง'));

    await expect(api.get('/portfolios')).rejects.toThrow();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/Login');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).toBeNull();
  });

  it('should give up after one retry instead of looping forever', async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'expired-token');
    alwaysUnauthorized = true;

    refresh.mockImplementation(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'fresh-token');
      return Promise.resolve({ message: 'ok', access_token: 'fresh-token', user: USER });
    });

    await expect(api.get('/portfolios')).rejects.toThrow();

    // ยิงครั้งแรก + ยิงซ้ำหลัง refresh อีกครั้งเดียว แล้วหยุด
    expect(adapterCalls).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/Login');
  });

  it('should not try to refresh a failing /auth/refresh call itself', async () => {
    alwaysUnauthorized = true;

    await expect(api.post('/auth/refresh')).rejects.toThrow();

    expect(refresh).not.toHaveBeenCalled();
    expect(adapterCalls).toEqual(['/auth/refresh']);
    expect(replace).toHaveBeenCalledWith('/Login');
  });

  it('should stay on the login page instead of redirecting to itself', async () => {
    const app = { config: { globalProperties: {} } };
    const router = { currentRoute: { value: { path: '/login' } }, replace };
    const pinia = createPinia();

    setActivePinia(pinia);
    api.interceptors.response.clear();
    (boot as unknown as (ctx: unknown) => void)({ app, router, store: pinia });

    alwaysUnauthorized = true;
    refresh.mockRejectedValue(new Error('dead'));

    await expect(api.get('/portfolios')).rejects.toThrow();

    expect(replace).not.toHaveBeenCalled();
  });
});

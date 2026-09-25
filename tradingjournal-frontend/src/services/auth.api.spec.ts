import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from './auth.api';
import { AUTH_ENDPOINTS } from 'src/constants/auth.constants';

vi.mock('src/mocks/mock.config', () => ({
  MOCK_LATENCY_MS: 0,
  isMockEnabled: () => false,
}));

describe('authApi.logout', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST /auth/logout พร้อม cookie (credentials: include) และมี timeout กันค้าง', async () => {
    await authApi.logout();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain(AUTH_ENDPOINTS.logout);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('authApi email flows', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    return { url, init, body: JSON.parse(init.body as string) as Record<string, unknown> };
  };

  it('forgotPassword POSTs only the email', async () => {
    await authApi.forgotPassword('a@b.co');

    const { url, init, body } = lastCall();

    expect(url).toContain(AUTH_ENDPOINTS.forgotPassword);
    expect(init.method).toBe('POST');
    expect(body).toEqual({ email: 'a@b.co' });
  });

  it('resetPassword sends the token and new_password (snake_case, as the DTO expects)', async () => {
    await authApi.resetPassword('tok', 'NewPass123');

    const { url, body } = lastCall();

    expect(url).toContain(AUTH_ENDPOINTS.resetPassword);
    expect(body).toEqual({ token: 'tok', new_password: 'NewPass123' });
  });

  it('verifyEmail sends the token in the body, not the URL', async () => {
    await authApi.verifyEmail('tok');

    const { url, body } = lastCall();

    expect(url).toContain(AUTH_ENDPOINTS.verifyEmail);
    expect(url).not.toContain('tok');
    expect(body).toEqual({ token: 'tok' });
  });
});

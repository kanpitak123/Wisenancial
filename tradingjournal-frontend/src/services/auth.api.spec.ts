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

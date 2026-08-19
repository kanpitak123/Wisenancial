import type { Request, Response } from 'express';
import {
  clearRefreshCookie,
  readRefreshCookie,
  readRequestContext,
  setRefreshCookie,
} from './auth-cookie.util';

function requestWith(
  cookieHeader?: string,
  parsedCookies?: Record<string, string>,
): Request {
  return {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    ...(parsedCookies ? { cookies: parsedCookies } : {}),
  } as unknown as Request;
}

describe('auth-cookie.util', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('readRefreshCookie', () => {
    it('should return undefined when no cookie header is present', () => {
      expect(readRefreshCookie(requestWith())).toBeUndefined();
    });

    it('should pull the token out of a header with several cookies', () => {
      const request = requestWith(
        'theme=dark; refresh_token=abc.def.ghi; other=1',
      );

      expect(readRefreshCookie(request)).toBe('abc.def.ghi');
    });

    it('should not confuse a cookie whose name merely ends with the same text', () => {
      const request = requestWith('not_refresh_token=wrong; refresh_token=right');

      expect(readRefreshCookie(request)).toBe('right');
    });

    it('should decode percent-encoded values', () => {
      expect(readRefreshCookie(requestWith('refresh_token=a%2Bb'))).toBe('a+b');
    });

    it('should treat an empty value as missing', () => {
      expect(readRefreshCookie(requestWith('refresh_token='))).toBeUndefined();
    });

    it('should return undefined when the cookie is absent from a populated header', () => {
      expect(readRefreshCookie(requestWith('theme=dark'))).toBeUndefined();
    });

    it('should prefer req.cookies when cookie-parser is installed later on', () => {
      const request = requestWith('refresh_token=from-header', {
        refresh_token: 'from-parser',
      });

      expect(readRefreshCookie(request)).toBe('from-parser');
    });
  });

  describe('setRefreshCookie', () => {
    it('should always mark the cookie httpOnly and scope it to /auth', () => {
      const response = { cookie: jest.fn() } as unknown as Response;

      setRefreshCookie(response, 'token-value', 60);

      const [name, value, options] = (response.cookie as jest.Mock).mock
        .calls[0];

      expect(name).toBe('refresh_token');
      expect(value).toBe('token-value');
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/auth');
      expect(options.maxAge).toBe(60_000);
    });

    it('should stay on lax/insecure outside production so localhost dev works', () => {
      process.env.NODE_ENV = 'development';

      const response = { cookie: jest.fn() } as unknown as Response;

      setRefreshCookie(response, 'token-value', 60);

      const options = (response.cookie as jest.Mock).mock.calls[0][2];

      expect(options.sameSite).toBe('lax');
      expect(options.secure).toBe(false);
    });

    it('should switch to none/secure in production for cross-site cookies', () => {
      process.env.NODE_ENV = 'production';

      const response = { cookie: jest.fn() } as unknown as Response;

      setRefreshCookie(response, 'token-value', 60);

      const options = (response.cookie as jest.Mock).mock.calls[0][2];

      expect(options.sameSite).toBe('none');
      expect(options.secure).toBe(true);
    });
  });

  describe('clearRefreshCookie', () => {
    it('should clear using the same attributes it was set with', () => {
      const response = {
        cookie: jest.fn(),
        clearCookie: jest.fn(),
      } as unknown as Response;

      setRefreshCookie(response, 'token-value', 60);
      clearRefreshCookie(response);

      const setOptions = (response.cookie as jest.Mock).mock.calls[0][2];
      const clearOptions = (response.clearCookie as jest.Mock).mock.calls[0][1];

      expect(clearOptions.path).toBe(setOptions.path);
      expect(clearOptions.sameSite).toBe(setOptions.sameSite);
      expect(clearOptions.secure).toBe(setOptions.secure);
      expect(clearOptions.httpOnly).toBe(true);
    });
  });

  describe('readRequestContext', () => {
    it('should omit keys that are not present instead of sending undefined', () => {
      expect(readRequestContext(requestWith())).toEqual({});
    });

    it('should capture the user agent and ip when express provides them', () => {
      const request = {
        headers: { 'user-agent': 'jest-agent' },
        ip: '10.0.0.1',
      } as unknown as Request;

      expect(readRequestContext(request)).toEqual({
        userAgent: 'jest-agent',
        ipAddress: '10.0.0.1',
      });
    });
  });
});

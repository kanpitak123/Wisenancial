import type { CookieOptions, Request, Response } from 'express';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

const COOKIE_NAME = AUTH_CONSTANTS.refreshCookieName;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * dev: หน้าบ้าน localhost:9000 กับหลังบ้าน localhost:3000 ถือเป็น "same-site"
 * (registrable domain เดียวกันคือ localhost) SameSite=Lax จึงส่ง cookie ได้ปกติ
 * และไม่ต้องบังคับ Secure ให้ต้องยก https ขึ้นมาตอน dev
 *
 * production: คนละโดเมนกันแน่นอน ต้อง SameSite=None ซึ่งสเปกบังคับให้มาคู่กับ Secure
 */
function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: AUTH_CONSTANTS.refreshCookiePath,
  };
}

export function setRefreshCookie(
  response: Response,
  token: string,
  maxAgeSeconds: number,
): void {
  response.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearRefreshCookie(response: Response): void {
  // ต้องใช้ option ชุดเดียวกับตอนตั้ง (โดยเฉพาะ path) ไม่งั้นเบราว์เซอร์จะมองเป็นคนละ
  // cookie แล้วลบไม่ออก
  response.clearCookie(COOKIE_NAME, baseCookieOptions());
}

/**
 * อ่าน refresh token จาก header โดยไม่พึ่ง cookie-parser — ทั้งระบบมี endpoint
 * ที่ต้องอ่าน cookie อยู่แค่ /auth/refresh กับ /auth/logout และอ่านแค่ชื่อเดียว
 * จึงไม่คุ้มที่จะเพิ่ม dependency กับ global middleware เข้ามา
 *
 * ยังเผื่อไว้ให้ req.cookies ใช้ได้ด้วย เผื่อวันหลังมีคนใส่ cookie-parser เข้ามา
 * โค้ดตรงนี้จะได้ไม่ต้องแก้
 */
export function readRefreshCookie(request: Request): string | undefined {
  const parsed = (request as Request & { cookies?: Record<string, string> })
    .cookies;

  if (parsed?.[COOKIE_NAME]) {
    return parsed[COOKIE_NAME];
  }

  const header = request.headers.cookie;

  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== COOKIE_NAME) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    return value ? decodeURIComponent(value) : undefined;
  }

  return undefined;
}

/** ข้อมูลอุปกรณ์ที่เก็บคู่กับ refresh token แต่ละใบ */
export function readRequestContext(request: Request): {
  userAgent?: string;
  ipAddress?: string;
} {
  const userAgent = request.headers['user-agent'];
  const ipAddress = request.ip;

  return {
    ...(userAgent ? { userAgent } : {}),
    ...(ipAddress ? { ipAddress } : {}),
  };
}

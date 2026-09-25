import { createHash, randomBytes } from 'crypto';

/**
 * token แบบใช้ครั้งเดียว (รีเซ็ตรหัสผ่าน / ยืนยันอีเมล)
 *
 * - token ดิบ 256 บิตจาก CSPRNG ส่งให้ผู้ใช้ทางอีเมลเท่านั้น — ไม่เก็บลง DB
 * - DB เก็บเฉพาะ SHA-256 (hex) เหมือน refresh token: ค่าสุ่มเอนโทรปีสูง ไม่ใช่รหัสผ่านที่คนตั้ง
 *   จึงไม่ต้องใช้ slow hash และค้นด้วยค่า hash ตรง ๆ ได้ (DB รั่วก็เอาไปใช้ไม่ได้)
 */
export interface OneTimeToken {
  token: string;
  tokenHash: string;
}

export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOneTimeToken(): OneTimeToken {
  const token = randomBytes(32).toString('base64url');

  return { token, tokenHash: hashOneTimeToken(token) };
}

/**
 * แปลงค่า expiry ที่ตั้งมาจาก .env ให้เป็นวินาที
 *
 * รับได้ทั้งตัวเลขวินาทีล้วน ('900', 900) และรูปแบบย่อ ('15m', '30d')
 * ถ้าแปลงไม่ได้จะคืน fallback แทนการ throw — เดิมโค้ดนี้อยู่ใน auth.module.ts
 * (ชื่อ thisToSeconds) ย้ายออกมาเพราะตอนนี้ refresh token ก็ต้องใช้ตัวเดียวกัน
 */
export function parseExpiresInSeconds(
  value: string | number | undefined,
  fallbackSeconds: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (value === undefined) {
    return fallbackSeconds;
  }

  const normalized = String(value).trim().toLowerCase();

  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return seconds > 0 ? seconds : fallbackSeconds;
  }

  const match = normalized.match(/^(\d+)(s|m|h|d)$/);

  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';

  const multiplier: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  const seconds = amount * multiplier[unit]!;

  return seconds > 0 ? seconds : fallbackSeconds;
}

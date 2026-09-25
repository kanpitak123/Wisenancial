import { resolveCorsOrigins } from '../config/cors-origins.util';

/**
 * ฐาน URL หน้าบ้านสำหรับลิงก์ในอีเมล — FRONTEND_URL ก่อน ไม่มีก็ใช้ origin แรกของ CORS
 * คืน null ถ้าหาไม่ได้ (เช่น production ที่ไม่ได้ตั้งค่า) ผู้เรียกต้องไม่ส่งอีเมลในกรณีนั้น
 */
export function resolveFrontendBaseUrl(): string | null {
  const explicit = process.env.FRONTEND_URL?.split(',')[0]?.trim();
  const base = explicit || resolveCorsOrigins()[0];

  return base ? base.replace(/\/+$/, '') : null;
}

/**
 * ลิงก์ที่มี token — หน้าบ้านใช้ hash router (`/#/...`) และ token อยู่หลัง `#`
 * ซึ่งเบราว์เซอร์ไม่ส่งไปที่ server และไม่ติดไปกับ Referer ตอนกดลิงก์ออกจากหน้านั้น
 */
export function buildTokenLink(
  baseUrl: string,
  route: string,
  token: string,
): string {
  return `${baseUrl}/#/${route}?token=${encodeURIComponent(token)}`;
}

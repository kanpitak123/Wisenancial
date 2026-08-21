import type { ShareContentType, SharePlatform } from '../types/share.types';

export const SHARE_API_PATH = '/share-statistics';

export const SHARE_PLATFORMS: readonly SharePlatform[] = [
  'twitter',
  'facebook',
  'linkedin',
  'download',
  'copy_link',
];

export const SOCIAL_SHARE_PLATFORMS: readonly SharePlatform[] = ['twitter', 'facebook', 'linkedin'];

export const SHARE_CONTENT_TYPES: readonly ShareContentType[] = ['MESSAGE', 'IMAGE', 'LINK'];

export const DEFAULT_SHARE_LOG_LIMIT = 20;

export const MAX_SHARE_LOG_LIMIT = 100;

export const SHARE_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Portfolio',
  statisticsFailed: 'ไม่สามารถโหลดข้อมูลสำหรับแชร์ได้',
  messageFailed: 'ไม่สามารถสร้างข้อความแชร์ได้',
  imageFailed: 'ไม่สามารถสร้างรูปสำหรับแชร์ได้',
  socialDataFailed: 'ไม่สามารถโหลดข้อมูล Social Share ได้',
  logFailed: 'ไม่สามารถบันทึกประวัติการแชร์ได้',
  logsFailed: 'ไม่สามารถโหลดประวัติการแชร์ได้',
} as const;

/**
 * ปลายทางของ QR บนการ์ดแชร์ — ชี้หน้า landing สาธารณะ ไม่ใช่ /profile/:username
 *
 * เหตุผล: GET /users/profile/:username ยังอยู่หลัง JwtAuthGuard ระดับคลาส และ route
 * ฝั่งหน้าบ้านอยู่ใต้ MainLayout ที่ meta.requiresAuth — "สาธารณะ" ของโปรไฟล์แปลว่า
 * "คนอื่นในระบบดูได้" ไม่ใช่คนนอกที่ยังไม่ล็อกอิน คนที่สแกน QR จากรูปที่แชร์ออกไป
 * จึงจะโดนเด้งเข้าหน้า Login แทนที่จะเห็นโปรไฟล์
 *
 * ถ้าวันหนึ่งเปิดโปรไฟล์ให้คนนอกดูได้จริง เปลี่ยนที่นี่ที่เดียว
 */
export const SHARE_QR_TARGET_URL =
  import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || 'https://wisenancial.app/';

/**
 * ตั้งใจให้ error correction สูง (H) เพราะรูปที่แชร์มักถูกบีบซ้ำโดยแอปแชต/โซเชียล
 * และ margin 1 โมดูลกำลังพอดี — น้อยกว่านี้เครื่องสแกนบางตัวจับขอบไม่เจอ
 */
export const SHARE_QR_OPTIONS = {
  errorCorrectionLevel: 'H',
  margin: 1,
  // ความละเอียดจริงของ QR ในไฟล์ PNG = ค่านี้ ไม่ใช่ขนาดที่ CSS ย่อลงมาโชว์
  width: 240,
  color: { dark: '#1b3636', light: '#ffffff' },
} as const;

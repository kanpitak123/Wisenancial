/**
 * หน้ากฎหมายสาธารณะ (Terms / Privacy) และคำปฏิเสธ AI
 *
 * ทุกข้อความในชุดนี้เป็น "ฉบับร่าง" ที่ยังไม่ผ่านทนายความ (docs/internal/phase3-plan.md, B3)
 * — ตัวยึด [ ... ] ที่ยังไม่มีคำตอบต้องแสดงให้เห็นตามจริง ห้ามเติมค่าเดาลงไป
 */

export const TERMS_ROUTE = '/terms';
export const PRIVACY_ROUTE = '/privacy';

/** id ของหัวข้อคำปฏิเสธ AI ในหน้า Terms — การ์ด AI ทุกใบลิงก์มาที่นี่ */
export const AI_DISCLAIMER_ANCHOR = 'ai-disclaimer';

/** ปลายทางของลิงก์ "อ่านคำปฏิเสธฉบับเต็ม" ข้างเนื้อหา AI (router แบบ hash: #/terms#ai-disclaimer) */
export const AI_DISCLAIMER_ROUTE = { path: TERMS_ROUTE, hash: `#${AI_DISCLAIMER_ANCHOR}` };

/**
 * เวอร์ชันของ Terms + Privacy ที่ต้องยอมรับตอนสมัคร "ไม่ได้เก็บไว้ในหน้าบ้าน" — มีแหล่งเดียวคือหลังบ้าน
 * (CURRENT_TERMS_VERSION) หน้าบ้านอ่านจาก endpoint นี้ (ดู LegalStore) มีเทสกันไม่ให้เลขเวอร์ชันกลับมาฝังในโค้ด
 */
export const LEGAL_TERMS_VERSION_PATH = '/legal/terms-version';

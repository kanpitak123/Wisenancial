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
 * เวอร์ชันของ Terms + Privacy ที่ผู้ใช้เห็นตอนกดยอมรับ
 * ต้องเปลี่ยนทุกครั้งที่เนื้อหาเปลี่ยนจริง (และตรงกับ CURRENT_TERMS_VERSION ฝั่งหลังบ้าน)
 */
export const TERMS_VERSION = 'draft-0.1';

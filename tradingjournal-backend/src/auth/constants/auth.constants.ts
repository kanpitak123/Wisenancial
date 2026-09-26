/**
 * เวอร์ชันของ Terms + Privacy ที่ต้องยอมรับตอนสมัคร — ต้องตรงกับ TERMS_VERSION ฝั่งหน้าบ้าน
 * (tradingjournal-frontend/src/constants/legal.constants.ts) และเปลี่ยนทุกครั้งที่เนื้อหาเปลี่ยนจริง
 * ตอนนี้ยังเป็นฉบับร่างที่ยังไม่ผ่านทนายความ จึงเป็น draft-0.1
 */
export const CURRENT_TERMS_VERSION = 'draft-0.1';

export const AUTH_CONSTANTS = {
  bcryptSaltRounds: 12,
  defaultAccessTokenExpiresIn: '15m',
  defaultRefreshTokenExpiresIn: '30d',

  refreshCookieName: 'refresh_token',

  // จำกัด cookie ให้เบราว์เซอร์แนบมาเฉพาะ /auth/* — endpoint อื่นทั้งระบบใช้
  // Authorization: Bearer อยู่แล้ว ไม่มีเหตุผลให้เห็น refresh token เลย
  // ลดพื้นที่เสี่ยง CSRF ไปในตัวด้วย
  refreshCookiePath: '/auth',
} as const;

/**
 * เพดานคำขอเฉพาะ endpoint ที่เดารหัสผ่าน/ยิงซ้ำได้ (login / register / refresh)
 *
 * ThrottlerGuard ระดับ global คุมทุก endpoint อยู่แล้วที่ 120 ครั้ง/นาที ซึ่งตั้งไว้
 * หลวมโดยตั้งใจเพราะหน้า Dashboard ยิงหลาย endpoint พร้อมกันตอนโหลด — แต่เพดาน
 * เดียวกันนั้นแปลว่าเดารหัสผ่านได้ 120 ครั้ง/นาที/IP ด้วย
 *
 * ทำไม 10 ไม่ใช่ 3-5: เพดานนี้นับต่อ IP และผู้ใช้จำนวนมากอยู่หลัง NAT ร่วมกัน
 * (ออฟฟิศ, มือถือ CGNAT) ตัวเลขที่ต่ำกว่านี้เสี่ยงล็อกคนที่พิมพ์รหัสผิดคนละครั้ง
 * สองครั้งในออฟฟิศเดียวกัน ส่วน 10 ครั้ง/นาที ยังรัดกว่าเดิม 12 เท่า และหยุด
 * สคริปต์เดารหัสแบบยิงรัวได้อยู่
 *
 * /auth/refresh รวมอยู่ด้วยและไม่กระทบผู้ใช้จริง — หน้าบ้านรวบคำขอ refresh ที่เกิด
 * พร้อมกันให้เหลือครั้งเดียวอยู่แล้ว (ดู boot/axios.refresh.spec.ts) ของจริงจึงเกิด
 * ราว 4 ครั้ง/ชั่วโมงตามอายุ access token 15 นาที
 */
export const AUTH_THROTTLE = {
  ttlMs: Number(process.env.AUTH_THROTTLE_TTL_SECONDS ?? 60) * 1000,
  limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10),
} as const;

export const AUTH_ERROR_MESSAGES = {
  invalidCredentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  accountAlreadyExists: 'อีเมลหรือชื่อผู้ใช้นี้ถูกใช้งานแล้ว',
  unauthorized: 'กรุณาล็อกอินก่อนใช้งาน',
  invalidToken: 'Token หมดอายุหรือไม่ถูกต้อง',
  userNotFound: 'ไม่พบบัญชีผู้ใช้',

  missingRefreshToken: 'ไม่พบ Refresh Token กรุณาล็อกอินใหม่',

  // เปลี่ยนรหัสผ่าน — ตอบ 400 ไม่ใช่ 401 โดยตั้งใจ: หน้าบ้านมองทุก 401 ว่า access
  // token หมดอายุ แล้วลอง refresh/ล็อกเอาต์ให้ ซึ่งไม่ใช่สิ่งที่ควรเกิดตอนแค่พิมพ์รหัสเดิมผิด
  currentPasswordIncorrect: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
  newPasswordSameAsCurrent: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน',

  // ลิงก์รีเซ็ต/ยืนยันอีเมล — ข้อความเดียวกันทุกกรณี (ไม่มี/ใช้แล้ว/หมดอายุ/ผิดประเภท)
  // ตอบ 400 ไม่ใช่ 401 ด้วยเหตุผลเดียวกับ currentPasswordIncorrect
  invalidEmailToken: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่',
  emailTooSoon: 'ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  emailUnavailable: 'ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  emailNotVerified: 'กรุณายืนยันอีเมลก่อนใช้งานฟีเจอร์ AI',

  // ตอนสมัครส่งเวอร์ชันข้อกำหนดที่ผู้ใช้เห็นมา — ถ้าไม่ตรงกับเวอร์ชันปัจจุบัน (หน้าเว็บค้างเก่า)
  // ต้องไม่บันทึกว่ายอมรับ เพราะผู้ใช้ไม่ได้เห็นข้อความที่ใช้บังคับอยู่จริง
  termsVersionOutdated:
    'ข้อกำหนดการให้บริการมีการอัปเดต กรุณารีเฟรชหน้าแล้วอ่านและยอมรับอีกครั้ง',

  // ใช้ข้อความเดียวกันทุกกรณีที่ refresh ไม่ผ่าน (หมดอายุ / ลายเซ็นผิด / ถูก revoke /
  // ตรวจพบการใช้ซ้ำ) เพื่อไม่บอกใบ้ผู้โจมตีว่า token ที่ถืออยู่ผิดตรงไหน
  invalidRefreshToken: 'Refresh Token หมดอายุหรือไม่ถูกต้อง',
} as const;

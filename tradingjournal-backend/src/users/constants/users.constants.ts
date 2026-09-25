/**
 * เพดานคำขอของ GET /users/me/export — งานหนัก (อ่านหลายสิบตารางของผู้ใช้คนเดียว)
 * และไม่มีเหตุให้เรียกถี่ ผู้ใช้จริงกดสองสามครั้งต่อวันก็มากแล้ว
 *
 * นับต่อ IP เหมือนเพดานของ /auth (ดู AUTH_THROTTLE) เขียนทับ throttler "default" ตัวเดียว
 * ไม่เพิ่มตัวใหม่ เหตุผลเดียวกับที่อธิบายไว้ใน auth.controller.ts
 */
export const EXPORT_THROTTLE = {
  ttlMs: Number(process.env.EXPORT_THROTTLE_TTL_SECONDS ?? 3600) * 1000,
  limit: Number(process.env.EXPORT_THROTTLE_LIMIT ?? 5),
} as const;

/** ลบบัญชี: ช่วงผ่อนผันก่อนลบถาวร และขนาดชุดที่งานรายวันหยิบมาลบต่อรอบ */
export const ACCOUNT_DELETION = {
  graceDays: 30,
  purgeBatchSize: 100,
} as const;

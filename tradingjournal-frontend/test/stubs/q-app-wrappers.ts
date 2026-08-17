/**
 * Stub ของ '#q-app/wrappers'
 *
 * alias ตัวนี้ถูกสร้างโดย quasar dev/build เท่านั้น ไฟล์ใน src/boot/ ทุกตัวเลย import
 * ไม่ได้ตอนรัน vitest — wrapper พวกนี้แค่ห่อฟังก์ชันไว้เฉยๆ คืนตัวเดิมกลับไปก็พอ
 */
export const defineBoot = <T>(callback: T): T => callback;
export const defineRouter = <T>(callback: T): T => callback;
export const defineStore = <T>(callback: T): T => callback;
export const defineSsrCreate = <T>(callback: T): T => callback;

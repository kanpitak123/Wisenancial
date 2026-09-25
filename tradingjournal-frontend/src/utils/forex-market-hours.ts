/**
 * ช่วงเวลาที่ตลาด Forex เปิดจริง — เปิด 24 ชม. จันทร์-ศุกร์ (โดยประมาณ 22:00 UTC วันอาทิตย์
 * ถึง 22:00 UTC วันศุกร์) ปิดเสาร์-อาทิตย์ (ก่อน 22:00 UTC)
 *
 * ใช้เกทการ poll ราคาสดของ Forex Asset Explorer — ไม่งั้นจะ poll ค้างวนไม่จบตอนตลาดปิด
 * ทั้งที่ไม่มีข้อมูลใหม่ให้ดึงเลย (เปลืองโควต้า Yahoo โดยเปล่าประโยชน์) และป้องกันไม่ให้
 * แท่งล่าสุดถูกแก้ด้วยราคาที่ค้างจากก่อนตลาดปิด (ทำเป็นแท่งปลอมทั้งที่ตลาดหยุดจริง)
 *
 * เป็นค่าประมาณตามปฏิทินมาตรฐาน ไม่รวมวันหยุดพิเศษของตลาด (เช่น Christmas/New Year ที่บาง
 * โบรกเกอร์ปิดเพิ่ม) — ขอบเขตที่ตั้งใจไว้สำหรับงานนี้ ไม่ใช่ปฏิทินตลาดที่สมบูรณ์แบบ
 */
export function isForexMarketOpen(date: Date = new Date()): boolean {
  const day = date.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const hour = date.getUTCHours();

  if (day === 6) return false; // Saturday: always closed
  if (day === 0) return hour >= 22; // Sunday: opens 22:00 UTC
  if (day === 5) return hour < 22; // Friday: closes 22:00 UTC

  return true; // Mon-Thu: always open
}

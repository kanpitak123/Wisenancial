/**
 * Mock mode — ให้ทุกหน้าแสดงข้อมูลตัวอย่างโดยไม่ต้องมี backend/DB
 *
 * เปิด/ปิดได้ 2 ทาง:
 *   1. ปุ่มบน header (เก็บค่าลง localStorage — ชนะค่า env เสมอ)
 *   2. VITE_MOCK_MODE=true ใน .env ของ frontend (ค่าเริ่มต้นตอน build)
 *
 * ตอน implement ของจริง: ปิด flag ก็กลับไปยิง backend ตามเดิมทันที
 * ไม่ต้องแก้โค้ดหน้าไหนเลย เพราะ mock ดักที่ชั้น axios adapter
 */
export const MOCK_STORAGE_KEY = 'wisenancial_mock_mode';

/** หน่วงเวลาตอบกลับให้เห็น loading state เหมือนยิง API จริง (ms) */
export const MOCK_LATENCY_MS = 220;

function readEnvDefault(): boolean {
  const raw = (import.meta.env.VITE_MOCK_MODE as string | undefined)?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export function isMockEnabled(): boolean {
  const stored = localStorage.getItem(MOCK_STORAGE_KEY);

  if (stored !== null) {
    return stored === 'true';
  }

  return readEnvDefault();
}

export function setMockEnabled(enabled: boolean): void {
  localStorage.setItem(MOCK_STORAGE_KEY, String(enabled));
}

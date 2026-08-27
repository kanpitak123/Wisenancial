/**
 * Mock mode — ให้ทุกหน้าแสดงข้อมูลตัวอย่างโดยไม่ต้องมี backend/DB
 *
 * เปิด/ปิดได้ 2 ทาง (เฉพาะ build ที่อนุญาต — ดู isMockAvailable):
 *   1. ปุ่มบน header (เก็บค่าลง localStorage — ชนะค่า env)
 *   2. VITE_MOCK_MODE=true ใน .env ของ frontend (ค่าเริ่มต้นตอน build)
 *
 * ตอน implement ของจริง: ปิด flag ก็กลับไปยิง backend ตามเดิมทันที
 * ไม่ต้องแก้โค้ดหน้าไหนเลย เพราะ mock ดักที่ชั้น axios adapter
 */
export const MOCK_STORAGE_KEY = 'wisenancial_mock_mode';

/** หน่วงเวลาตอบกลับให้เห็น loading state เหมือนยิง API จริง (ms) */
export const MOCK_LATENCY_MS = 220;

/**
 * build นี้อนุญาตให้ใช้ mock mode หรือเปล่า
 *
 * เดิมไม่มีด่านนี้ ปุ่มสลับจึงติดไปกับ production build ด้วย และเพราะค่าใน
 * localStorage ชนะค่า env เสมอ ผู้ใช้จริงที่เผลอกดปุ่มครั้งเดียวก็เห็นข้อมูลปลอม
 * ทั้งแอปค้างไปเรื่อย ๆ โดยไม่รู้ตัว การตั้ง VITE_MOCK_MODE=false ก็ช่วยไม่ได้
 * เพราะ localStorage มาก่อน
 *
 * dev เปิดได้เสมอ ส่วน build อื่น (staging) ต้องตั้ง VITE_ENABLE_MOCK_MODE=true
 * ให้ชัดเจน — production build ที่ไม่ได้ตั้งจะปิดตาย ไม่มีทางเปิดได้เลยไม่ว่าจะมี
 * อะไรค้างอยู่ใน localStorage ของเครื่องผู้ใช้
 */
export function isMockAvailable(): boolean {
  if (import.meta.env.DEV) return true;

  const optIn = (import.meta.env.VITE_ENABLE_MOCK_MODE as string | undefined)
    ?.trim()
    .toLowerCase();

  return optIn === 'true' || optIn === '1';
}

function readEnvDefault(): boolean {
  const raw = (import.meta.env.VITE_MOCK_MODE as string | undefined)?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export function isMockEnabled(): boolean {
  // ตัดจบก่อนแตะ localStorage — ค่าที่ค้างในเครื่องผู้ใช้ต้องไม่มีผลบน production
  if (!isMockAvailable()) return false;

  const stored = readStoredFlag();

  if (stored !== null) {
    return stored === 'true';
  }

  return readEnvDefault();
}

export function setMockEnabled(enabled: boolean): void {
  // กันไว้อีกชั้นเผื่อมีใครเรียกตรง ๆ โดยไม่ผ่านปุ่ม (ปุ่มไม่ถูกเรนเดอร์อยู่แล้ว)
  if (!isMockAvailable()) return;

  try {
    localStorage.setItem(MOCK_STORAGE_KEY, String(enabled));
  } catch {
    // โหมดส่วนตัว/บล็อก site data — ปล่อยผ่าน ดีกว่าทำทั้งแอปพัง
  }
}

function readStoredFlag(): string | null {
  try {
    return localStorage.getItem(MOCK_STORAGE_KEY);
  } catch {
    return null;
  }
}

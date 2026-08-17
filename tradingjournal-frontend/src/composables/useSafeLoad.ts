import { AxiosError } from 'axios';
import { useQuasar } from 'quasar';

/**
 * ครอบงานโหลดข้อมูลใน lifecycle hook ไม่ให้ error หลุดออกไปเป็น
 * "Unhandled error during execution of mounted hook"
 *
 * ถ้า task พัง: log + notify แล้วคืน undefined — hook ที่เรียกจะทำงานต่อได้
 * ไม่หลุดทั้งก้อนจนหน้าว่างเปล่า
 */
export function useSafeLoad() {
  const $q = useQuasar();

  async function safeLoad<T>(
    task: () => Promise<T> | T,
    fallbackMessage = 'โหลดข้อมูลไม่สำเร็จ',
  ): Promise<T | undefined> {
    try {
      return await task();
    } catch (error) {
      console.error(`${fallbackMessage}:`, error);

      // 401 ปล่อยให้ response interceptor ใน boot/axios.ts จัดการ (ล้าง session + เด้งไป Login)
      // ถ้า notify ตรงนี้ด้วย ตอน token หมดอายุจะเด้งเตือนพร้อมกันทุกหน้าที่กำลังโหลด
      const isUnauthorized = error instanceof AxiosError && error.response?.status === 401;

      if (!isUnauthorized) {
        $q.notify({
          type: 'negative',
          message: error instanceof Error ? error.message : fallbackMessage,
          position: 'top',
        });
      }

      return undefined;
    }
  }

  return { safeLoad };
}

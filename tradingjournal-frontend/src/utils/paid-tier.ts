import type { AxiosError } from 'axios';

/**
 * backend ปฏิเสธเพราะเป็นแพ็กฟรีหรือไม่
 *
 * PaidTierGuard โยน ForbiddenException (403) ส่วน 402 เผื่อไว้สำหรับ flow จ่ายเงิน
 * ที่อาจมาทีหลัง — สองสถานะนี้ต้องแสดงการ์ด "ต้องอัปเกรด" ไม่ใช่ error ทั่วไป
 *
 * เดิมตรรกะนี้ซ้ำอยู่ 2 ที่ (analytics.service.ts กับ CoachRoomPage) เลยรวมไว้ที่เดียว
 */
export function isPaidTierError(error: unknown): boolean {
  const status = (error as AxiosError | undefined)?.response?.status;

  return status === 402 || status === 403;
}

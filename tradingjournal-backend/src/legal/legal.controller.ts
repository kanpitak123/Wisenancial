import { Controller, Get, Header } from '@nestjs/common';
import { CURRENT_TERMS_VERSION } from './legal.constants';

@Controller('legal')
export class LegalController {
  /**
   * GET /legal/terms-version — สาธารณะโดยตั้งใจ (ไม่ติด JwtAuthGuard)
   *
   * หน้าสมัครสมาชิกต้องรู้เวอร์ชันข้อกำหนดก่อนผู้ใช้จะล็อกอิน และค่านี้ไม่ใช่ความลับ
   * (ก็คือเลขเวอร์ชันของเอกสารที่เปิดอ่านได้สาธารณะอยู่แล้ว)
   *
   * no-store: ห้ามแคชเลขเวอร์ชันเก่า — ไม่งั้นคนที่เปิดหน้าค้างไว้จะส่งเวอร์ชันที่หมดอายุไปตอนสมัคร
   */
  @Get('terms-version')
  @Header('Cache-Control', 'no-store')
  getTermsVersion() {
    return { terms_version: CURRENT_TERMS_VERSION };
  }
}

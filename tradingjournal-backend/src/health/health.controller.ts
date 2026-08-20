import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * GET /health — ไม่ติด JwtAuthGuard โดยตั้งใจ
   *
   * load balancer / uptime monitor ยิงเข้ามาโดยไม่มี token ถ้าต้องล็อกอินก่อนจะได้ 401
   * ตลอดแล้วถูกตีความว่าเซิร์ฟเวอร์ตาย ข้อมูลที่คืนไปไม่มีความลับ (ไม่มี connection
   * string, ไม่มีชื่อ host, ไม่มีจำนวนผู้ใช้) จึงเปิดสาธารณะได้
   *
   * DB ล่ม -> 503 ไม่ใช่ 200 เพราะ load balancer ส่วนใหญ่ดูแค่ status code
   * ถ้าคืน 200 พร้อม body ว่า degraded จะไม่มีใครถอนเครื่องนี้ออกจาก pool เลย
   */
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.check();

    res.status(report.status === 'ok' ? 200 : 503);

    return report;
  }
}

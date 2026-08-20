import { Global, Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

/**
 * Global เพื่อให้ทุกโมดูลฉีด MonitoringService ได้โดยไม่ต้อง import ซ้ำทุกที่ —
 * error monitoring เป็นเรื่องที่ทุกส่วนของระบบต้องเข้าถึงได้เท่าๆ กัน
 */
@Global()
@Module({
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}

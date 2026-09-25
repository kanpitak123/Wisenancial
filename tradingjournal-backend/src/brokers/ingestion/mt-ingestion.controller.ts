import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { BrokerApiKeyGuard } from '../connections/broker-api-key.guard';
import type { BrokerAuthenticatedRequest } from '../connections/broker-api-key.guard';
import { Mt5IngestEnvelopeDto } from './dto/mt5-ingest.dto';
import { MtConnectionThrottleGuard } from './mt-connection-throttle.guard';
import { MtIngestionService } from './mt-ingestion.service';
import { Mt5SyncService } from './mt5-sync.service';

/**
 * Endpoint ที่ EA (MT4/MT5) เรียกเข้ามาเอง — auth ด้วย API key ผ่าน BrokerApiKeyGuard
 * ไม่ใช่ JWT แยก controller ออกจาก BrokerConnectionsController เพราะ auth คนละแบบ
 *
 * Rate limit สองชั้น: ThrottlerGuard ระดับ global (IP-based, ยังทำงานอยู่ตามเดิมผ่าน
 * APP_GUARD ใน app.module.ts) + MtConnectionThrottleGuard ตัวใหม่ (per-connection,
 * ผูกกับ request.brokerConnection.id) ปิด gap ที่ comment เดิมตรงนี้เคยทิ้งไว้ตั้งแต่
 * Phase 2 ("ควรมี rate limit แยกจาก user-facing endpoint ในอนาคต... ยังไม่ implement
 * per-connection rate limit") — ดู mt-connection-throttle.guard.ts สำหรับเหตุผลที่ทำ
 * เป็น guard แยกแทนที่จะเพิ่ม named throttler ในค่า config เดียวกัน ลำดับใน @UseGuards
 * สำคัญ: BrokerApiKeyGuard ต้องรันก่อนเสมอ เพราะ MtConnectionThrottleGuard อ่าน
 * request.brokerConnection ที่ guard ตัวแรกเป็นคนตั้งให้
 *
 * Phase 2: POST /brokers/mt/heartbeat (คงไว้ ไม่แก้ — เบา/เร็ว ไม่ผ่าน envelope validation
 * เต็มรูปแบบ) Phase 3: POST /brokers/mt/ingest รับ event ทั้ง 5 ชนิด (รวม HEARTBEAT ด้วย
 * ผ่าน eventType) — ดู Phase 3 design review §5 เหตุผลที่รวมเป็น endpoint เดียวแบบมี
 * discriminator แทนที่จะแยก endpoint ต่อ eventType
 */
@UseGuards(BrokerApiKeyGuard, MtConnectionThrottleGuard)
@Controller('brokers/mt')
export class MtIngestionController {
  constructor(
    private readonly ingestion: MtIngestionService,
    private readonly sync: Mt5SyncService,
  ) {}

  @Post('heartbeat')
  heartbeat(@Req() request: BrokerAuthenticatedRequest) {
    return this.ingestion.heartbeat(request.brokerConnection);
  }

  @Post('ingest')
  ingest(
    @Req() request: BrokerAuthenticatedRequest,
    @Body() envelope: Mt5IngestEnvelopeDto,
  ) {
    return this.sync.ingest(request.brokerConnection, envelope);
  }
}

import { Injectable } from '@nestjs/common';
import { broker_connections } from '@prisma/client';
import { BrokerConnectionsService } from '../connections/broker-connections.service';

/**
 * บริการรับ event จาก EA (MT4/MT5) — Phase 2 มีแค่ heartbeat เท่านั้น
 *
 * POST /brokers/mt/ingest (รับ event ประเภท ACCOUNT_SNAPSHOT, POSITION, ORDER, DEAL_EXECUTED
 * จริงจาก EA แล้ว normalize เข้า trading_positions/orders/deals ตาม BrokerAdapter interface)
 * เป็นงานของ Phase 3/4 — ยังไม่สร้าง endpoint นั้นในเฟสนี้ตามขอบเขตที่กำหนดไว้ (ดู Phase 2
 * final report หัวข้อ "remaining decisions for Phase 3")
 */
@Injectable()
export class MtIngestionService {
  constructor(private readonly connections: BrokerConnectionsService) {}

  async heartbeat(connection: broker_connections) {
    return this.connections.recordHeartbeat(connection.id);
  }
}

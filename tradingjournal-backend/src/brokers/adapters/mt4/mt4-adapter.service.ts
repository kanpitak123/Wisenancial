import { Injectable } from '@nestjs/common';
import { NotImplementedBrokerAdapter } from '../not-implemented-broker-adapter.base';
import {
  BrokerConnectionMode,
  BrokerType,
} from '../../interfaces/broker-types';

/**
 * Structural placeholder เท่านั้น — ยังไม่เชื่อมต่อ MT4 จริง
 *
 * MT4 เป็น push-based เหมือน MT5 แต่ data model ต่างกัน (Order object เดียวแทนทุกสถานะ
 * ไม่มี Position/Deal แยก — ดู TRADING_PLATFORM_INTEGRATION_SPEC.md หัวข้อ 4) ต้องมี
 * normalizer แยกจาก MT5 คนละไฟล์ ไม่ใช่พยายามยัดให้เหมือนกันตั้งแต่ชั้น EA
 */
@Injectable()
export class Mt4AdapterService extends NotImplementedBrokerAdapter {
  readonly brokerType: BrokerType = BrokerType.MT4;
  readonly connectionMode: BrokerConnectionMode = 'PUSH';
  protected readonly notImplementedReason = 'MT4 sync เป็นงานของ Phase 4';
}

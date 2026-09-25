import { Injectable } from '@nestjs/common';
import { NotImplementedBrokerAdapter } from '../not-implemented-broker-adapter.base';
import {
  BrokerConnectionMode,
  BrokerType,
} from '../../interfaces/broker-types';

/**
 * Structural placeholder เท่านั้น — ยังไม่เชื่อมต่อ MT5 จริง
 *
 * MT5 เป็น push-based: EA ที่รันในเทอร์มินัลผู้ใช้ยิง event เข้ามาที่ ingestion endpoint เอง
 * (ดู src/brokers/ingestion/) adapter ตัวนี้จึงไม่ได้ "ไปดึง" ข้อมูลออกไปหา broker — เมธอด
 * พวกนี้ในอนาคตจะอ่านจาก trading_positions/trading_orders/trading_deals (ตารางที่ยังไม่ถูก
 * สร้างจนกว่าจะถึง Phase 3) แทน ดูรายละเอียดสถาปัตยกรรมที่แนะนำใน
 * TRADING_PLATFORM_INTEGRATION_SPEC.md หัวข้อ 5
 */
@Injectable()
export class Mt5AdapterService extends NotImplementedBrokerAdapter {
  readonly brokerType: BrokerType = BrokerType.MT5;
  readonly connectionMode: BrokerConnectionMode = 'PUSH';
  protected readonly notImplementedReason = 'MT5 sync เป็นงานของ Phase 3';
}

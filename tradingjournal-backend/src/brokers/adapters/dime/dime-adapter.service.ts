import { Injectable } from '@nestjs/common';
import { NotImplementedBrokerAdapter } from '../not-implemented-broker-adapter.base';
import {
  BrokerConnectionMode,
  BrokerType,
} from '../../interfaces/broker-types';

/**
 * Coming Soon — ไม่ใช่งานค้างของเฟสถัดไป
 *
 * Dime! (dime.co.th) ไม่มี public/partner API ให้เชื่อมต่อ (ตรวจสอบแล้ว 2026-09-02 — ดู
 * TRADING_PLATFORM_INTEGRATION_SPEC.md หัวข้อ 7) adapter ตัวนี้มีไว้แค่ให้ `broker_type =
 * DIME` เป็นค่าที่ระบบรองรับได้โดยไม่ error (เช่น แสดง "Dime — Coming soon" ในหน้าเว็บ
 * แทนการซ่อนไปเลย) ไม่มีกำหนดว่าจะ implement จริงเมื่อไหร่ — ขึ้นกับว่า Dime! เปิด API
 * เองในอนาคตหรือไม่ ห้าม scrape/reverse-engineer/เก็บรหัสผ่านผู้ใช้แทน ไม่มีข้อยกเว้น
 */
@Injectable()
export class DimeAdapterService extends NotImplementedBrokerAdapter {
  readonly brokerType: BrokerType = BrokerType.DIME;
  readonly connectionMode: BrokerConnectionMode = 'PULL';
  protected readonly notImplementedReason =
    'Dime! ยังไม่มี public API ให้เชื่อมต่อ — stub รอสัญญาณจากฝั่ง Dime! เท่านั้น ไม่ใช่งานที่กำหนดเวลาไว้';
}

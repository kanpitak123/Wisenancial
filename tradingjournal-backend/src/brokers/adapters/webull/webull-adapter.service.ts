import { Injectable } from '@nestjs/common';
import { NotImplementedBrokerAdapter } from '../not-implemented-broker-adapter.base';
import { BrokerConnectionMode, BrokerType } from '../../interfaces/broker-types';

/**
 * Structural placeholder เท่านั้น — ยังไม่ทำ Webull OAuth (Connect API) จริง
 *
 * Webull เป็น pull-based: adapter ต้องเป็นฝ่ายเรียกออกไปหา Webull API เอง (OAuth 2.0
 * authorization-code flow, ดู TRADING_PLATFORM_INTEGRATION_SPEC.md หัวข้อ 6) — connect()
 * ในอนาคตคือ exchange authorization code เป็น access/refresh token แล้วเข้ารหัสเก็บลง
 * broker_connections.oauth_*_encrypted (คอลัมน์เตรียมไว้แล้วตั้งแต่ Phase 2 แต่ยังไม่มี
 * encryption service ใดๆ เขียนค่าเข้าไปจนกว่าจะถึง Phase 7)
 */
@Injectable()
export class WebullAdapterService extends NotImplementedBrokerAdapter {
  readonly brokerType: BrokerType = BrokerType.WEBULL;
  readonly connectionMode: BrokerConnectionMode = 'PULL';
  protected readonly notImplementedReason =
    'Webull OAuth Connect API เป็นงานของ Phase 7 (ต้องรอ institution/partner application ผ่านก่อน)';
}

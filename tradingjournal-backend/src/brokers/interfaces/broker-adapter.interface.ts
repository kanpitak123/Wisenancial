import {
  BrokerAccountSnapshot,
  BrokerConnectionHealth,
  BrokerConnectionMode,
  BrokerDeal,
  BrokerOrder,
  BrokerPosition,
  BrokerSyncRange,
  BrokerType,
} from './broker-types';

/**
 * สัญญากลางที่ทุก broker adapter (MT4/MT5/Webull/Dime และตัวถัดไปในอนาคต) implement
 * เพื่อให้ business logic ชั้นบน (dashboard, analytics, journal) เรียกแบบเดียวกันได้เสมอ
 * โดยไม่ต้องรู้ว่ากำลังคุยกับ broker ไหนอยู่ — เพิ่ม broker ใหม่ = เขียน adapter ใหม่ 1 ตัว
 * ไม่ต้องแตะ business logic ส่วนกลาง (ดู broker-connections.service.ts)
 *
 * connect()/disconnect() ความหมายต่างกันตาม connectionMode:
 *  - PUSH (MT4/MT5): "connect" คือฝั่งเราออก/verify API key ให้ EA เอาไปใช้เอง
 *    ไม่ใช่ adapter เป็นฝ่าย initiate connection ออกไปหา broker (ดู BrokerConnectionsService.create())
 *  - PULL (Webull, Dime ในอนาคต): "connect" คือ OAuth flow จริงๆ ที่ adapter ต้องทำ
 *
 * Phase 2 ยังไม่มี adapter ตัวไหน implement logic จริง (ดู src/brokers/adapters/*) —
 * ไฟล์นี้มีไว้ตรึง contract ไว้ก่อนเท่านั้น
 */
export interface BrokerAdapter {
  readonly brokerType: BrokerType;
  readonly connectionMode: BrokerConnectionMode;

  connect(connectionId: number, credentials: unknown): Promise<void>;
  disconnect(connectionId: number): Promise<void>;

  getAccount(connectionId: number): Promise<BrokerAccountSnapshot>;
  getPositions(connectionId: number): Promise<BrokerPosition[]>;
  getOrders(connectionId: number): Promise<BrokerOrder[]>;
  getDeals(
    connectionId: number,
    range?: BrokerSyncRange,
  ): Promise<BrokerDeal[]>;

  /** trigger การ sync แบบเต็มรอบ — ใช้ตอน reconciliation/manual refresh */
  sync(connectionId: number): Promise<void>;

  getConnectionStatus(connectionId: number): Promise<BrokerConnectionHealth>;
}

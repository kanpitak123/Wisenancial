import { BrokerConnectionStatus, BrokerType } from '@prisma/client';

export { BrokerConnectionStatus, BrokerType };

/**
 * PUSH = broker เชื่อมเข้ามาเอง (EA ยิง event เข้า ingestion endpoint) — MT4/MT5
 * PULL = adapter ต้องไปดึงข้อมูลออกไปเอง (OAuth + polling/webhook) — Webull, Dime (อนาคต)
 *
 * ไม่เก็บเป็นคอลัมน์แยกใน broker_connections โดยตั้งใจ — เป็นค่าที่ derive ได้เสมอจาก
 * broker_type ล้วนๆ การเก็บซ้ำเป็นคอลัมน์จะเปิดช่องให้ข้อมูลสองแหล่งขัดกัน (เช่น broker_type
 * = MT5 แต่ connection_mode ถูกตั้งเป็น PULL ผิดๆ) โดยไม่มีประโยชน์เพิ่มเลย — ดู Phase 2
 * final report หัวข้อ "ตารางที่ตั้งใจไม่สร้าง" สำหรับเหตุผลเต็ม
 */
export type BrokerConnectionMode = 'PUSH' | 'PULL';

export function resolveConnectionMode(brokerType: BrokerType): BrokerConnectionMode {
  switch (brokerType) {
    case BrokerType.MT4:
    case BrokerType.MT5:
      return 'PUSH';
    case BrokerType.WEBULL:
    case BrokerType.DIME:
      return 'PULL';
  }
}

/**
 * โครงข้อมูลกลางที่ adapter ทุกตัวต้อง normalize ให้เป็นรูปแบบเดียวกัน — เป็น skeleton
 * เท่านั้นสำหรับ Phase 2 (พิสูจน์ว่า interface implement ได้จริง) ยังไม่ใช่ payload
 * สุดท้ายที่จะใช้จริงตอน implement adapter แต่ละตัว (MT4/MT5 มี field ต่างกันตาม §4-5 ของ
 * TRADING_PLATFORM_INTEGRATION_SPEC.md ต้องปรับตามข้อมูลจริงที่ EA ส่งได้ตอนนั้น)
 */
export interface BrokerAccountSnapshot {
  externalAccountId: string;
  broker: BrokerType;
  balance: number;
  equity: number;
  currency: string;
  // Phase 3 — เพิ่มเพื่อรองรับ MT5 account vitals เต็มรูปแบบ (§5B ของ Phase 3 design
  // review) ค่าพวกนี้ใช้แสดงผล connection-health/broker-snapshot เท่านั้น ไม่เคยเขียนทับ
  // portfolios.current_balance โดยตรง (ดู mt5-sync.service.ts)
  margin?: number;
  marginFree?: number;
  marginLevel?: number | null;
  credit?: number;
  leverage?: number | null;
  raw?: unknown;
}

export interface BrokerPosition {
  externalPositionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  profit: number | null;
  openedAt: Date;
  // Phase 3 — MT5 position fields (POSITION_SL/POSITION_TP/POSITION_SWAP)
  stopLoss?: number | null;
  takeProfit?: number | null;
  swap?: number;
  raw?: unknown;
}

export interface BrokerOrder {
  externalOrderId: string;
  symbol: string;
  orderType: string;
  status: string;
  raw?: unknown;
}

export type BrokerDealEntryType = 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';

export interface BrokerDeal {
  externalDealId: string;
  symbol: string;
  volume: number;
  price: number;
  profit: number;
  executedAt: Date;
  // Phase 3 — MT5 deal fields ที่จำเป็นสำหรับ position/partial-close model (ดู Phase 3
  // design review §4 "Idempotency design") — externalOrderId/externalPositionId เป็น
  // optional เพราะ BrokerDeal เป็น domain type กลางที่ broker อื่น (เช่น Webull) อาจไม่มี
  // concept นี้
  externalOrderId?: string | null;
  externalPositionId?: string;
  entryType?: BrokerDealEntryType;
  commission?: number;
  swap?: number;
  raw?: unknown;
}

export interface BrokerConnectionHealth {
  status: BrokerConnectionStatus;
  lastHeartbeatAt: Date | null;
  lastSyncAt: Date | null;
}

export interface BrokerSyncRange {
  from?: Date;
  to?: Date;
}

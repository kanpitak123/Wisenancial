import type { Trade, TradeResult, TradeSide, TradeSource } from '../types/trade.types';

export const TRADES_API_PATH = '/trades';

const BROKER_SYNC_SOURCES: readonly TradeSource[] = ['MT4_SYNC', 'MT5_SYNC', 'WEBULL_SYNC'];

/**
 * true สำหรับไม้ที่ EA/broker sync เข้ามาเอง (MT4/MT5/Webull) — field ที่เป็น "ความจริงของ
 * broker" (pair/trade_type/volume/open_price/close_price/timestamps) ต้อง readonly ใน UI
 * เสมอ ไม่ว่าไม้จะยัง OPEN หรือปิดไปแล้ว กันไม่ให้แก้มือแล้ว desync จากรอบ sync ถัดไป — ดู
 * TradesService.updateOpenTrade() ฝั่ง backend ที่บังคับกฎเดียวกันนี้อีกชั้นหนึ่ง
 */
export function isBrokerSyncedTrade(trade: Pick<Trade, 'source'>): boolean {
  return BROKER_SYNC_SOURCES.includes(trade.source);
}

export const TRADE_SIDES: readonly TradeSide[] = ['BUY', 'SELL'];

export const TRADE_RESULTS: readonly TradeResult[] = ['OPEN', 'WIN', 'LOSS', 'BREAKEVEN'];

export const TRADE_IMPORT = {
  maxFileSize: 5 * 1024 * 1024,
  acceptedExtension: '.csv',
  acceptedMimeTypes: ['text/csv', 'application/vnd.ms-excel'],
} as const;

export const TRADE_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Trader Portfolio',
  loadFailed: 'ไม่สามารถโหลดรายการเทรดได้',
  createFailed: 'ไม่สามารถบันทึกรายการเทรดได้',
  updateFailed: 'ไม่สามารถแก้ไขรายการเทรดได้',
  closeFailed: 'ไม่สามารถปิดรายการเทรดได้',
  deleteFailed: 'ไม่สามารถลบรายการเทรดได้',
  importFailed: 'ไม่สามารถนำเข้าประวัติการเทรดได้',
  pnlFailed: 'ไม่สามารถคำนวณ PnL ได้',
  leaderboardFailed: 'ไม่สามารถโหลด Leaderboard ได้',
  invalidCsv: 'รองรับเฉพาะไฟล์ CSV ขนาดไม่เกิน 5 MB',
} as const;

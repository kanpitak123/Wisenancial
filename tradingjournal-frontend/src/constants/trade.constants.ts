import type { TradeResult, TradeSide } from '../types/trade.types';

export const TRADES_API_PATH = '/trades';

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

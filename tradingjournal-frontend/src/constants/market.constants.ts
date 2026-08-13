import type { HistoricalInterval } from '../types/market.types';

export const MARKET_API_PATH = '/market';

export const MARKET_PRICES_API_PATH = '/market-prices';

export const MARKET_DATA_API_PATH = '/market-data';

export const MARKET_INTERVALS: readonly HistoricalInterval[] = ['1d', '1wk', '1mo'];

export const DEFAULT_MARKET_INTERVAL: HistoricalInterval = '1d';

export const DEFAULT_EARNINGS_DAYS_AHEAD = 14;

export const MAX_EARNINGS_DAYS_AHEAD = 365;

export const MARKET_MESSAGES = {
  quotesFailed: 'ไม่สามารถโหลดราคาตลาดได้',
  historyFailed: 'ไม่สามารถโหลดประวัติราคาได้',
  analysisFailed: 'ไม่สามารถโหลด Technical Analysis ได้',
  earningsFailed: 'ไม่สามารถโหลด Earnings Calendar ได้',
  cacheFailed: 'ไม่สามารถโหลด Market Cache ได้',
  storedPricesFailed: 'ไม่สามารถโหลดราคาที่บันทึกไว้ได้',
  syncSymbolFailed: 'ไม่สามารถอัปเดตราคาสินทรัพย์ได้',
  syncPortfolioFailed: 'ไม่สามารถอัปเดตราคาพอร์ตได้',
} as const;

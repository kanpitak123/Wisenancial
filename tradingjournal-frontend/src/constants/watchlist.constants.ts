export const WATCHLIST_API_PATH = '/watchlist';

export const WATCHLIST_DEFAULTS = {
  scope: 'ALL',
  currency: 'USD',
} as const;

export const WATCHLIST_MESSAGES = {
  portfolioRequired: 'กรุณาเลือก Portfolio ก่อน',
  loadFailed: 'ไม่สามารถโหลด Watchlist ได้',
  addFailed: 'ไม่สามารถเพิ่ม Watchlist ได้',
  removeFailed: 'ไม่สามารถลบ Watchlist ได้',
  checkFailed: 'ไม่สามารถตรวจสอบ Watchlist ได้',
} as const;

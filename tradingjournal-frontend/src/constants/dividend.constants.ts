export const DIVIDENDS_API_PATH = '/dividends';

export const DIVIDEND_DEFAULTS = {
  withholdingTaxRate: 0.1,
} as const;

export const DIVIDEND_MESSAGES = {
  portfolioRequired: 'ยังไม่ได้เลือก Investor Portfolio',
  loadFailed: 'โหลดเงินปันผลไม่สำเร็จ',
  createFailed: 'เพิ่มเงินปันผลไม่สำเร็จ',
  updateFailed: 'แก้ไขเงินปันผลไม่สำเร็จ',
  removeFailed: 'ยกเลิกเงินปันผลไม่สำเร็จ',
} as const;

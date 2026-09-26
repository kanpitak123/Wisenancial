import type { AiOutputLanguage } from './ai-prompt.shared';

/**
 * Display labels for the review metrics, per output language.
 *
 * Metric keys (`unrealizedProfitLoss_USD`) are for the model to read; they are not words a
 * user should ever see. The payload carries these labels next to the keys and the prompt
 * tells the model to use them verbatim, so "unrealized" is always the same Thai phrase
 * instead of whatever the model coins (or copies from the key or glossary).
 *
 * Keyed by the part of the metric key before the unit suffix (`_USD`, `_percent`, ...).
 */
const LABELS: Record<string, Record<AiOutputLanguage, string>> = {
  // investor, portfolio level
  portfolioValue: { th: 'มูลค่าพอร์ตรวม', en: 'total portfolio value' },
  cash: { th: 'เงินสด', en: 'cash' },
  holdingsMarketValue: {
    th: 'มูลค่าตลาดของหุ้นที่ถืออยู่',
    en: 'market value of holdings',
  },
  holdingsCostBasis: {
    th: 'ต้นทุนของหุ้นที่ถืออยู่',
    en: 'cost basis of holdings',
  },
  contributedCapital: {
    th: 'เงินทุนที่ใส่เข้ามา',
    en: 'contributed capital',
  },
  unrealizedProfitLoss: {
    th: 'กำไร/ขาดทุนที่ยังไม่รับรู้',
    en: 'unrealized P&L',
  },
  realizedProfitLoss: {
    th: 'กำไร/ขาดทุนที่รับรู้แล้ว',
    en: 'realized P&L',
  },
  dividendIncome: { th: 'รายได้เงินปันผล', en: 'dividend income' },
  totalProfitLoss: { th: 'กำไร/ขาดทุนรวม', en: 'total P&L' },
  totalReturn: { th: 'ผลตอบแทนรวม', en: 'total return' },
  openHoldings: { th: 'จำนวนหุ้นที่ถือ', en: 'number of holdings' },
  closedSales: {
    th: 'จำนวนการขายที่ปิดแล้ว',
    en: 'number of completed sales',
  },

  // investor, per holding
  sharesHeld: { th: 'จำนวนหุ้น', en: 'shares held' },
  averageCostPerShare: {
    th: 'ต้นทุนเฉลี่ยต่อหุ้น',
    en: 'average cost per share',
  },
  currentPrice: { th: 'ราคาปัจจุบัน', en: 'current price' },
  costBasis: { th: 'ต้นทุนรวม', en: 'cost basis' },
  marketValue: { th: 'มูลค่าตลาด', en: 'market value' },
  unrealizedReturn: {
    th: 'ผลตอบแทนที่ยังไม่รับรู้',
    en: 'unrealized return',
  },
  weightInHoldings: {
    th: 'สัดส่วนในพอร์ตหุ้น',
    en: 'weight in holdings',
  },

  // risk analysis (per holding)
  weightPercent: { th: 'สัดส่วนในพอร์ต', en: 'portfolio weight' },
  weight: { th: 'สัดส่วนในพอร์ต (เศษส่วน)', en: 'portfolio weight (fraction)' },
  quantity: { th: 'จำนวนหุ้น', en: 'quantity' },
  peRatio: { th: 'P/E', en: 'P/E' },
  beta: { th: 'เบต้า', en: 'beta' },
  debtToEquity: { th: 'หนี้สินต่อส่วนทุน (D/E)', en: 'debt-to-equity' },

  // trader
  currentBalance: { th: 'ยอดเงินในบัญชี', en: 'current balance' },
  initialBalance: { th: 'ยอดเงินเริ่มต้น', en: 'initial balance' },
  netProfitLoss: { th: 'กำไร/ขาดทุนสุทธิ', en: 'net P&L' },
  returnOnInitialBalance: {
    th: 'ผลตอบแทนต่อยอดเงินเริ่มต้น',
    en: 'return on initial balance',
  },
  totalTrades: { th: 'จำนวนเทรดที่ปิดแล้ว', en: 'number of closed trades' },
  wins: { th: 'เทรดที่ชนะ', en: 'winning trades' },
  losses: { th: 'เทรดที่แพ้', en: 'losing trades' },
  breakeven: { th: 'เทรดที่เสมอตัว', en: 'breakeven trades' },
  winRate: { th: 'อัตราชนะ', en: 'win rate' },
  profitFactor: { th: 'Profit Factor', en: 'profit factor' },
  averageProfitLossPerTrade: {
    th: 'กำไร/ขาดทุนเฉลี่ยต่อเทรด',
    en: 'average P&L per trade',
  },
};

/** The part of a metric key before its unit suffix: `totalReturn_percent` -> `totalReturn`. */
const baseKey = (key: string): string => key.split('_')[0] ?? key;

export function labelFor(key: string, language: AiOutputLanguage): string {
  return LABELS[baseKey(key)]?.[language] ?? baseKey(key);
}

/** metric key -> label, for every key given. */
export function labelsFor(
  keys: readonly string[],
  language: AiOutputLanguage,
): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, labelFor(key, language)]));
}

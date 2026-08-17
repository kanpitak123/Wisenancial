/**
 * ค่าพื้นฐานที่ mock ทุกโดเมนใช้ร่วมกัน
 *
 * ใช้ RNG แบบ seeded (ไม่ใช่ Math.random) เพื่อให้ตัวเลขคงที่ทุกครั้งที่รีเฟรช —
 * ถ้าสุ่มใหม่ทุกรอบ จะดูไม่ออกว่ากราฟเปลี่ยนเพราะแก้โค้ดหรือเพราะข้อมูลสุ่มใหม่
 */

/** mulberry32 — deterministic PRNG */
export function createRng(seed: number) {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** วันที่อ้างอิงของชุดข้อมูล mock — ยึดตามวันที่เปิดแอพ ข้อมูลจะได้ไม่ดูเก่า */
export const NOW = new Date();

export function isoDaysAgo(days: number, hour = 10): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function isoDaysAhead(days: number, hour = 14): string {
  return isoDaysAgo(-days, hour);
}

export function dateKeyDaysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** จำนวนวันในเดือนปัจจุบัน */
export const DAYS_IN_MONTH = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0).getDate();

export const MOCK_USER = {
  id: 1,
  username: 'mickdemo',
  full_name: 'Mick Demo',
  display_name: 'Mick Demo',
  email: 'demo@wisenancial.app',
  role: 'USER' as const,
  avatar_url: null,
  bio: 'Swing trader ฝั่ง Forex และนักลงทุนระยะยาวฝั่งหุ้นไทย',
  subscription_tier: 'PACK_279' as const,
  points_balance: 4820,
  ai_token_balance: 137,
  current_streak: 12,
  longest_streak: 28,
  created_at: isoDaysAgo(210),
  updated_at: isoDaysAgo(1),
};

/** id พอร์ตที่ใช้ทั้งระบบ mock */
export const TRADER_PORTFOLIO_ID = 1;
export const INVESTOR_PORTFOLIO_ID = 2;

export const FOREX_PAIRS = [
  'XAU/USD',
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'BTC/USD',
  'US30',
  'NAS100',
] as const;

export const STRATEGIES = [
  'breakout',
  'pullback',
  'reversal',
  'trendfollow',
  'smcict',
  'scalping',
] as const;

export const TRENDS = ['uptrend', 'downtrend', 'sideway'] as const;
export const EMOTIONS = ['confident', 'normal', 'fear', 'greed', 'revenge', 'bored'] as const;
export const ENTRY_REASONS = ['Support', 'Resistance', 'MA Cross', 'RSI', 'Pattern'] as const;

export interface MockStockSeed {
  symbol: string;
  name: string;
  exchange: 'NASDAQ' | 'NYSE' | 'SET';
  sector:
    | 'Technology'
    | 'Financials'
    | 'Energy'
    | 'Healthcare'
    | 'Consumer'
    | 'Industrials'
    | 'Communication';
  price: number;
  changePercent: number;
  marketCap: number;
  peRatio: number | null;
  dividendYield: number | null;
  volume: number;
}

export const STOCK_UNIVERSE: MockStockSeed[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    sector: 'Technology',
    price: 232.14,
    changePercent: 1.24,
    marketCap: 3_510_000_000_000,
    peRatio: 34.2,
    dividendYield: 0.44,
    volume: 48_120_000,
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    exchange: 'NASDAQ',
    sector: 'Technology',
    price: 438.9,
    changePercent: -0.62,
    marketCap: 3_260_000_000_000,
    peRatio: 36.8,
    dividendYield: 0.72,
    volume: 21_450_000,
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    exchange: 'NASDAQ',
    sector: 'Technology',
    price: 129.44,
    changePercent: 3.18,
    marketCap: 3_180_000_000_000,
    peRatio: 58.1,
    dividendYield: 0.03,
    volume: 302_800_000,
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    exchange: 'NASDAQ',
    sector: 'Communication',
    price: 178.32,
    changePercent: 0.87,
    marketCap: 2_190_000_000_000,
    peRatio: 24.6,
    dividendYield: 0.45,
    volume: 26_700_000,
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    exchange: 'NASDAQ',
    sector: 'Consumer',
    price: 201.55,
    changePercent: -1.05,
    marketCap: 2_110_000_000_000,
    peRatio: 41.3,
    dividendYield: null,
    volume: 38_900_000,
  },
  {
    symbol: 'META',
    name: 'Meta Platforms Inc.',
    exchange: 'NASDAQ',
    sector: 'Communication',
    price: 585.2,
    changePercent: 2.02,
    marketCap: 1_480_000_000_000,
    peRatio: 27.4,
    dividendYield: 0.35,
    volume: 14_200_000,
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    exchange: 'NASDAQ',
    sector: 'Consumer',
    price: 246.78,
    changePercent: -2.41,
    marketCap: 789_000_000_000,
    peRatio: 62.9,
    dividendYield: null,
    volume: 91_300_000,
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase & Co.',
    exchange: 'NYSE',
    sector: 'Financials',
    price: 224.16,
    changePercent: 0.41,
    marketCap: 631_000_000_000,
    peRatio: 12.8,
    dividendYield: 2.11,
    volume: 8_400_000,
  },
  {
    symbol: 'XOM',
    name: 'Exxon Mobil Corp.',
    exchange: 'NYSE',
    sector: 'Energy',
    price: 118.62,
    changePercent: 1.63,
    marketCap: 468_000_000_000,
    peRatio: 14.1,
    dividendYield: 3.26,
    volume: 15_700_000,
  },
  {
    symbol: 'JNJ',
    name: 'Johnson & Johnson',
    exchange: 'NYSE',
    sector: 'Healthcare',
    price: 156.84,
    changePercent: -0.28,
    marketCap: 377_000_000_000,
    peRatio: 22.5,
    dividendYield: 3.14,
    volume: 6_900_000,
  },
  {
    symbol: 'CAT',
    name: 'Caterpillar Inc.',
    exchange: 'NYSE',
    sector: 'Industrials',
    price: 392.4,
    changePercent: 0.94,
    marketCap: 189_000_000_000,
    peRatio: 17.2,
    dividendYield: 1.45,
    volume: 2_800_000,
  },
  {
    symbol: 'PTT',
    name: 'PTT Public Company Limited',
    exchange: 'SET',
    sector: 'Energy',
    price: 33.25,
    changePercent: 0.76,
    marketCap: 949_000_000_000,
    peRatio: 11.4,
    dividendYield: 5.82,
    volume: 42_600_000,
  },
  {
    symbol: 'AOT',
    name: 'Airports of Thailand',
    exchange: 'SET',
    sector: 'Industrials',
    price: 58.5,
    changePercent: -1.26,
    marketCap: 835_000_000_000,
    peRatio: 33.9,
    dividendYield: 1.18,
    volume: 28_400_000,
  },
  {
    symbol: 'CPALL',
    name: 'CP ALL Public Company Limited',
    exchange: 'SET',
    sector: 'Consumer',
    price: 61.75,
    changePercent: 1.44,
    marketCap: 554_000_000_000,
    peRatio: 24.1,
    dividendYield: 2.04,
    volume: 33_100_000,
  },
  {
    symbol: 'KBANK',
    name: 'Kasikornbank',
    exchange: 'SET',
    sector: 'Financials',
    price: 152.5,
    changePercent: 2.35,
    marketCap: 361_000_000_000,
    peRatio: 8.2,
    dividendYield: 5.41,
    volume: 19_800_000,
  },
  {
    symbol: 'ADVANC',
    name: 'Advanced Info Service',
    exchange: 'SET',
    sector: 'Communication',
    price: 289.0,
    changePercent: 0.35,
    marketCap: 859_000_000_000,
    peRatio: 22.7,
    dividendYield: 3.68,
    volume: 11_200_000,
  },
  {
    symbol: 'SCB',
    name: 'SCB X Public Company Limited',
    exchange: 'SET',
    sector: 'Financials',
    price: 118.0,
    changePercent: -0.84,
    marketCap: 397_000_000_000,
    peRatio: 8.9,
    dividendYield: 6.12,
    volume: 14_600_000,
  },
  {
    symbol: 'BDMS',
    name: 'Bangkok Dusit Medical Services',
    exchange: 'SET',
    sector: 'Healthcare',
    price: 26.5,
    changePercent: 1.92,
    marketCap: 421_000_000_000,
    peRatio: 28.3,
    dividendYield: 2.42,
    volume: 51_300_000,
  },
];

/** หุ้นที่ mock ว่าผู้ใช้ถืออยู่ในพอร์ต Investor */
export const HOLDINGS = [
  { symbol: 'AAPL', shares: 40, averageCost: 189.4 },
  { symbol: 'NVDA', shares: 120, averageCost: 96.2 },
  { symbol: 'PTT', shares: 5000, averageCost: 35.75 },
  { symbol: 'KBANK', shares: 800, averageCost: 132.0 },
  { symbol: 'ADVANC', shares: 300, averageCost: 264.5 },
] as const;

export function stockPrice(symbol: string): number {
  return STOCK_UNIVERSE.find((s) => s.symbol === symbol)?.price ?? 100;
}

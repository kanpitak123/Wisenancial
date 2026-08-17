import type { Asset, ChartDataPoint } from 'src/types/asset.types';
import { defineMockRoutes } from '../mock.types';
import {
  FOREX_PAIRS,
  TRADER_PORTFOLIO_ID,
  createRng,
  dateKeyDaysAgo,
  isoDaysAgo,
  round,
  stockPrice,
} from '../data/seed';
import {
  ACTIVE_TRADES,
  ALL_TRADES,
  CLOSED_TRADES,
  TRADER_CURRENT_BALANCE,
  TRADER_INITIAL_BALANCE,
} from '../data/trader.data';
import { isInvestorPortfolio } from '../data/portfolios.data';
import { INVESTOR_HOLDINGS } from '../data/investor.data';

const ASSETS: Asset[] = FOREX_PAIRS.map((symbol, index) => ({
  id: index + 1,
  symbol,
  name: symbol,
  asset_type: symbol.includes('/') ? 'FOREX' : 'INDEX',
  portfolio_type: 'TRADER' as const,
  market_region: 'GLOBAL',
  sector: null,
  exchange: 'OTC',
  currency: 'USD',
  is_active: true,
}));

/** asset ของพอร์ตหุ้น = ตัวที่ถืออยู่จริง ตามที่ assets.service.ts สาขา INVESTOR ทำ */
const INVESTOR_ASSETS: Asset[] = INVESTOR_HOLDINGS.map((holding, index) => ({
  id: 1000 + index,
  symbol: holding.symbol,
  name: holding.name ?? null,
  asset_type: 'STOCK',
  portfolio_type: 'INVESTOR' as const,
  market_region: holding.currency === 'THB' ? 'TH' : 'GLOBAL',
  sector: null,
  exchange: holding.currency === 'THB' ? 'SET' : 'NASDAQ',
  currency: holding.currency,
  is_active: true,
}));

/** ราคาอ้างอิงต่อสัญลักษณ์ ให้กราฟกับ quote ตรงกัน */
const BASE_PRICE: Record<string, number> = {
  'XAU/USD': 2412.5,
  'EUR/USD': 1.0872,
  'GBP/USD': 1.2734,
  'USD/JPY': 154.82,
  'BTC/USD': 68420,
  US30: 39280,
  NAS100: 18640,
};

function basePrice(symbol: string): number {
  return BASE_PRICE[symbol] ?? stockPrice(symbol);
}

/** แท่งเทียนรายวันย้อนหลัง — deterministic ต่อ symbol */
function buildCandles(symbol: string, days = 180): ChartDataPoint[] {
  const seed = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rng = createRng(seed * 7919);
  const points: ChartDataPoint[] = [];

  let close = basePrice(symbol) * 0.88;
  const volatility = symbol === 'BTC/USD' ? 0.028 : 0.009;

  for (let day = days; day >= 0; day -= 1) {
    const open = close;
    const drift = (rng() - 0.46) * volatility;
    close = round(open * (1 + drift), 4);

    const high = round(Math.max(open, close) * (1 + rng() * volatility * 0.6), 4);
    const low = round(Math.min(open, close) * (1 - rng() * volatility * 0.6), 4);

    points.push({
      time: dateKeyDaysAgo(day),
      open,
      high,
      low,
      close,
      value: close,
    });
  }

  return points;
}

export const traderRoutes = defineMockRoutes([
  // ---------- Trades ----------
  {
    method: 'GET',
    path: '/trades/portfolio/:portfolioId',
    // backend จริงกรอง portfolio_type = TRADER — ยิงด้วย id ของพอร์ตหุ้นต้องได้ลิสต์ว่าง
    handler: (ctx) => (isInvestorPortfolio(ctx.params.portfolioId) ? [] : ALL_TRADES),
  },
  {
    method: 'GET',
    path: '/trades/active',
    handler: () => ACTIVE_TRADES,
  },
  {
    method: 'POST',
    path: '/trades/calculate-pnl',
    handler: (ctx) => {
      const direction = ctx.body.trade_type === 'SELL' ? -1 : 1;
      const open = Number(ctx.body.open_price ?? 0);
      const close = Number(ctx.body.close_price ?? 0);
      const volume = Number(ctx.body.volume ?? 0);
      const contractSize = Number(ctx.body.contract_size ?? 100_000);
      const commission = Number(ctx.body.commission ?? 0);
      const swap = Number(ctx.body.swap ?? 0);

      const priceDifference = round((close - open) * direction, 5);
      const gross = round(priceDifference * volume * contractSize);
      const net = round(gross - Math.abs(commission) + swap);

      return {
        direction,
        price_difference: priceDifference,
        volume,
        contract_size: contractSize,
        gross_pnl: gross,
        commission_cost: Math.abs(commission),
        swap,
        net_pnl: net,
        result_status: net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN',
      };
    },
  },
  {
    method: 'POST',
    path: '/trades/portfolio/:portfolioId',
    handler: (ctx) => ({ ...CLOSED_TRADES[0], id: Date.now() % 100000, ...ctx.body }),
  },
  {
    method: 'POST',
    path: '/trades/portfolio/:portfolioId/active',
    handler: (ctx) => ({ ...ACTIVE_TRADES[0], id: Date.now() % 100000, ...ctx.body }),
  },
  {
    method: 'POST',
    path: '/trades/portfolio/:portfolioId/import',
    handler: () => ({ success: true, imported_count: 24, skipped_count: 3, import_id: 12 }),
  },
  {
    method: 'PATCH',
    path: '/trades/:id',
    handler: (ctx) => ({ ...CLOSED_TRADES[0], id: Number(ctx.params.id), ...ctx.body }),
  },
  {
    method: 'PATCH',
    path: '/trades/:id/close',
    handler: (ctx) => ({
      ...ACTIVE_TRADES[0],
      id: Number(ctx.params.id),
      ...ctx.body,
      result_status: 'WIN',
      closed_at: isoDaysAgo(0),
    }),
  },
  {
    method: 'DELETE',
    path: '/trades/:id',
    handler: (ctx) => ({ message: 'ลบเทรดแล้ว (mock)', deleted_id: Number(ctx.params.id) }),
  },
  {
    method: 'GET',
    path: '/trades/leaderboard',
    handler: () =>
      [
        { username: 'ProTraderTH', initial: 10_000, current: 28_450, win: 71.2 },
        { username: 'GoldScalper', initial: 5_000, current: 13_180, win: 64.8 },
        { username: 'SwingKing', initial: 25_000, current: 41_920, win: 58.4 },
        {
          username: 'mickdemo',
          initial: TRADER_INITIAL_BALANCE,
          current: TRADER_CURRENT_BALANCE,
          win: 58.3,
        },
        { username: 'RiskManagerX', initial: 8_000, current: 11_240, win: 55.1 },
        { username: 'NightOwlFX', initial: 3_000, current: 4_060, win: 52.7 },
        { username: 'ChartWizard', initial: 15_000, current: 16_890, win: 49.3 },
        { username: 'DCAforever', initial: 20_000, current: 20_410, win: 47.8 },
      ].map((row) => ({
        username: row.username,
        initial_balance: row.initial,
        current_balance: row.current,
        win_rate: row.win,
        total_pnl: round(row.current - row.initial),
      })),
  },

  // ---------- Assets (Asset Explorer) ----------
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId',
    // backend แยกสองสาขาตาม portfolio_type — พอร์ตหุ้นได้ asset ที่ถืออยู่จริง ไม่ใช่คู่เงิน
    handler: (ctx) => (isInvestorPortfolio(ctx.params.portfolioId) ? INVESTOR_ASSETS : ASSETS),
  },
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/chart',
    handler: (ctx) => buildCandles(ctx.query.symbol ?? 'XAU/USD'),
  },
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/:assetId/monthly',
    handler: (ctx) => {
      const asset = ASSETS.find((a) => a.id === Number(ctx.params.assetId)) ?? ASSETS[0];
      const candles = buildCandles(asset?.symbol ?? 'XAU/USD', 360);

      return candles
        .filter((_, index) => index % 30 === 0)
        .map((point, index) => ({
          id: index + 1,
          asset_id: asset?.id ?? 1,
          record_date: point.time,
          open_price: point.open ?? point.close,
          high_price: point.high ?? point.close,
          low_price: point.low ?? point.close,
          close_price: point.close,
          volume: 1_200_000 + index * 45_000,
        }));
    },
  },

  // ---------- Market prices / history / technical ----------
  {
    method: 'GET',
    path: '/market/prices',
    handler: (ctx) => {
      const symbols = (ctx.query.symbols ?? '').split(',').filter(Boolean);
      const result: Record<string, number> = {};

      for (const symbol of symbols) {
        result[symbol] = round(basePrice(symbol), 4);
      }

      return result;
    },
  },
  {
    method: 'GET',
    path: '/market/history/:symbol',
    handler: (ctx) =>
      buildCandles(decodeURIComponent(ctx.params.symbol ?? 'XAU/USD')).map((point) => ({
        date: point.time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: 850_000,
      })),
  },
  {
    method: 'GET',
    path: '/market/analysis/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'XAU/USD');
      const price = basePrice(symbol);

      return {
        symbol,
        rsi: 58.4,
        resistance1: round(price * 1.012, 4),
        resistance2: round(price * 1.026, 4),
        support1: round(price * 0.988, 4),
        support2: round(price * 0.974, 4),
        aiSummary: {
          th: 'ราคายังอยู่เหนือเส้นค่าเฉลี่ย 50 วัน โมเมนตัมเป็นบวกแต่ RSI เริ่มเข้าเขตซื้อมากเกินไป แนะนำรอย่อเข้าใกล้แนวรับแรกก่อนเข้า',
          en: 'Price holds above the 50-day average with positive momentum, though RSI is approaching overbought. Waiting for a pullback toward the first support is preferable.',
        },
        trend: 'bullish',
        confidence: 72,
        currentPrice: price,
        lastUpdated: isoDaysAgo(0),
      };
    },
  },
  {
    method: 'GET',
    path: '/market/earnings-calendar',
    handler: () => ({
      from: dateKeyDaysAgo(0),
      to: dateKeyDaysAgo(-14),
      items: [
        {
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          earningsDate: isoDaysAgo(-3),
          epsEstimate: 2.34,
          epsActual: null,
        },
        {
          symbol: 'NVDA',
          companyName: 'NVIDIA Corp.',
          earningsDate: isoDaysAgo(-8),
          epsEstimate: 0.72,
          epsActual: null,
        },
        {
          symbol: 'PTT',
          companyName: 'PTT PCL',
          earningsDate: isoDaysAgo(-11),
          epsEstimate: 1.05,
          epsActual: null,
        },
      ],
    }),
  },
  {
    method: 'GET',
    path: '/market/cache',
    handler: () => ({ size: 42, symbols: [...FOREX_PAIRS], ttlMs: 60_000 }),
  },
  {
    method: 'GET',
    path: '/market-prices',
    handler: () =>
      FOREX_PAIRS.map((symbol, index) => ({
        id: index + 1,
        symbol,
        currency: 'USD',
        price: round(basePrice(symbol), 4),
        price_date: dateKeyDaysAgo(0),
        source: 'mock',
      })),
  },
  {
    method: 'POST',
    path: '/market-data/sync/portfolio/:portfolioId',
    handler: () => ({ requested: 7, updated: 7, failed: 0, prices: [], failures: [] }),
  },
  {
    method: 'POST',
    path: '/market-data/sync/symbol/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'XAU/USD');
      return {
        symbol,
        currency: 'USD',
        price: round(basePrice(symbol), 4),
        price_date: dateKeyDaysAgo(0),
        source: 'mock',
      };
    },
  },
]);

export { buildCandles, basePrice, TRADER_PORTFOLIO_ID };

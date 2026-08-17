import type { Trade } from 'src/types/trade.types';
import type { PortfolioRecord } from 'src/types/records.types';
import {
  EMOTIONS,
  ENTRY_REASONS,
  FOREX_PAIRS,
  STRATEGIES,
  TRADER_PORTFOLIO_ID,
  TRENDS,
  createRng,
  isoDaysAgo,
  pick,
  round,
} from './seed';

const TRADE_COUNT = 96;
const TRADE_HISTORY_DAYS = 120;

export const TRADER_INITIAL_BALANCE = 10_000;

function buildTrades(): Trade[] {
  const rng = createRng(20260815);
  const trades: Trade[] = [];

  for (let i = 0; i < TRADE_COUNT; i += 1) {
    const pair = pick(rng, FOREX_PAIRS);
    const isWin = rng() < 0.58; // win rate ~58% ให้ดูสมจริง ไม่ใช่กราฟขาขึ้นตลอด
    const magnitude = isWin ? 40 + rng() * 260 : 25 + rng() * 180;
    const pnl = round(isWin ? magnitude : -magnitude);

    // กระจายวันย้อนหลังแบบเรียงจากเก่าไปใหม่
    const daysAgo = Math.round(TRADE_HISTORY_DAYS - (i / TRADE_COUNT) * TRADE_HISTORY_DAYS);
    const openedAt = isoDaysAgo(daysAgo, 9 + Math.floor(rng() * 10));
    const closedAt = isoDaysAgo(daysAgo, 11 + Math.floor(rng() * 8));

    const openPrice = round(1 + rng() * 2400, 4);
    const closePrice = round(openPrice * (1 + (isWin ? 1 : -1) * rng() * 0.01), 4);

    trades.push({
      id: i + 1,
      user_id: 1,
      portfolio_id: TRADER_PORTFOLIO_ID,
      import_id: null,
      broker: rng() < 0.3 ? 'EXNESS' : null,
      account_id: null,
      ticket_id: null,
      source: rng() < 0.3 ? 'import' : 'manual',
      pair,
      trade_type: rng() < 0.5 ? 'BUY' : 'SELL',
      volume: round(0.05 + rng() * 1.2, 2),
      open_price: openPrice,
      close_price: closePrice,
      stop_loss: null,
      take_profit: null,
      commission: round(-(rng() * 4), 2),
      swap: 0,
      pnl,
      result_status: isWin ? 'WIN' : 'LOSS',
      opened_at: openedAt,
      closed_at: closedAt,
      timeframe: pick(rng, ['M15', 'H1', 'H4', 'D1']),
      trend: pick(rng, TRENDS),
      strategy: pick(rng, STRATEGIES),
      emotion: pick(rng, EMOTIONS),
      entry_reason: pick(rng, ENTRY_REASONS),
      note: isWin ? 'เข้าตามแผน รอ confirm แท่งปิด' : 'เข้าเร็วไป ไม่รอ retest',
      asset_name: pair,
      rsi: Math.round(30 + rng() * 40),
      macd: null,
      target_points: null,
      created_at: openedAt,
      updated_at: closedAt,
    });
  }

  return trades;
}

/** เทรดที่ยังเปิดค้างอยู่ (result_status = OPEN, ไม่มี close_price/pnl) */
function buildActiveTrades(): Trade[] {
  const rng = createRng(77001);

  return ['XAU/USD', 'EUR/USD', 'NAS100', 'BTC/USD'].map((pair, index) => {
    const openPrice = round(1 + rng() * 2400, 4);

    return {
      id: 900 + index,
      user_id: 1,
      portfolio_id: TRADER_PORTFOLIO_ID,
      import_id: null,
      broker: null,
      account_id: null,
      ticket_id: null,
      source: 'manual',
      pair,
      trade_type: rng() < 0.5 ? 'BUY' : 'SELL',
      volume: round(0.1 + rng() * 0.9, 2),
      open_price: openPrice,
      close_price: null,
      stop_loss: round(openPrice * 0.99, 4),
      take_profit: round(openPrice * 1.02, 4),
      commission: 0,
      swap: 0,
      pnl: null,
      result_status: 'OPEN',
      opened_at: isoDaysAgo(index + 1, 9),
      closed_at: null,
      timeframe: pick(rng, ['H1', 'H4', 'D1']),
      trend: pick(rng, TRENDS),
      strategy: pick(rng, STRATEGIES),
      emotion: 'confident',
      entry_reason: pick(rng, ENTRY_REASONS),
      note: 'ถือรอ TP',
      asset_name: pair,
      rsi: Math.round(40 + rng() * 25),
      macd: null,
      target_points: null,
      created_at: isoDaysAgo(index + 1, 9),
      updated_at: isoDaysAgo(0, 9),
    } satisfies Trade;
  });
}

export const CLOSED_TRADES: Trade[] = buildTrades();
export const ACTIVE_TRADES: Trade[] = buildActiveTrades();
export const ALL_TRADES: Trade[] = [...CLOSED_TRADES, ...ACTIVE_TRADES];

export const TOTAL_PNL = round(
  CLOSED_TRADES.reduce((sum, trade) => sum + Number(trade.pnl ?? 0), 0),
);

export const TRADER_CURRENT_BALANCE = round(TRADER_INITIAL_BALANCE + TOTAL_PNL + 2_500);

/** ยอดสะสมรายวันจากเทรดที่ปิดแล้ว — ใช้ทั้ง analytics และปฏิทินใน Dashboard */
export function dailyPnlMap(): Record<string, number> {
  const map: Record<string, number> = {};

  for (const trade of CLOSED_TRADES) {
    const key = (trade.closed_at ?? trade.opened_at ?? '').slice(0, 10);
    if (!key) continue;
    map[key] = round((map[key] ?? 0) + Number(trade.pnl ?? 0));
  }

  return map;
}

/** ledger ฝั่ง Trader — ฝากเงิน 2 ครั้ง + PnL ของทุกเทรด */
export function traderRecords(): PortfolioRecord[] {
  const records: PortfolioRecord[] = [
    {
      id: 1,
      portfolio_id: TRADER_PORTFOLIO_ID,
      type: 'DEPOSIT',
      amount: TRADER_INITIAL_BALANCE,
      currency: 'USD',
      description: 'เงินทุนตั้งต้น',
      source: 'MANUAL',
      source_id: null,
      occurred_at: isoDaysAgo(130),
      status: 'ACTIVE',
      reversal_of_id: null,
      transfer_group_id: null,
      created_by_user_id: 1,
      created_at: isoDaysAgo(130),
      updated_at: isoDaysAgo(130),
    },
    {
      id: 2,
      portfolio_id: TRADER_PORTFOLIO_ID,
      type: 'DEPOSIT',
      amount: 2_500,
      currency: 'USD',
      description: 'เติมทุนเพิ่มรอบเดือน',
      source: 'MANUAL',
      source_id: null,
      occurred_at: isoDaysAgo(45),
      status: 'ACTIVE',
      reversal_of_id: null,
      transfer_group_id: null,
      created_by_user_id: 1,
      created_at: isoDaysAgo(45),
      updated_at: isoDaysAgo(45),
    },
  ];

  CLOSED_TRADES.forEach((trade, index) => {
    records.push({
      id: 100 + index,
      portfolio_id: TRADER_PORTFOLIO_ID,
      type: 'TRADE_PNL',
      amount: Number(trade.pnl ?? 0),
      currency: 'USD',
      description: `${trade.pair} · ${trade.result_status}`,
      source: 'TRADE',
      source_id: trade.id,
      occurred_at: trade.closed_at ?? trade.opened_at ?? isoDaysAgo(1),
      status: 'ACTIVE',
      reversal_of_id: null,
      transfer_group_id: null,
      created_by_user_id: 1,
      created_at: trade.closed_at ?? isoDaysAgo(1),
      updated_at: trade.closed_at ?? isoDaysAgo(1),
    });
  });

  return records.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

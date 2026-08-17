/**
 * lot การซื้อหุ้นแบบ mutable — ให้ mock ของ buy/sell เขียนกลับได้จริง
 *
 * หน้า StockRecord อ่านแถวดิบจาก /stock-purchases/portfolio/:id (ไม่ใช่ read model
 * ที่รวมยอดตามสัญลักษณ์) เพราะต้องใช้ folder_name / target_price / stop_loss
 */
import type { StockPurchase } from 'src/types/investor-portfolio.types';
import { asString } from '../mock.types';
import { INVESTOR_PORTFOLIO_ID, isoDaysAgo, round, stockPrice } from './seed';
import { INVESTOR_HOLDINGS } from './investor.data';

const FOLDERS = ['หุ้นปันผล', 'เติบโตระยะยาว', ''];

export const MOCK_PURCHASES: StockPurchase[] = INVESTOR_HOLDINGS.map((holding, index) => {
  const price = holding.average_cost;

  return {
    id: index + 1,
    portfolio_id: INVESTOR_PORTFOLIO_ID,
    stock_symbol: holding.symbol,
    stock_name: holding.name ?? holding.symbol,
    shares_count: holding.shares,
    remaining_shares: holding.shares,
    purchase_price: price,
    total_amount: round(holding.shares * price),
    fees: round(holding.shares * price * 0.0015),
    currency: holding.currency,
    purchase_reason: index % 2 === 0 ? 'ปันผลสม่ำเสมอและงบแข็งแรง' : null,
    expectation: index % 2 === 0 ? 'ถือยาว 3-5 ปี' : null,
    target_price: index % 3 === 0 ? round(price * 1.25) : null,
    stop_loss: index % 3 === 0 ? round(price * 0.85) : null,
    strategy: index % 2 === 0 ? 'dividend' : 'growth',
    emotion: 'confident',
    notes: null,
    folder_name: FOLDERS[index % FOLDERS.length] || null,
    status: 'OPEN',
    sold_price: null,
    sold_date: null,
    closed_at: null,
    purchase_date: isoDaysAgo(120 - index * 12),
    created_at: isoDaysAgo(120 - index * 12),
    updated_at: isoDaysAgo(1),
  };
});

let nextId = MOCK_PURCHASES.length + 1;

export function addMockPurchase(body: Record<string, unknown>): StockPurchase {
  const symbol = asString(body.stock_symbol, 'AAPL').toUpperCase();
  const sharesCount = Number(body.shares_count ?? 0);
  const price = Number(body.purchase_price ?? stockPrice(symbol));
  const fees = Number(body.fees ?? 0);

  const purchase: StockPurchase = {
    id: nextId++,
    portfolio_id: INVESTOR_PORTFOLIO_ID,
    stock_symbol: symbol,
    stock_name: typeof body.stock_name === 'string' ? body.stock_name : symbol,
    shares_count: sharesCount,
    remaining_shares: sharesCount,
    purchase_price: price,
    total_amount: round(sharesCount * price + fees),
    fees,
    currency: typeof body.currency === 'string' ? body.currency : 'THB',
    purchase_reason: typeof body.purchase_reason === 'string' ? body.purchase_reason : null,
    expectation: typeof body.expectation === 'string' ? body.expectation : null,
    target_price: body.target_price === undefined ? null : Number(body.target_price),
    stop_loss: body.stop_loss === undefined ? null : Number(body.stop_loss),
    strategy: typeof body.strategy === 'string' ? body.strategy : null,
    emotion: typeof body.emotion === 'string' ? body.emotion : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    folder_name: typeof body.folder_name === 'string' && body.folder_name ? body.folder_name : null,
    status: 'OPEN',
    sold_price: null,
    sold_date: null,
    closed_at: null,
    purchase_date:
      typeof body.purchase_date === 'string' ? body.purchase_date : isoDaysAgo(0),
    created_at: isoDaysAgo(0),
    updated_at: isoDaysAgo(0),
  };

  MOCK_PURCHASES.unshift(purchase);

  return purchase;
}

/** ตัด remaining_shares ตามลำดับ FIFO แล้วปิด lot ที่หมด */
export function applyMockSale(body: Record<string, unknown>): {
  sold: number;
  closedLots: number;
} {
  const symbol = asString(body.stock_symbol).toUpperCase();
  let remaining = Number(body.shares_count ?? 0);
  let closedLots = 0;

  const lots = MOCK_PURCHASES.filter(
    (lot) => lot.stock_symbol === symbol && lot.status === 'OPEN',
  ).sort(
    (a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime(),
  );

  for (const lot of lots) {
    if (remaining <= 0) break;

    const available = Number(lot.remaining_shares);
    const take = Math.min(available, remaining);

    lot.remaining_shares = round(available - take, 4);
    remaining -= take;

    if (Number(lot.remaining_shares) <= 0) {
      lot.status = 'CLOSED';
      lot.sold_price = Number(body.sold_price ?? 0);
      lot.sold_date = typeof body.sold_date === 'string' ? body.sold_date : isoDaysAgo(0);
      lot.closed_at = lot.sold_date;
      closedLots += 1;
    }
  }

  return { sold: Number(body.shares_count ?? 0) - Math.max(0, remaining), closedLots };
}

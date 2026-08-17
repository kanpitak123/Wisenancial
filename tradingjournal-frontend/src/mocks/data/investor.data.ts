import type { Dividend } from 'src/types/dividend.types';
import type {
  InvestorActivity,
  InvestorDashboard,
  InvestorHolding,
  InvestorPerformancePoint,
  InvestorSale,
} from 'src/types/investor-portfolio.types';
import type { PortfolioRecord } from 'src/types/records.types';
import {
  HOLDINGS,
  INVESTOR_PORTFOLIO_ID,
  STOCK_UNIVERSE,
  createRng,
  isoDaysAgo,
  round,
  stockPrice,
} from './seed';

export const INVESTOR_INITIAL_BALANCE = 500_000;
export const INVESTOR_CASH = 128_400;

function stockName(symbol: string): string {
  return STOCK_UNIVERSE.find((s) => s.symbol === symbol)?.name ?? symbol;
}

function currencyOf(symbol: string): string {
  return STOCK_UNIVERSE.find((s) => s.symbol === symbol)?.exchange === 'SET' ? 'THB' : 'USD';
}

export const INVESTOR_HOLDINGS: InvestorHolding[] = HOLDINGS.map((holding) => {
  const marketPrice = stockPrice(holding.symbol);
  const costBasis = round(holding.shares * holding.averageCost);
  const marketValue = round(holding.shares * marketPrice);
  const unrealized = round(marketValue - costBasis);

  return {
    symbol: holding.symbol,
    name: stockName(holding.symbol),
    currency: currencyOf(holding.symbol),
    shares: holding.shares,
    average_cost: holding.averageCost,
    cost_basis: costBasis,
    market_price: marketPrice,
    market_value: marketValue,
    unrealized_pnl: unrealized,
    unrealized_percent: costBasis === 0 ? 0 : round((unrealized / costBasis) * 100),
  };
});

export const INVESTED_COST = round(INVESTOR_HOLDINGS.reduce((sum, h) => sum + h.cost_basis, 0));

export const MARKET_VALUE = round(
  INVESTOR_HOLDINGS.reduce((sum, h) => sum + (h.market_value ?? 0), 0),
);

export const UNREALIZED_PNL = round(MARKET_VALUE - INVESTED_COST);

export const INVESTOR_SALES: InvestorSale[] = [
  {
    id: 1,
    portfolio_id: INVESTOR_PORTFOLIO_ID,
    stock_symbol: 'TSLA',
    shares_count: 25,
    sold_price: 268.4,
    gross_amount: 6710,
    fees: 12.5,
    cost_basis: 5890,
    realized_pnl: 807.5,
    cost_method: 'FIFO',
    sold_date: isoDaysAgo(38),
    notes: 'ขายทำกำไรบางส่วน',
  },
  {
    id: 2,
    portfolio_id: INVESTOR_PORTFOLIO_ID,
    stock_symbol: 'CPALL',
    shares_count: 1200,
    sold_price: 58.25,
    gross_amount: 69_900,
    fees: 105,
    cost_basis: 73_200,
    realized_pnl: -3405,
    cost_method: 'FIFO',
    sold_date: isoDaysAgo(64),
    notes: 'ตัดขาดทุน ปรับพอร์ต',
  },
];

export const REALIZED_PNL = round(
  INVESTOR_SALES.reduce((sum, sale) => sum + Number(sale.realized_pnl ?? 0), 0),
);

export const DIVIDENDS: Dividend[] = [
  { symbol: 'PTT', shares: 5000, dps: 2.0, days: 20 },
  { symbol: 'KBANK', shares: 800, dps: 6.5, days: 52 },
  { symbol: 'ADVANC', shares: 300, dps: 5.2, days: 88 },
  { symbol: 'AAPL', shares: 40, dps: 0.25, days: 34 },
  { symbol: 'PTT', shares: 5000, dps: 1.1, days: 190 },
].map((item, index) => {
  const gross = round(item.shares * item.dps);
  // backend เก็บ wht_rate เป็นสัดส่วน 0-1 ไม่ใช่เปอร์เซ็นต์ (CreateDividendDto: @Min(0) @Max(1))
  const whtRate = 0.1;
  const tax = round(gross * whtRate);

  return {
    id: index + 1,
    user_id: 1,
    portfolio_id: INVESTOR_PORTFOLIO_ID,
    symbol: item.symbol,
    name: stockName(item.symbol),
    payment_date: isoDaysAgo(item.days),
    shares: item.shares,
    dividend_per_share: item.dps,
    wht_rate: whtRate,
    gross_amount: gross,
    tax_withheld: tax,
    net_amount: round(gross - tax),
    status: 'ACTIVE' as const,
    created_at: isoDaysAgo(item.days),
    updated_at: isoDaysAgo(item.days),
  };
});

export const DIVIDEND_INCOME = round(DIVIDENDS.reduce((sum, d) => sum + Number(d.net_amount), 0));

export const PORTFOLIO_VALUE = round(INVESTOR_CASH + MARKET_VALUE);

export const INVESTOR_TOTAL_PNL = round(REALIZED_PNL + UNREALIZED_PNL + DIVIDEND_INCOME);

export const INVESTOR_ACTIVITY: InvestorActivity[] = [
  ...INVESTOR_HOLDINGS.map((holding, index) => ({
    id: 200 + index,
    type: 'STOCK_BUY',
    amount: -holding.cost_basis,
    symbol: holding.symbol,
    description: `ซื้อ ${holding.symbol} ${holding.shares} หุ้น @ ${holding.average_cost}`,
    occurred_at: isoDaysAgo(120 - index * 12),
    source: 'STOCK_PURCHASE',
    status: 'ACTIVE',
  })),
  ...INVESTOR_SALES.map((sale, index) => ({
    id: 300 + index,
    type: 'STOCK_SELL',
    amount: Number(sale.gross_amount ?? 0),
    symbol: sale.stock_symbol,
    description: `ขาย ${sale.stock_symbol} ${String(sale.shares_count)} หุ้น`,
    occurred_at: sale.sold_date,
    source: 'STOCK_PURCHASE',
    status: 'ACTIVE',
  })),
  ...DIVIDENDS.map((dividend, index) => ({
    id: 400 + index,
    type: 'DIVIDEND',
    amount: Number(dividend.net_amount),
    symbol: dividend.symbol,
    description: `ปันผล ${dividend.symbol}`,
    occurred_at: dividend.payment_date,
    source: 'DIVIDEND',
    status: 'ACTIVE',
  })),
].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

export const INVESTOR_DASHBOARD: InvestorDashboard = {
  portfolio: {
    id: INVESTOR_PORTFOLIO_ID,
    name: 'Long-Term Stock',
    currency: 'THB',
  },
  summary: {
    cash: INVESTOR_CASH,
    invested_cost: INVESTED_COST,
    market_value: MARKET_VALUE,
    portfolio_value: PORTFOLIO_VALUE,
    realized_pnl: REALIZED_PNL,
    unrealized_pnl: UNREALIZED_PNL,
    dividends: DIVIDEND_INCOME,
    total_pnl: INVESTOR_TOTAL_PNL,
    total_return_percent:
      INVESTED_COST === 0 ? 0 : round((INVESTOR_TOTAL_PNL / INVESTED_COST) * 100),
    open_holdings: INVESTOR_HOLDINGS.length,
    closed_sales: INVESTOR_SALES.length,
  },
  holdings: INVESTOR_HOLDINGS,
  recent_activity: INVESTOR_ACTIVITY.slice(0, 12),
};

/** เส้นมูลค่าพอร์ตรายวันย้อนหลัง 180 วัน */
export function investorPerformance(): InvestorPerformancePoint[] {
  const rng = createRng(31337);
  const points: InvestorPerformancePoint[] = [];
  let value = INVESTOR_INITIAL_BALANCE;

  for (let day = 180; day >= 0; day -= 1) {
    value = value * (1 + (rng() - 0.47) * 0.011);

    points.push({
      date: isoDaysAgo(day).slice(0, 10),
      value: round(value),
      cash: INVESTOR_CASH,
    });
  }

  // ปิดท้ายให้ตรงกับมูลค่าพอร์ตจริงในหน้า dashboard
  const last = points[points.length - 1];
  if (last) last.value = PORTFOLIO_VALUE;

  return points;
}

export function investorRecords(): PortfolioRecord[] {
  return INVESTOR_ACTIVITY.map((activity, index) => ({
    id: 500 + index,
    portfolio_id: INVESTOR_PORTFOLIO_ID,
    type: activity.type as PortfolioRecord['type'],
    amount: Number(activity.amount),
    currency: 'THB',
    description: activity.description ?? null,
    source: (activity.source ?? 'SYSTEM') as PortfolioRecord['source'],
    source_id: null,
    occurred_at: activity.occurred_at,
    status: 'ACTIVE',
    reversal_of_id: null,
    transfer_group_id: null,
    created_by_user_id: 1,
    created_at: activity.occurred_at,
    updated_at: activity.occurred_at,
  }));
}

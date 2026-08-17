import type {
  BehavioralAnalytics,
  MonthlyGrowthPoint,
  PerformancePoint,
  PerformanceStat,
  WinRateBreakdown,
} from 'src/types/analytics.types';
import type { Trade } from 'src/types/trade.types';
import { asString, defineMockRoutes } from '../mock.types';
import { dateKeyDaysAgo, isoDaysAgo, round } from '../data/seed';
import { findMockPortfolio, isInvestorPortfolio } from '../data/portfolios.data';
import {
  CLOSED_TRADES,
  TOTAL_PNL,
  TRADER_CURRENT_BALANCE,
  TRADER_INITIAL_BALANCE,
  traderRecords,
} from '../data/trader.data';
import {
  DIVIDEND_INCOME,
  INVESTED_COST,
  INVESTOR_CASH,
  INVESTOR_HOLDINGS,
  INVESTOR_TOTAL_PNL,
  MARKET_VALUE,
  PORTFOLIO_VALUE,
  REALIZED_PNL,
  UNREALIZED_PNL,
  investorPerformance,
  investorRecords,
} from '../data/investor.data';

/**
 * เดิมเทียบ id กับ INVESTOR_PORTFOLIO_ID ตรงๆ พอสร้างพอร์ตหุ้นใหม่ในโหมด mock
 * (id ไม่ใช่ 2) ทุก endpoint จะตกไปสาขา TRADER — ตอนนี้ถามประเภทจากทะเบียนพอร์ตแทน
 */
const isInvestor = (portfolioId: string | undefined) => isInvestorPortfolio(portfolioId);

const WINS = CLOSED_TRADES.filter((t) => t.result_status === 'WIN');
const LOSSES = CLOSED_TRADES.filter((t) => t.result_status === 'LOSS');

const GROSS_PROFIT = round(WINS.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0));
const GROSS_LOSS = round(Math.abs(LOSSES.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0)));

/** จัดกลุ่มเทรดตาม field แล้วสรุปเป็น PerformanceStat */
function statsBy(field: keyof Trade): PerformanceStat[] {
  const buckets = new Map<string, Trade[]>();

  for (const trade of CLOSED_TRADES) {
    const label = asString(trade[field], 'unknown');
    buckets.set(label, [...(buckets.get(label) ?? []), trade]);
  }

  return [...buckets.entries()]
    .map(([label, trades]) => {
      const wins = trades.filter((t) => t.result_status === 'WIN').length;
      const totalPnl = round(trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0));

      return {
        label,
        win_count: wins,
        loss_count: trades.length - wins,
        total_pnl: totalPnl,
        avg_pnl: round(totalPnl / trades.length),
        win_rate: round((wins / trades.length) * 100),
      };
    })
    .sort((a, b) => b.total_pnl - a.total_pnl);
}

function timeSlotOf(trade: Trade): string {
  const hour = new Date(trade.closed_at ?? trade.opened_at ?? '').getHours();
  if (hour < 8) return 'Asia (00-08)';
  if (hour < 16) return 'London (08-16)';
  return 'New York (16-24)';
}

function slotStats(): PerformanceStat[] {
  const buckets = new Map<string, Trade[]>();

  for (const trade of CLOSED_TRADES) {
    const slot = timeSlotOf(trade);
    buckets.set(slot, [...(buckets.get(slot) ?? []), trade]);
  }

  return [...buckets.entries()].map(([label, trades]) => {
    const wins = trades.filter((t) => t.result_status === 'WIN').length;
    const totalPnl = round(trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0));

    return {
      label,
      win_count: wins,
      loss_count: trades.length - wins,
      total_pnl: totalPnl,
      avg_pnl: round(totalPnl / trades.length),
      win_rate: round((wins / trades.length) * 100),
    };
  });
}

/** เส้นการเติบโตของบัญชี — สะสม PnL ทีละเทรด */
function traderPerformance(): PerformancePoint[] {
  let running = TRADER_INITIAL_BALANCE;

  return CLOSED_TRADES.map((trade) => {
    running = round(running + Number(trade.pnl ?? 0));

    return {
      date: (trade.closed_at ?? trade.opened_at ?? '').slice(0, 10),
      value: running,
      event: trade.pair,
      amount: Number(trade.pnl ?? 0),
    };
  });
}

function monthlyGrowth(): MonthlyGrowthPoint[] {
  const buckets = new Map<string, Trade[]>();

  for (const trade of CLOSED_TRADES) {
    const month = (trade.closed_at ?? trade.opened_at ?? '').slice(0, 7);
    if (!month) continue;
    buckets.set(month, [...(buckets.get(month) ?? []), trade]);
  }

  let cumulative = 0;

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, trades]) => {
      const pnl = round(trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0));
      cumulative = round(cumulative + pnl);

      return {
        month,
        label: new Date(`${month}-01`).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
        pnl,
        cumulative_pnl: cumulative,
        growth_pct: round((cumulative / TRADER_INITIAL_BALANCE) * 100),
        trade_count: trades.length,
        win_count: trades.filter((t) => t.result_status === 'WIN').length,
        loss_count: trades.filter((t) => t.result_status === 'LOSS').length,
      };
    });
}

function winRateBreakdown(): WinRateBreakdown {
  const byGroup = (keyFn: (t: Trade) => string, field: 'position' | 'slot' | 'day' | 'month') => {
    const buckets = new Map<string, Trade[]>();

    for (const trade of CLOSED_TRADES) {
      const key = keyFn(trade);
      buckets.set(key, [...(buckets.get(key) ?? []), trade]);
    }

    return [...buckets.entries()].map(([key, trades]) => {
      const win = trades.filter((t) => t.result_status === 'WIN').length;
      const loss = trades.length - win;

      return {
        [field]: key,
        win,
        loss,
        win_rate: round((win / trades.length) * 100),
      };
    });
  };

  const pnlByGroup = (keyFn: (t: Trade) => string, field: 'slot' | 'day' | 'month') => {
    const buckets = new Map<string, Trade[]>();

    for (const trade of CLOSED_TRADES) {
      const key = keyFn(trade);
      buckets.set(key, [...(buckets.get(key) ?? []), trade]);
    }

    return [...buckets.entries()].map(([key, trades]) => {
      const profit = round(
        trades.filter((t) => Number(t.pnl) > 0).reduce((s, t) => s + Number(t.pnl ?? 0), 0),
      );
      const loss = round(
        Math.abs(
          trades.filter((t) => Number(t.pnl) < 0).reduce((s, t) => s + Number(t.pnl ?? 0), 0),
        ),
      );

      return {
        [field]: key,
        profit,
        loss,
        net: round(profit - loss),
        total_pnl: round(profit - loss),
        trade_count: trades.length,
      };
    });
  };

  const dayOf = (t: Trade) =>
    new Date(t.closed_at ?? t.opened_at ?? '').toLocaleDateString('en-US', { weekday: 'short' });
  const monthOf = (t: Trade) => (t.closed_at ?? t.opened_at ?? '').slice(0, 7);

  return {
    by_position: byGroup((t) => t.trade_type, 'position') as WinRateBreakdown['by_position'],
    by_slot: byGroup(timeSlotOf, 'slot') as WinRateBreakdown['by_slot'],
    by_day: byGroup(dayOf, 'day') as WinRateBreakdown['by_day'],
    by_month: byGroup(monthOf, 'month') as WinRateBreakdown['by_month'],
    pnl_by_slot: pnlByGroup(timeSlotOf, 'slot') as WinRateBreakdown['pnl_by_slot'],
    pnl_by_day: pnlByGroup(dayOf, 'day') as WinRateBreakdown['pnl_by_day'],
    pnl_by_month: pnlByGroup(monthOf, 'month') as WinRateBreakdown['pnl_by_month'],
  };
}

const BEHAVIORAL: BehavioralAnalytics = {
  strategy: statsBy('strategy'),
  emotion: statsBy('emotion'),
  trend: statsBy('trend'),
  entry_reason: statsBy('entry_reason'),
  time_slot: slotStats(),
};

export const analyticsRoutes = defineMockRoutes([
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/overview',
    handler: (ctx) => {
      const requested = findMockPortfolio(Number(ctx.params.portfolioId));

      if (isInvestor(ctx.params.portfolioId)) {
        return {
          portfolio: {
            id: requested?.id ?? Number(ctx.params.portfolioId),
            name: requested?.name ?? 'Long-Term Stock',
            type: 'INVESTOR',
            currency: requested?.currency ?? 'THB',
          },
          summary: {
            current_value: PORTFOLIO_VALUE,
            cash: INVESTOR_CASH,
            invested_cost: INVESTED_COST,
            holdings_value: MARKET_VALUE,
            realized_pnl: REALIZED_PNL,
            unrealized_pnl: UNREALIZED_PNL,
            dividend_income: DIVIDEND_INCOME,
            total_pnl: INVESTOR_TOTAL_PNL,
            total_pnl_percent: round((INVESTOR_TOTAL_PNL / INVESTED_COST) * 100),
            contributed_capital: 500_000,
            investment_gain: INVESTOR_TOTAL_PNL,
            open_holdings: INVESTOR_HOLDINGS.length,
            closed_sales: 2,
          },
          holdings: INVESTOR_HOLDINGS.map((h) => ({
            symbol: h.symbol,
            shares: h.shares,
            quantity: h.shares,
            average_cost: h.average_cost,
            cost_basis: h.cost_basis,
            market_price: h.market_price,
            market_value: h.market_value,
            unrealized_pnl: h.unrealized_pnl,
            unrealized_percent: h.unrealized_percent,
          })),
          recent_activity: investorRecords().slice(0, 10),
        };
      }

      return {
        portfolio: {
          id: requested?.id ?? Number(ctx.params.portfolioId),
          name: requested?.name ?? 'Forex Main',
          type: 'TRADER',
          currency: requested?.currency ?? 'USD',
        },
        summary: {
          current_value: TRADER_CURRENT_BALANCE,
          initial_balance: TRADER_INITIAL_BALANCE,
          total_pnl: TOTAL_PNL,
          total_pnl_percent: round((TOTAL_PNL / TRADER_INITIAL_BALANCE) * 100),
          realized_pnl: TOTAL_PNL,
          unrealized_pnl: 184.5,
          total_trades: CLOSED_TRADES.length,
          wins: WINS.length,
          losses: LOSSES.length,
          breakeven: 0,
          win_rate: round((WINS.length / CLOSED_TRADES.length) * 100),
          profit_factor: GROSS_LOSS === 0 ? null : round(GROSS_PROFIT / GROSS_LOSS),
          average_pnl: round(TOTAL_PNL / CLOSED_TRADES.length),
        },
      };
    },
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/performance',
    handler: (ctx) =>
      isInvestor(ctx.params.portfolioId) ? investorPerformance() : traderPerformance(),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/monthly-growth',
    handler: () => monthlyGrowth(),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/behavioral',
    handler: () => BEHAVIORAL,
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/win-rate',
    handler: () => winRateBreakdown(),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/timeline',
    handler: (ctx) =>
      (isInvestor(ctx.params.portfolioId) ? investorRecords() : traderRecords()).slice(0, 40),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/allocation',
    handler: () =>
      INVESTOR_HOLDINGS.map((h) => ({
        symbol: h.symbol,
        value: h.market_value ?? 0,
        weight: round(((h.market_value ?? 0) / MARKET_VALUE) * 100),
      })),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/return-vs-benchmark',
    handler: () => {
      const portfolio = investorPerformance()
        .filter((_, i) => i % 7 === 0)
        .map((point, index) => ({
          date: point.date,
          value: point.value,
          return: round((index / 26) * 18.4),
        }));

      const benchmark = portfolio.map((point, index) => ({
        date: point.date,
        value: round(point.value * 0.94),
        return: round((index / 26) * 11.2),
      }));

      return { portfolio, benchmark, outperformance: 7.2, benchmarkSymbol: 'SET50' };
    },
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/time-weighted-return',
    handler: () => ({
      timeWeightedReturn: 16.8,
      totalReturn: 18.4,
      note: 'คำนวณแบบตัดผลของเงินฝาก/ถอนออก (mock)',
    }),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/monthly-heatmap',
    handler: () =>
      monthlyGrowth().map((point) => ({
        month: point.month,
        pnl: point.pnl,
        percentage: point.pnl > 0 ? 'positive' : point.pnl < 0 ? 'negative' : 'neutral',
      })),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/performers',
    handler: () => {
      const sorted = [...CLOSED_TRADES].sort((a, b) => Number(b.pnl ?? 0) - Number(a.pnl ?? 0));

      const toItem = (trade: Trade) => ({
        symbol: trade.pair,
        pnl: Number(trade.pnl ?? 0),
        returnPercent: round((Number(trade.pnl ?? 0) / TRADER_INITIAL_BALANCE) * 100),
        closedAt: trade.closed_at,
      });

      return {
        best: sorted.slice(0, 5).map(toItem),
        worst: sorted.slice(-5).reverse().map(toItem),
      };
    },
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/holding-period',
    handler: () => ({ averageDays: 34.6, totalHoldings: INVESTOR_HOLDINGS.length }),
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/cash-flow',
    handler: () => {
      const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        return d.toISOString().slice(0, 7);
      });

      return {
        monthlyCashFlow: months.map((month, index) => ({
          month,
          cashFlow: round(12_000 + index * 850),
          dividendIncome: index % 3 === 0 ? round(2_400 + index * 180) : 0,
        })),
        totalDividendIncome: DIVIDEND_INCOME,
        passiveIncomeGrowth: 22.6,
      };
    },
  },
  {
    method: 'POST',
    path: '/analytics/dca-simulator',
    handler: (ctx) => {
      const symbol = asString(ctx.body.symbol, 'AAPL');
      const monthlyAmount = Number(ctx.body.monthlyAmount ?? 5_000);
      const durationYears = Number(ctx.body.durationYears ?? 10);
      const totalInvested = monthlyAmount * 12 * durationYears;

      const build = (
        scenario: 'Low Growth' | 'Medium Growth' | 'High Growth',
        annual: number,
        confidence: number,
        reasoning: string,
      ) => {
        const months = durationYears * 12;
        const rate = annual / 100 / 12;
        const finalValue = round(monthlyAmount * ((Math.pow(1 + rate, months) - 1) / rate));

        return {
          scenario,
          totalInvested,
          finalValue,
          totalReturn: round(finalValue - totalInvested),
          annualizedReturn: annual,
          reasoning,
          confidence,
        };
      };

      return {
        symbol,
        monthlyAmount,
        durationYears,
        scenarios: [
          build('Low Growth', 4.5, 80, 'ตลาดโตช้า เงินเฟ้อกดดันกำไรบริษัท'),
          build('Medium Growth', 8.0, 65, 'อิงค่าเฉลี่ยระยะยาวของตลาดหุ้น'),
          build('High Growth', 12.5, 35, 'บริษัทรักษาการเติบโตได้ต่อเนื่องและตลาดให้ P/E สูงขึ้น'),
        ],
        analysis: {
          historicalContext: `${symbol} ให้ผลตอบแทนเฉลี่ยราว 8-10% ต่อปีในรอบ 10 ปีที่ผ่านมา`,
          riskFactors: [
            'ความผันผวนระยะสั้นสูงกว่ากองทุนรวมดัชนี',
            'ความเสี่ยงอัตราแลกเปลี่ยนถ้าลงทุนหุ้นต่างประเทศ',
            'ผลตอบแทนในอดีตไม่รับประกันอนาคต',
          ],
          recommendations: [
            'ทยอยลงทุนเท่า ๆ กันทุกเดือนเพื่อเฉลี่ยต้นทุน',
            'กระจายอย่างน้อย 5-8 ตัวข้ามกลุ่มอุตสาหกรรม',
            'ทบทวนพอร์ตทุก 6 เดือน',
          ],
        },
      };
    },
  },
  {
    method: 'GET',
    path: '/share-statistics/portfolio/:portfolioId',
    handler: () => ({
      total_trades: CLOSED_TRADES.length,
      win_rate: round((WINS.length / CLOSED_TRADES.length) * 100),
      total_pnl: TOTAL_PNL,
      best_trade: round(Math.max(...CLOSED_TRADES.map((t) => Number(t.pnl ?? 0)))),
      worst_trade: round(Math.min(...CLOSED_TRADES.map((t) => Number(t.pnl ?? 0)))),
      period_start: dateKeyDaysAgo(120),
      period_end: dateKeyDaysAgo(0),
    }),
  },
  {
    method: 'GET',
    path: '/share-statistics/portfolio/:portfolioId/logs',
    handler: () =>
      Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        portfolio_id: 1,
        channel: ['facebook', 'x', 'line', 'copy'][index],
        created_at: isoDaysAgo(index * 6 + 2),
      })),
  },
]);

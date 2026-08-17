import { asNumber, asString, defineMockRoutes } from '../mock.types';
import {
  INVESTOR_PORTFOLIO_ID,
  MOCK_USER,
  STOCK_UNIVERSE,
  isoDaysAgo,
  round,
  stockPrice,
} from '../data/seed';
import { findMockPortfolio, isInvestorPortfolio } from '../data/portfolios.data';
import { TRADER_CURRENT_BALANCE, traderRecords } from '../data/trader.data';
import {
  INVESTED_COST,
  INVESTOR_CASH,
  INVESTOR_HOLDINGS,
  MARKET_VALUE,
  PORTFOLIO_VALUE,
  investorRecords,
} from '../data/investor.data';

/**
 * Endpoint ที่เหลือซึ่งไม่ได้อยู่ในเส้นทางหลักของแต่ละหน้า
 * (เรียกจากปุ่ม/ไดอะล็อกย่อย) — mock ไว้ให้ครบ จะได้ไม่มีอะไรหลุดไปยิง backend
 */
export const extraRoutes = defineMockRoutes([
  // ---------- Assets: ฝั่ง Investor ----------
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/investor/overview',
    handler: (ctx) => ({
      portfolio: {
        id: asNumber(ctx.params.portfolioId, INVESTOR_PORTFOLIO_ID),
        name: findMockPortfolio(asNumber(ctx.params.portfolioId))?.name ?? 'Long-Term Stock',
        currency: findMockPortfolio(asNumber(ctx.params.portfolioId))?.currency ?? 'THB',
        current_balance: INVESTOR_CASH,
        total_invested: INVESTED_COST,
        total_value: PORTFOLIO_VALUE,
      },
      stocks: INVESTOR_HOLDINGS.map((holding) => ({
        stock_symbol: holding.symbol,
        stock_name: holding.name ?? holding.symbol,
        total_shares: holding.shares,
        total_cost: holding.cost_basis,
        average_cost: holding.average_cost,
        current_price: holding.market_price ?? 0,
        current_value: holding.market_value ?? 0,
        unrealized_pnl: holding.unrealized_pnl ?? 0,
        unrealized_pnl_percent: holding.unrealized_percent ?? 0,
      })),
    }),
  },
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/investor/trending',
    handler: () =>
      STOCK_UNIVERSE.slice(0, 6).map((stock, index) => ({
        id: index + 1,
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        estimated_growth: round(4 + index * 2.6, 2),
      })),
  },
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/investor/news/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');

      return [
        {
          id: 1,
          title: `${symbol} ประกาศผลประกอบการไตรมาสล่าสุดดีกว่าคาด`,
          content: 'รายได้และกำไรสุทธิเติบโตต่อเนื่อง ผู้บริหารปรับเป้าทั้งปีขึ้น',
          source: 'Reuters',
          url: 'https://example.com/news',
          sentiment: '0.72',
          sentiment_label: 'POSITIVE',
          stock_symbols: [symbol],
          published_at: isoDaysAgo(2),
        },
        {
          id: 2,
          title: `นักวิเคราะห์ปรับเพิ่มราคาเป้าหมาย ${symbol}`,
          content: 'สะท้อนแนวโน้มอัตรากำไรที่ดีขึ้นและส่วนแบ่งตลาดที่เพิ่มขึ้น',
          source: 'Bloomberg',
          url: 'https://example.com/news',
          sentiment: '0.55',
          sentiment_label: 'POSITIVE',
          stock_symbols: [symbol],
          published_at: isoDaysAgo(6),
        },
        {
          id: 3,
          title: `แรงขายทำกำไรกดดัน ${symbol} ระยะสั้น`,
          content: 'หลังราคาปรับขึ้นต่อเนื่อง นักลงทุนบางส่วนทยอยขายทำกำไร',
          source: 'CNBC',
          url: 'https://example.com/news',
          sentiment: '-0.31',
          sentiment_label: 'NEGATIVE',
          stock_symbols: [symbol],
          published_at: isoDaysAgo(11),
        },
      ];
    },
  },
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/investor/events/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');

      return [
        {
          id: 1,
          stock_symbol: symbol,
          event_type: 'EARNINGS',
          title: 'ประกาศผลประกอบการไตรมาสถัดไป',
          description: 'รายงานผลประกอบการหลังตลาดปิด',
          event_date: isoDaysAgo(-12),
        },
        {
          id: 2,
          stock_symbol: symbol,
          event_type: 'DIVIDEND',
          title: 'วันขึ้นเครื่องหมาย XD',
          description: 'ผู้ถือหุ้นที่มีชื่อ ณ วันดังกล่าวมีสิทธิรับเงินปันผล',
          event_date: isoDaysAgo(-25),
        },
      ];
    },
  },

  // ---------- Records: การเคลื่อนไหวเงิน ----------
  {
    method: 'POST',
    path: '/records/portfolio/:portfolioId',
    handler: (ctx) => {
      const amount = asNumber(ctx.body.amount);
      const isInvestor = isInvestorPortfolio(ctx.params.portfolioId);
      const base = (isInvestor ? investorRecords() : traderRecords())[0];

      return {
        record: {
          ...base,
          id: Date.now() % 100000,
          type: asString(ctx.body.type, 'DEPOSIT'),
          amount,
          description: asString(ctx.body.description, 'รายการที่บันทึกเอง (mock)'),
          occurred_at: asString(ctx.body.occurred_at, isoDaysAgo(0)),
        },
        current_balance: round((isInvestor ? INVESTOR_CASH : TRADER_CURRENT_BALANCE) + amount),
      };
    },
  },
  {
    method: 'POST',
    path: '/records/transfer',
    handler: (ctx) => {
      const amount = asNumber(ctx.body.amount);
      const out = traderRecords()[0];
      const inbound = investorRecords()[0];

      return {
        transfer_group_id: `mock-transfer-${Date.now() % 100000}`,
        transfer_out: { ...out, type: 'TRANSFER_OUT', amount: -amount },
        transfer_in: { ...inbound, type: 'TRANSFER_IN', amount },
      };
    },
  },
  {
    method: 'POST',
    path: '/records/:recordId/reverse',
    handler: (ctx) => ({
      ...traderRecords()[0],
      id: asNumber(ctx.params.recordId),
      type: 'REVERSAL',
      status: 'REVERSED',
    }),
  },
  {
    method: 'POST',
    path: '/records/portfolio/:portfolioId/rebuild-balance',
    handler: (ctx) => ({
      portfolio_id: asNumber(ctx.params.portfolioId),
      initial_balance: 10_000,
      records_total: round(TRADER_CURRENT_BALANCE - 10_000),
      previous_balance: TRADER_CURRENT_BALANCE,
      rebuilt_balance: TRADER_CURRENT_BALANCE,
    }),
  },

  // ---------- Gamification: ที่เหลือ ----------
  {
    method: 'POST',
    path: '/gamification/redeem',
    handler: (ctx) => {
      const tokens = asNumber(ctx.body.tokens, 1);
      const spent = tokens * 50;

      return {
        success: true,
        spent_points: spent,
        received_tokens: tokens,
        balance: {
          points_balance: MOCK_USER.points_balance - spent,
          ai_token_balance: MOCK_USER.ai_token_balance + tokens,
        },
      };
    },
  },
  {
    method: 'POST',
    path: '/gamification/events',
    handler: (ctx) => ({
      event_type: asString(ctx.body.event_type, 'LOGIN'),
      updated_count: 1,
      missions: [],
    }),
  },

  // ---------- Share ----------
  {
    method: 'GET',
    path: '/share-statistics/portfolio/:portfolioId/message/:platform',
    handler: (ctx) => ({
      platform: asString(ctx.params.platform, 'x'),
      message:
        'เดือนนี้ปิดไป 24 ไม้ ชนะ 14 แพ้ 10 · Win rate 58% · กำไรรวม +$1,240 📈 บันทึกทุกไม้ด้วย Wisenancial',
      hashtags: ['#trading', '#forex', '#wisenancial'],
    }),
  },
  {
    method: 'GET',
    path: '/share-statistics/portfolio/:portfolioId/social-data',
    handler: () => ({
      total_trades: 96,
      win_rate: 58.3,
      total_pnl: round(TRADER_CURRENT_BALANCE - 12_500),
      best_pair: 'XAU/USD',
      streak: MOCK_USER.current_streak,
    }),
  },
  {
    method: 'POST',
    path: '/share-statistics/portfolio/:portfolioId/image',
    handler: () => ({ url: '/icons/favicon-128x128.png', expires_at: isoDaysAgo(-7) }),
  },
  {
    method: 'POST',
    path: '/share-statistics/portfolio/:portfolioId/log',
    handler: (ctx) => ({
      id: Date.now() % 100000,
      portfolio_id: asNumber(ctx.params.portfolioId),
      channel: asString(ctx.body.platform, 'copy'),
      created_at: isoDaysAgo(0),
    }),
  },

  // ---------- Market: ราคาที่เก็บไว้รายพอร์ต ----------
  {
    method: 'GET',
    path: '/market/prices/portfolio/:portfolioId',
    handler: () => {
      const result: Record<string, number> = {};

      for (const holding of INVESTOR_HOLDINGS) {
        result[holding.symbol] = stockPrice(holding.symbol);
      }

      return result;
    },
  },
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/summary',
    handler: () => ({
      market_value: MARKET_VALUE,
      invested_cost: INVESTED_COST,
      cash: INVESTOR_CASH,
    }),
  },
]);

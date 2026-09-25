import type { BrokerConnection } from 'src/types/broker-connection.types';
import type { CoachReview } from 'src/types/coach.types';
import type { PublicProfile } from 'src/types/user.types';
import type { StockRecommendation } from 'src/types/ai.types';
import type { StockValuation } from 'src/types/asset.types';
import { asNumber, asString, defineMockRoutes } from '../mock.types';
import {
  MOCK_USER,
  STOCK_UNIVERSE,
  TRADER_PORTFOLIO_ID,
  createRng,
  isoDaysAgo,
  round,
  stockPrice,
} from '../data/seed';
import { findMockPortfolio } from '../data/portfolios.data';
import {
  DIVIDENDS,
  INVESTOR_CASH,
  INVESTOR_HOLDINGS,
  INVESTOR_TOTAL_PNL,
  PORTFOLIO_VALUE,
} from '../data/investor.data';
import { MOCK_PURCHASES } from '../data/stock-purchases.data';
import { COACHES, SESSIONS } from './content.routes';

/**
 * Endpoint ที่เพิ่มเข้ามาเพื่อ demo ให้ครบทุกหน้า
 *
 * ก่อนหน้านี้ 40 call ไม่มี handler แล้วหลุดไปยิง backend จริง (ดูเหตุผลที่ mocks/index.ts)
 * ไฟล์นี้อยู่แยกจาก route กลุ่มเดิมเพื่อให้เห็นชัดว่าอะไรเพิ่มทีหลัง และไม่ไปแตะ logic ของเดิม
 *
 * ยกเว้นโดยตั้งใจ (ไม่ mock):
 *   - /dev/mt5-cloud-spike/*  หน้า dev-only ไม่ได้อยู่ในเมนูผู้ใช้
 *   - /brokers/mt5-cloud-connector/* ส่วนใหญ่ — ฟีเจอร์ beta ที่ปิดอยู่ (beta-status = false)
 *     การ์ดจึงไม่ถูกแสดงเลย ไม่ได้เรียก endpoint อื่นของกลุ่มนี้
 */

/** hash สตริง -> เลข seed คงที่ (ผลเดิมทุกครั้ง แต่ละสัญลักษณ์ได้กราฟคนละแบบ) */
function seedOf(text: string): number {
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1_000_003;
  }
  return hash;
}

function decode(raw: string | undefined, fallback: string): string {
  try {
    return decodeURIComponent(raw ?? fallback);
  } catch {
    return raw ?? fallback;
  }
}

// ---------------------------------------------------------------------------
// Broker Connections — เก็บเป็น state ในหน่วยความจำ ให้สร้าง/revoke/ลบได้จริงตอน demo
// ---------------------------------------------------------------------------

const brokerConnections: BrokerConnection[] = [
  {
    id: 1,
    user_id: MOCK_USER.id,
    portfolio_id: TRADER_PORTFOLIO_ID,
    broker_type: 'MT5',
    external_account_id: '50184427',
    broker_server: 'Exness-MT5Real12',
    oauth_token_expires_at: null,
    status: 'ACTIVE',
    last_heartbeat_at: isoDaysAgo(0, new Date().getHours()),
    last_sync_at: isoDaysAgo(0, new Date().getHours()),
    last_snapshot_sequence: 18432,
    last_error_code: null,
    last_error_message: null,
    last_error_at: null,
    created_at: isoDaysAgo(42),
    updated_at: isoDaysAgo(0),
    deleted_at: null,
  },
];

let nextBrokerId = 2;

function generateMockKey(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'wsn_live_';
  for (let i = 0; i < 32; i += 1) {
    key += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return key;
}

function findBroker(id: string | undefined): BrokerConnection | undefined {
  return brokerConnections.find((connection) => connection.id === Number(id));
}

// ---------------------------------------------------------------------------
// ดัชนีตลาดไทย + กราฟย้อนหลัง
// ---------------------------------------------------------------------------

const INDEX_BASE: Record<string, { price: number; changePercent: number }> = {
  '^SET.BK': { price: 1412.35, changePercent: 0.62 },
  '^SET50.BK': { price: 885.2, changePercent: 0.48 },
  '^MAI.BK': { price: 398.6, changePercent: -0.27 },
};

const HISTORY_SHAPE: Record<string, { points: number; stepMs: number }> = {
  '1D': { points: 48, stepMs: 10 * 60 * 1000 },
  '1W': { points: 35, stepMs: 60 * 60 * 1000 },
  '1M': { points: 22, stepMs: 24 * 60 * 60 * 1000 },
  '3M': { points: 64, stepMs: 24 * 60 * 60 * 1000 },
  '6M': { points: 126, stepMs: 24 * 60 * 60 * 1000 },
  '1Y': { points: 250, stepMs: 24 * 60 * 60 * 1000 },
  '5Y': { points: 260, stepMs: 7 * 24 * 60 * 60 * 1000 },
};

function basePriceOf(symbol: string): number {
  return INDEX_BASE[symbol.toUpperCase()]?.price ?? stockPrice(symbol);
}

function buildHistory(symbol: string, timeframe: string) {
  const shape = HISTORY_SHAPE[timeframe] ?? HISTORY_SHAPE['3M']!;
  const rng = createRng(seedOf(symbol) + shape.points);
  const end = basePriceOf(symbol);
  const now = Date.now();

  // เดินย้อนจากราคาปัจจุบัน แล้วกลับลำดับให้เรียงเก่า -> ใหม่
  const closes: number[] = [end];
  for (let i = 1; i < shape.points; i += 1) {
    const prev = closes[i - 1] ?? end;
    closes.push(prev * (1 + (rng() - 0.5) * 0.018 - 0.0006));
  }
  closes.reverse();

  return closes.map((close, index) => {
    const date = new Date(now - (shape.points - 1 - index) * shape.stepMs).toISOString();
    const open = index === 0 ? close : (closes[index - 1] ?? close);
    const high = Math.max(open, close) * (1 + rng() * 0.006);
    const low = Math.min(open, close) * (1 - rng() * 0.006);

    return {
      date,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(1_000_000 + rng() * 9_000_000),
    };
  });
}

// ---------------------------------------------------------------------------
// ภาพการ์ดแชร์ (SVG แบบ data URL — ไม่ต้องพึ่ง backend/ไฟล์ภายนอก)
// ---------------------------------------------------------------------------

function shareCardDataUrl(title: string, returnText: string, pnl: string, accent: string): string {
  const safe = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#134e4a"/></linearGradient></defs>
<rect width="1080" height="1080" fill="url(#g)"/>
<circle cx="900" cy="180" r="260" fill="${accent}" opacity="0.14"/>
<text x="80" y="140" fill="#ffffff" font-family="sans-serif" font-size="44" font-weight="700">Wisenancial</text>
<text x="80" y="230" fill="#94a3b8" font-family="sans-serif" font-size="36">${safe(title)}</text>
<text x="80" y="560" fill="${accent}" font-family="sans-serif" font-size="180" font-weight="800">${safe(returnText)}</text>
<text x="80" y="650" fill="#e2e8f0" font-family="sans-serif" font-size="48">${safe(pnl)}</text>
<polyline points="80,900 240,860 380,880 520,790 660,810 800,700 940,640" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Public profile
// ---------------------------------------------------------------------------

function buildPublicProfile(username: string): PublicProfile {
  const isOwner = username === MOCK_USER.username;

  if (isOwner) {
    return {
      username,
      full_name: MOCK_USER.full_name,
      avatar_url: null,
      bio: MOCK_USER.bio,
      subscription_tier: MOCK_USER.subscription_tier,
      is_public_profile: true,
      is_owner: true,
      current_streak: MOCK_USER.current_streak,
      member_since: MOCK_USER.created_at,
      held_stocks: INVESTOR_HOLDINGS.map((holding) => holding.symbol),
      total_asset_value: PORTFOLIO_VALUE,
      total_pnl: INVESTOR_TOTAL_PNL,
      portfolio_count: 3,
    };
  }

  const rng = createRng(seedOf(username));
  const pool = STOCK_UNIVERSE.map((stock) => stock.symbol);
  const held = pool.filter(() => rng() > 0.68).slice(0, 5);

  return {
    username,
    full_name: username.replace(/[_\-.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    avatar_url: null,
    bio: 'นักลงทุนสาย value เน้นถือยาว และจดบันทึกทุกไม้เพื่อเรียนรู้จากข้อผิดพลาด',
    subscription_tier: rng() > 0.5 ? 'PACK_279' : 'PACK_159',
    is_public_profile: true,
    is_owner: false,
    current_streak: Math.round(3 + rng() * 40),
    member_since: isoDaysAgo(Math.round(60 + rng() * 300)),
    held_stocks: held.length > 0 ? held : pool.slice(0, 3),
    total_asset_value: round(180_000 + rng() * 1_400_000),
    total_pnl: round((rng() - 0.25) * 240_000),
    portfolio_count: Math.round(1 + rng() * 3),
  };
}

// ---------------------------------------------------------------------------
// AI Growth recommendations
// ---------------------------------------------------------------------------

function buildGrowthRecommendations(): StockRecommendation[] {
  const picks = STOCK_UNIVERSE.filter((stock) =>
    ['Technology', 'Healthcare', 'Consumer', 'Communication'].includes(stock.sector),
  ).slice(0, 4);

  return picks.map((stock) => {
    const rng = createRng(seedOf(stock.symbol) + 11);
    const growth = round(0.14 + rng() * 0.26, 3);
    const margin = round(0.08 + rng() * 0.22, 3);

    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      asOf: '2026-Q2',
      metrics: {
        revenueGrowthYoY: growth,
        netMargin: margin,
        peRatio: stock.peRatio,
        currentPrice: stock.price,
        avgDailyVolume3M: stock.volume,
      },
      reasoning: {
        growth: `รายได้โต ${(growth * 100).toFixed(0)}% YoY ต่อเนื่องหลายไตรมาส และยังไม่มีสัญญาณชะลอ`,
        profit: `อัตรากำไรสุทธิ ${(margin * 100).toFixed(0)}% อยู่เหนือค่าเฉลี่ยกลุ่มอุตสาหกรรม`,
        customerBase: 'ฐานลูกค้ากระจายตัวดี ไม่พึ่งลูกค้ารายใหญ่รายเดียว มีรายได้ประจำสัดส่วนสูง',
        liquidity: 'ปริมาณซื้อขายเฉลี่ยสูงพอที่จะเข้า-ออกได้โดยไม่กระทบราคา',
      },
      aiSummary: `${stock.name} มีการเติบโตของรายได้และกำไรที่สมดุลกัน เหมาะกับการทยอยสะสมในพอร์ตระยะยาว (ข้อมูลตัวอย่างสำหรับ demo)`,
    };
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const demoRoutes = defineMockRoutes([
  // ---------- Broker Connections (หน้าเชื่อมต่อ MT5) ----------
  {
    method: 'GET',
    path: '/brokers/connections',
    handler: () => brokerConnections.filter((connection) => connection.deleted_at === null),
  },
  {
    method: 'GET',
    path: '/brokers/connections/:id',
    handler: (ctx) => findBroker(ctx.params.id) ?? brokerConnections[0],
  },
  {
    method: 'POST',
    path: '/brokers/connections',
    handler: (ctx) => {
      const portfolioId =
        ctx.body.portfolio_id === undefined ? null : asNumber(ctx.body.portfolio_id);
      const now = new Date().toISOString();

      const connection: BrokerConnection = {
        id: nextBrokerId,
        user_id: MOCK_USER.id,
        portfolio_id: portfolioId,
        broker_type: asString(ctx.body.broker_type, 'MT5') as BrokerConnection['broker_type'],
        external_account_id: null,
        broker_server: null,
        oauth_token_expires_at: null,
        status: 'INACTIVE',
        last_heartbeat_at: null,
        last_sync_at: null,
        last_snapshot_sequence: null,
        last_error_code: null,
        last_error_message: null,
        last_error_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };

      nextBrokerId += 1;
      brokerConnections.push(connection);

      return { connection, apiKey: generateMockKey() };
    },
  },
  {
    method: 'POST',
    path: '/brokers/connections/:id/revoke',
    handler: (ctx) => {
      const connection = findBroker(ctx.params.id);

      if (!connection) return brokerConnections[0];

      connection.status = 'REVOKED';
      connection.updated_at = new Date().toISOString();

      return connection;
    },
  },
  {
    method: 'POST',
    path: '/brokers/connections/:id/rotate-key',
    handler: (ctx) => {
      const connection = findBroker(ctx.params.id) ?? brokerConnections[0];

      return { connection, apiKey: generateMockKey() };
    },
  },
  {
    method: 'DELETE',
    path: '/brokers/connections/:id',
    handler: (ctx) => {
      const index = brokerConnections.findIndex((c) => c.id === Number(ctx.params.id));

      if (index >= 0) brokerConnections.splice(index, 1);

      return { message: 'ลบ connection แล้ว (mock)' };
    },
  },

  // MT5 cloud connector เป็นฟีเจอร์ beta ที่ปิดอยู่ — ตอบว่าปิดเพื่อให้การ์ดไม่ถูกแสดง
  {
    method: 'GET',
    path: '/brokers/mt5-cloud-connector/beta-status',
    handler: () => ({ enabled: false }),
  },
  {
    method: 'GET',
    path: '/brokers/mt5-cloud-connector/records',
    handler: () => [],
  },
  {
    method: 'GET',
    path: '/brokers/mt5-cloud-connector/deploy-log',
    handler: () => [],
  },

  // ---------- ดัชนีตลาด / กราฟย้อนหลัง ----------
  {
    method: 'GET',
    path: '/stocks/index-quote/:symbol',
    handler: (ctx) => {
      const symbol = decode(ctx.params.symbol, '^SET.BK').toUpperCase();
      const base = INDEX_BASE[symbol] ?? { price: stockPrice(symbol), changePercent: 0.3 };
      const rng = createRng(seedOf(symbol) + 3);

      return {
        price: base.price,
        changePercent: base.changePercent,
        dayHigh: round(base.price * (1 + 0.004 + rng() * 0.004)),
        dayLow: round(base.price * (1 - 0.004 - rng() * 0.004)),
        week52High: round(base.price * 1.11),
        week52Low: round(base.price * 0.86),
        previousClose: round(base.price / (1 + base.changePercent / 100)),
        support1: round(base.price * 0.985),
        resistance1: round(base.price * 1.015),
      };
    },
  },
  {
    method: 'GET',
    path: '/stocks/historical/:symbol/:timeframe',
    handler: (ctx) => {
      // "โหลดแท่งเก่าเพิ่ม" ตอนเลื่อนกราฟ — ตอบว่างเพื่อบอกว่าถึงขอบข้อมูลแล้ว (หน้าหยุดขอต่อเอง)
      if (ctx.query.before) return [];

      return buildHistory(decode(ctx.params.symbol, 'AAPL'), asString(ctx.params.timeframe, '3M'));
    },
  },
  {
    method: 'GET',
    path: '/market/quotes/realtime',
    handler: (ctx) => {
      const symbols = asString(ctx.query.symbols, '')
        .split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean);

      return symbols.map((symbol) => {
        const seed = STOCK_UNIVERSE.find((stock) => stock.symbol === symbol.toUpperCase());
        const price = seed?.price ?? stockPrice(symbol);
        const changePercent = seed?.changePercent ?? 0.4;
        const previousClose = round(price / (1 + changePercent / 100));

        return {
          symbol: symbol.toUpperCase(),
          price,
          change: round(price - previousClose),
          changePercent,
          open: round(previousClose * 1.002),
          dayHigh: round(price * 1.008),
          dayLow: round(price * 0.991),
          previousClose,
          volume: seed?.volume ?? 5_000_000,
          marketState: 'REGULAR',
          asOf: new Date().toISOString(),
        };
      });
    },
  },

  // ---------- ปัจจัยพื้นฐาน / มูลค่า / AI ----------
  {
    method: 'GET',
    path: '/stocks/fundamentals',
    handler: (ctx) =>
      asString(ctx.query.symbols, '')
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
        .map((symbol) => {
          const seed = STOCK_UNIVERSE.find((stock) => stock.symbol === symbol);
          const rng = createRng(seedOf(symbol) + 17);

          return {
            symbol,
            peRatio: seed?.peRatio ?? null,
            beta: round(0.7 + rng() * 0.9),
          };
        }),
  },
  {
    method: 'GET',
    path: '/assets/portfolio/:portfolioId/investor/valuation/:symbol',
    handler: (ctx): StockValuation => {
      const symbol = decode(ctx.params.symbol, 'AAPL');
      const price = stockPrice(symbol);
      const rng = createRng(seedOf(symbol) + 5);
      const intrinsic = round(price * (0.86 + rng() * 0.4));
      const gap = ((price - intrinsic) / intrinsic) * 100;

      return {
        currentPrice: price,
        intrinsicValue: intrinsic,
        valuationPercentage: round(gap, 1),
        isOvervalued: price > intrinsic,
        scenarios: {
          bear: {
            price: round(intrinsic * 0.78),
            growthRate: 4,
            reasoning: 'การเติบโตชะลอและอัตรากำไรถูกบีบจากการแข่งขัน',
          },
          base: {
            price: intrinsic,
            growthRate: 9,
            reasoning: 'การเติบโตต่อเนื่องตามแนวโน้มปัจจุบัน อัตรากำไรทรงตัว',
          },
          bull: {
            price: round(intrinsic * 1.24),
            growthRate: 15,
            reasoning: 'ธุรกิจใหม่ช่วยเร่งรายได้ และประสิทธิภาพการดำเนินงานดีขึ้นต่อเนื่อง',
          },
        },
        wallStreetTargets: {
          low: round(price * 0.85),
          mean: round(price * 1.12),
          high: round(price * 1.38),
        },
        dcfInputs: {
          freeCashFlow: Math.round(price * 1_800_000),
          growthRate: 9,
          discountRate: 9.5,
          terminalGrowthRate: 2.5,
          sharesOutstanding: 1_800_000_000,
          isEstimated: true,
        },
      };
    },
  },
  {
    method: 'GET',
    path: '/ai/recommendations/growth',
    handler: () => ({
      data: buildGrowthRecommendations(),
      model: 'gpt-4o-mini',
      creditsCharged: 2,
      creditsRemaining: Math.max(MOCK_USER.ai_token_balance - 2, 0),
    }),
  },

  // ---------- โปรไฟล์สาธารณะ (กดจาก Leaderboard) ----------
  {
    method: 'GET',
    path: '/users/profile/:username',
    handler: (ctx) => buildPublicProfile(decode(ctx.params.username, MOCK_USER.username)),
  },

  // ---------- แก้/ลบรายการลงทุน ----------
  {
    method: 'PATCH',
    path: '/stock-purchases/:id',
    handler: (ctx) => {
      const purchase =
        MOCK_PURCHASES.find((item) => item.id === Number(ctx.params.id)) ?? MOCK_PURCHASES[0];

      if (!purchase) return {};

      Object.assign(purchase, ctx.body);

      return purchase;
    },
  },
  {
    method: 'DELETE',
    path: '/stock-purchases/:id',
    handler: (ctx) => {
      const id = Number(ctx.params.id);
      const index = MOCK_PURCHASES.findIndex((item) => item.id === id);

      if (index >= 0) MOCK_PURCHASES.splice(index, 1);

      return { message: 'ลบรายการซื้อแล้ว (mock)', id };
    },
  },
  {
    method: 'PATCH',
    path: '/dividends/:id',
    handler: (ctx) => {
      const dividend = DIVIDENDS.find((item) => item.id === Number(ctx.params.id)) ?? DIVIDENDS[0];

      if (dividend) Object.assign(dividend, ctx.body);

      return { dividend, current_balance: INVESTOR_CASH };
    },
  },

  // ---------- Coach ----------
  {
    method: 'GET',
    path: '/coaches/:id/reviews',
    handler: (ctx): CoachReview[] => {
      const coachId = ctx.params.id ?? COACHES[0]?.id ?? 'coach-01';

      return [
        {
          id: `${coachId}-r1`,
          coachId,
          author: 'คุณต้น',
          rating: 5,
          comment:
            'อธิบายเรื่องการบริหารความเสี่ยงเข้าใจง่ายมาก ปรับ journal แล้วเห็นผลภายในเดือนเดียว',
          createdAt: isoDaysAgo(6),
        },
        {
          id: `${coachId}-r2`,
          coachId,
          author: 'พี่นิ่ม',
          rating: 5,
          comment: 'ช่วยชี้จุดที่เราเทรดตามอารมณ์ได้ตรงมาก ได้แผนไปใช้ต่อได้จริง',
          createdAt: isoDaysAgo(19),
        },
        {
          id: `${coachId}-r3`,
          coachId,
          author: 'Anon_Trader',
          rating: 4,
          comment: 'เนื้อหาแน่น อยากให้มีเวลาถามตอบเพิ่มอีกนิด แต่โดยรวมคุ้มค่า',
          createdAt: isoDaysAgo(41),
        },
      ];
    },
  },
  {
    method: 'POST',
    path: '/coaches/sessions/:id/cancel',
    handler: (ctx) => {
      const session = SESSIONS.find((item) => item.id === ctx.params.id) ?? SESSIONS[0];

      if (!session) return {};

      session.status = 'CANCELLED';

      return session;
    },
  },

  // ---------- ภาพการ์ดแชร์ / ข่าว ----------
  {
    method: 'GET',
    path: '/share-statistics/portfolio/:portfolioId/image',
    handler: (ctx) => {
      const portfolio = findMockPortfolio(Number(ctx.params.portfolioId));
      const isInvestor = portfolio?.portfolio_type === 'INVESTOR';
      const currency = portfolio?.currency ?? 'USD';
      // ยอดใน type เป็น string | number (Prisma Decimal) — แปลงเป็นตัวเลขก่อนคำนวณ
      const initial = Number(portfolio?.initial_balance ?? 10_000) || 10_000;
      const current = Number(portfolio?.current_balance ?? initial);
      const pnl = round(current - initial);
      const returnPercent = round((pnl / initial) * 100, 1);
      const returnText = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(1)}%`;
      const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString('en-US')} ${currency}`;
      const title = portfolio?.name ?? 'Portfolio';

      return {
        image_url: shareCardDataUrl(title, returnText, pnlText, pnl >= 0 ? '#2dd4bf' : '#f87171'),
        relative_url: '/share/mock-card.svg',
        mime_type: 'image/svg+xml',
        file_name: 'wisenancial-share.svg',
        template: isInvestor ? 'INVESTOR_PERFORMANCE' : 'TRADER_PERFORMANCE',
        generated_at: new Date().toISOString(),
        stats_for_image: {
          title,
          portfolio_type: isInvestor ? 'INVESTOR' : 'TRADER',
          currency,
          return: returnText,
          pnl,
          primary_metric: { label: 'Return', value: returnText },
        },
      };
    },
  },
  {
    method: 'POST',
    path: '/news/trader/analyze-pending',
    handler: () => ({ analyzed: 0, skipped: 0, message: 'ข่าวทั้งหมดถูกวิเคราะห์แล้ว (mock)' }),
  },

  // -------------------------------------------------------------------------
  // Settings — เปลี่ยนรหัสผ่าน / ส่งออกข้อมูล (ของจริงอยู่ที่ auth.controller / users.controller)
  // -------------------------------------------------------------------------
  {
    method: 'POST',
    path: '/auth/change-password',
    handler: () => ({
      message: 'เปลี่ยนรหัสผ่านสำเร็จ (mock)',
      other_sessions_revoked: 2,
      current_session_kept: true,
    }),
  },
  {
    method: 'GET',
    path: '/users/me/export',
    handler: () => ({
      format_version: 1,
      exported_at: new Date().toISOString(),
      user: { id: MOCK_USER.id, username: MOCK_USER.username, email: MOCK_USER.email },
      data: { note: 'ข้อมูลตัวอย่างจาก Mock Mode — ไม่ใช่ข้อมูลจริง', portfolios: [], trades: [] },
    }),
  },
]);

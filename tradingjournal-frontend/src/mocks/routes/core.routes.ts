import type { GamificationOverview, Mission, MissionAudience } from 'src/types/gamification.types';
import type { PortfolioType } from 'src/types/portfolio.types';
import type { UserProfile } from 'src/types/user.types';
import { maxPortfoliosForTier } from 'src/constants/billing.constants';
import { defineMockRoutes } from '../mock.types';
import { MOCK_USER, isoDaysAgo, round } from '../data/seed';
import {
  MOCK_PORTFOLIOS,
  addMockPortfolio,
  findMockPortfolio,
  isInvestorPortfolio,
  removeMockPortfolio,
  updateMockPortfolio,
} from '../data/portfolios.data';
import { dailyPnlMap, traderRecords } from '../data/trader.data';
import { investorRecords } from '../data/investor.data';

const USER_PROFILE: UserProfile = {
  id: MOCK_USER.id,
  username: MOCK_USER.username,
  full_name: MOCK_USER.full_name,
  email: MOCK_USER.email,
  role: MOCK_USER.role,
  avatar_url: MOCK_USER.avatar_url,
  bio: MOCK_USER.bio,
  subscription_tier: MOCK_USER.subscription_tier,
  created_at: MOCK_USER.created_at,
  updated_at: MOCK_USER.updated_at,
  points_balance: MOCK_USER.points_balance,
  ai_token_balance: MOCK_USER.ai_token_balance,
  current_streak: MOCK_USER.current_streak,
  longest_streak: MOCK_USER.longest_streak,
  plan: {
    id: 3,
    name: 'PACK_279',
    price: 279,
    description: 'แพ็กเกจรายเดือน 279 บาท',
    status: 'ACTIVE',
    start_date: isoDaysAgo(18),
    end_date: isoDaysAgo(-12),
  },
};

const MISSIONS: Mission[] = [
  {
    code: 'DAILY_LOGIN',
    title: 'เช็คอินประจำวัน',
    description: 'เข้าใช้งานแอพวันนี้',
    points: 20,
    target: 1,
    progress: 1,
    zone: 'DAILY' as const,
    frequency: 'DAILY' as const,
    event: 'LOGIN' as const,
    audience: 'ALL' as const,
  },
  {
    code: 'DAILY_JOURNAL',
    title: 'บันทึกเทรด 3 รายการ',
    description: 'จดบันทึกการเทรดวันนี้ให้ครบ 3 ไม้',
    points: 50,
    target: 3,
    progress: 2,
    zone: 'DAILY' as const,
    frequency: 'DAILY' as const,
    event: 'JOURNAL_COMPLETED' as const,
    audience: 'TRADER' as const,
  },
  {
    code: 'MONTHLY_GOAL',
    title: 'ทำเป้าหมายรายเดือนสำเร็จ',
    description: 'ปิดเป้ากำไรของเดือนนี้',
    points: 500,
    target: 1,
    progress: 0,
    zone: 'MONTHLY' as const,
    frequency: 'MONTHLY' as const,
    event: 'GOAL_COMPLETED' as const,
    audience: 'ALL' as const,
  },
  {
    code: 'COMMUNITY_POST',
    title: 'แชร์ผลเทรดลงคอมมูนิตี้',
    description: 'โพสต์ผลการเทรด 1 ครั้ง',
    points: 80,
    target: 1,
    progress: 1,
    zone: 'ACHIEVEMENT' as const,
    frequency: 'WEEKLY' as const,
    event: 'POST_CREATED' as const,
    audience: 'ALL' as const,
  },
  {
    code: 'STOCK_BUY',
    title: 'สะสมหุ้นเพิ่ม 1 ตัว',
    description: 'ซื้อหุ้นเข้าพอร์ตลงทุน',
    points: 120,
    target: 1,
    progress: 0,
    zone: 'MONTHLY' as const,
    frequency: 'MONTHLY' as const,
    event: 'STOCK_PURCHASED' as const,
    audience: 'INVESTOR' as const,
  },
  {
    code: 'INVITE_FRIEND',
    title: 'ชวนเพื่อนมาใช้งาน',
    description: 'ชวนเพื่อน 3 คนสมัครสมาชิก',
    points: 300,
    target: 3,
    progress: 1,
    zone: 'INVITE' as const,
    frequency: 'ONCE' as const,
    event: 'PROFILE_COMPLETED' as const,
    audience: 'ALL' as const,
  },
].map((item, index) => {
  const completed = item.progress >= item.target;

  return {
    id: index + 1,
    user_mission_id: 1000 + index,
    code: item.code,
    title: item.title,
    description: item.description,
    points: item.points,
    target_count: item.target,
    progress: item.progress,
    status: completed ? ('COMPLETED' as const) : ('IN_PROGRESS' as const),
    frequency: item.frequency,
    zone: item.zone,
    audience: item.audience,
    event_type: item.event,
    period_key: isoDaysAgo(0).slice(0, 10),
    completed_at: completed ? isoDaysAgo(0) : null,
    claimed_at: null,
    expires_at: isoDaysAgo(-1),
    can_claim: completed,
  };
});

/**
 * เลียนแบบ GamificationService — ไม่ส่ง portfolio_type มาจะได้เฉพาะภารกิจ audience ALL
 * ส่งมาจะได้ ALL + ของโหมดนั้น (ดู gamification.service.ts ฝั่ง backend)
 */
function missionsFor(portfolioType?: string, frequency?: string): Mission[] {
  const audiences: MissionAudience[] =
    portfolioType === 'TRADER' || portfolioType === 'INVESTOR'
      ? ['ALL', portfolioType as PortfolioType]
      : ['ALL'];

  return MISSIONS.filter(
    (mission) =>
      audiences.includes(mission.audience) &&
      (!frequency || mission.frequency === frequency),
  );
}

const GAMIFICATION_OVERVIEW: GamificationOverview = {
  balances: {
    points: MOCK_USER.points_balance,
    ai_tokens: MOCK_USER.ai_token_balance,
  },
  streak: {
    current: MOCK_USER.current_streak,
    longest: MOCK_USER.longest_streak,
  },
  rank: 7,
  missions: MISSIONS,
  redemption: {
    points_per_token: 50,
  },
};

const LEADERBOARD_NAMES = [
  'ProTraderTH',
  'GoldScalper',
  'SlowAndSteady',
  'มนุษย์เงินเดือนลงทุน',
  'RiskManagerX',
  'SwingKing',
  MOCK_USER.username,
  'DCAforever',
  'ChartWizard',
  'NightOwlFX',
];

export const coreRoutes = defineMockRoutes([
  // ---------- Auth ----------
  {
    method: 'GET',
    path: '/auth/me',
    handler: () => ({
      user: {
        id: MOCK_USER.id,
        email: MOCK_USER.email,
        username: MOCK_USER.username,
        display_name: MOCK_USER.display_name,
        role: MOCK_USER.role,
        avatar_url: MOCK_USER.avatar_url,
        bio: MOCK_USER.bio,
        subscription_tier: MOCK_USER.subscription_tier,
        points_balance: MOCK_USER.points_balance,
        ai_token_balance: MOCK_USER.ai_token_balance,
        current_streak: MOCK_USER.current_streak,
        longest_streak: MOCK_USER.longest_streak,
        created_at: MOCK_USER.created_at,
      },
    }),
  },

  // ---------- Users ----------
  { method: 'GET', path: '/users/me', handler: () => USER_PROFILE },
  {
    method: 'PATCH',
    path: '/users/me',
    handler: (ctx) => ({
      message: 'อัปเดตโปรไฟล์แล้ว (mock)',
      user: { ...USER_PROFILE, ...ctx.body, updated_at: isoDaysAgo(0) },
    }),
  },
  {
    method: 'DELETE',
    path: '/users/me/avatar',
    handler: () => ({
      message: 'ลบรูปโปรไฟล์แล้ว (mock)',
      user: { id: MOCK_USER.id, avatar_url: null, updated_at: isoDaysAgo(0) },
    }),
  },

  // ---------- Portfolios ----------
  {
    method: 'GET',
    path: '/portfolios',
    handler: (ctx) => {
      const type = ctx.query.type;
      return type
        ? MOCK_PORTFOLIOS.filter((portfolio) => portfolio.portfolio_type === type)
        : [...MOCK_PORTFOLIOS];
    },
  },
  {
    // ต้องมาก่อน '/portfolios/:id' เหมือนฝั่ง controller ไม่งั้น 'quota' โดนจับเป็น id
    method: 'GET',
    path: '/portfolios/quota',
    handler: () => {
      const byType = {
        TRADER: MOCK_PORTFOLIOS.filter((p) => p.portfolio_type === 'TRADER').length,
        INVESTOR: MOCK_PORTFOLIOS.filter((p) => p.portfolio_type === 'INVESTOR').length,
      };

      const used = byType.TRADER + byType.INVESTOR;
      const max = maxPortfoliosForTier(MOCK_USER.subscription_tier);

      return { max, used, remaining: Math.max(0, max - used), byType };
    },
  },
  {
    method: 'GET',
    path: '/portfolios/:id',
    handler: (ctx) => findMockPortfolio(Number(ctx.params.id)) ?? MOCK_PORTFOLIOS[0],
  },
  {
    method: 'POST',
    path: '/portfolios',
    handler: (ctx) => addMockPortfolio(ctx.body),
  },
  {
    method: 'PATCH',
    path: '/portfolios/:id',
    handler: (ctx) => updateMockPortfolio(Number(ctx.params.id), ctx.body),
  },
  {
    method: 'DELETE',
    path: '/portfolios/:id',
    handler: (ctx) => {
      const id = Number(ctx.params.id);
      removeMockPortfolio(id);
      return { message: 'ลบพอร์ตแล้ว (mock)', deleted_id: id };
    },
  },

  // ---------- Records (ledger) ----------
  {
    method: 'GET',
    path: '/records/portfolio/:portfolioId',
    handler: (ctx) => {
      const records = isInvestorPortfolio(ctx.params.portfolioId)
        ? investorRecords()
        : traderRecords();
      const limit = Number(ctx.query.limit ?? 0);
      return limit > 0 ? records.slice(0, limit) : records;
    },
  },
  {
    method: 'GET',
    path: '/records/portfolio/:portfolioId/summary',
    handler: (ctx) => {
      const id = Number(ctx.params.portfolioId);
      const records = isInvestorPortfolio(id) ? investorRecords() : traderRecords();

      const totals: Record<string, { amount: number; count: number }> = {};
      let net = 0;

      for (const record of records) {
        const amount = Number(record.amount);
        totals[record.type] ??= { amount: 0, count: 0 };
        const bucket = totals[record.type];
        if (bucket) {
          bucket.amount = round(bucket.amount + amount);
          bucket.count += 1;
        }
        net += amount;
      }

      return {
        portfolio_id: id,
        totals,
        net_amount: round(net),
        record_count: records.length,
      };
    },
  },

  // ---------- Goals ----------
  {
    method: 'GET',
    path: '/goals/portfolio/:portfolioId',
    handler: (ctx) => (isInvestorPortfolio(ctx.params.portfolioId) ? 25_000 : 3_000),
  },
  {
    method: 'POST',
    path: '/goals/portfolio/:portfolioId',
    handler: (ctx) => ({
      id: 1,
      portfolio_id: Number(ctx.params.portfolioId),
      year: Number(ctx.body.year ?? new Date().getFullYear()),
      month: Number(ctx.body.month ?? new Date().getMonth() + 1),
      target_profit: Number(ctx.body.target ?? 3_000),
    }),
  },

  // ---------- Gamification ----------
  {
    method: 'GET',
    path: '/gamification',
    handler: (ctx) => ({
      ...GAMIFICATION_OVERVIEW,
      missions: missionsFor(ctx.query.portfolio_type, ctx.query.frequency),
    }),
  },
  {
    method: 'GET',
    path: '/gamification/missions',
    handler: (ctx) => missionsFor(ctx.query.portfolio_type, ctx.query.frequency),
  },
  {
    method: 'GET',
    path: '/gamification/leaderboard',
    handler: () =>
      LEADERBOARD_NAMES.map((username, index) => ({
        rank: index + 1,
        id: index + 1,
        username,
        full_name: username,
        avatar_url: null,
        points_balance: 9_800 - index * 640,
        current_streak: 20 - index,
        longest_streak: 34 - index,
      })),
  },
  {
    method: 'POST',
    path: '/gamification/missions/:id/claim',
    handler: (ctx) => ({
      success: true,
      mission_id: Number(ctx.params.id),
      points_received: 50,
      points_balance: MOCK_USER.points_balance + 50,
    }),
  },

  // ---------- Daily PnL (ใช้ในปฏิทินหน้า Dashboard) ----------
  {
    method: 'GET',
    path: '/analytics/portfolio/:portfolioId/daily-pnl',
    // daily P&L เป็นของโหมด Forex เท่านั้น (backend คืนเฉพาะพอร์ต TRADER)
    handler: (ctx) => (isInvestorPortfolio(ctx.params.portfolioId) ? {} : dailyPnlMap()),
  },
]);

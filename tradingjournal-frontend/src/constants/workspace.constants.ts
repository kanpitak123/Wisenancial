import type { WorkspaceType } from 'src/types/workspace.types';

/**
 * หน้าแรกของแต่ละ workspace
 *
 * ตอนนี้ทั้งสองโหมดใช้ URL ชุดเดียวกัน (ไม่มี /forex, /stock prefix)
 * โหมดที่ active เก็บอยู่ใน PortfolioStore.activeType -> localStorage
 */
export const WORKSPACE_HOME_ROUTE = '/Dashboard';

/** ตัวพิมพ์ต้องตรงกับที่ประกาศใน routes.ts */
export const LOGIN_ROUTE = '/Login';

export const WORKSPACE_ROUTES: Record<WorkspaceType, string> = {
  TRADER: WORKSPACE_HOME_ROUTE,
  INVESTOR: WORKSPACE_HOME_ROUTE,
};

/** ป้ายที่ผู้ใช้เห็นจริง — ในโค้ดยังใช้ TRADER/INVESTOR ตาม portfolio_type ใน DB */
export const WORKSPACE_META: Record<WorkspaceType, { label: string; icon: string; color: string }> =
  {
    TRADER: { label: 'Forex', icon: 'candlestick_chart', color: 'deep-purple-5' },
    INVESTOR: { label: 'Stock', icon: 'trending_up', color: 'teal-5' },
  };

export const WORKSPACE_ORDER: readonly WorkspaceType[] = ['TRADER', 'INVESTOR'];

export interface WorkspaceNavLink {
  title: string;
  icon: string;
  link: string;
  /**
   * โผล่บนแถบ dock ล่างโดยตรง — ที่เหลือไปรวมอยู่ใต้ปุ่ม "More"
   *
   * เมนูมี 13-15 รายการต่อโหมด ยัดลง dock เดียวไม่ไหว เลยเลือกไว้โหมดละ 6 ตัว
   * ที่คนเข้าบ่อยสุด (หน้าที่เปิดทุกวัน) ที่เหลือยังกดถึงได้ครบใน More ไม่มีอะไรหาย
   */
  primary?: boolean;
  /**
   * ต้องเป็นสมาชิกแบบเสียเงินถึงจะเข้าได้ — dock จะหรี่ปุ่มลง ติดไอคอนแม่กุญแจ
   * แล้วเด้งไปหน้าอัปเกรดแทนการ navigate
   *
   * ตั้งเฉพาะหน้าที่ backend ล็อกทั้ง controller ไว้ด้วย PaidTierGuard จริงๆ เท่านั้น
   * (Coach Room: coach.controller.ts, Market Pulse: market-insights.controller.ts —
   * ทั้งคู่เป็น @UseGuards(JwtAuthGuard, PaidTierGuard) ระดับ class ไม่มีทางเข้าได้เลย
   * ถ้าไม่ใช่ paid tier) — Analytics ตั้งใจไม่ติดธงนี้ แม้มีบาง endpoint ที่ล็อกอยู่
   * (analytics.controller.ts มีคอมเมนต์บอกไว้ชัดว่าเลิกล็อกทั้ง controller เพราะผู้ใช้
   * free tier ควรดูสรุปพอร์ตของตัวเองได้ฟรี — ติดธงล็อกทั้งเมนูตรงนี้จะขัดกับที่ backend
   * ตั้งใจแก้ไว้แล้ว)
   */
  paid?: boolean;
}

/**
 * เมนู sidebar ของแต่ละโหมด
 *
 * หน้าที่อยู่ใน pages/shared/ ถูกใส่ไว้ทั้งสองโหมดโดยตั้งใจ — ตัวหน้าเองจะอ่าน
 * PortfolioStore.activeType แล้วเปลี่ยนเนื้อหาตามโหมด ส่วนหน้าที่มีเฉพาะโหมดเดียว
 * ต้องมี meta.workspace ใน routes.ts ให้ตรงกันด้วย ไม่งั้น router guard จะเตะออก
 */
export const WORKSPACE_NAV_LINKS: Record<WorkspaceType, readonly WorkspaceNavLink[]> = {
  TRADER: [
    { title: 'Dashboard', icon: 'space_dashboard', link: '/Dashboard', primary: true },
    { title: 'Journal', icon: 'edit_note', link: '/Journal', primary: true },
    { title: 'Active Positions', icon: 'trending_up', link: '/ActivePositions', primary: true },
    { title: 'Asset Explorer', icon: 'candlestick_chart', link: '/AssetExplorer' },
    { title: 'Lot Calculator', icon: 'calculate', link: '/LotCalculator' },
    { title: 'Watchlist', icon: 'star', link: '/Watchlist', primary: true },
    { title: 'Analytics', icon: 'analytics', link: '/Analytics', primary: true },
    { title: 'Goals', icon: 'track_changes', link: '/Goals' },
    { title: 'Portfolios', icon: 'account_balance_wallet', link: '/Portfolio', primary: true },
    { title: 'News', icon: 'newspaper', link: '/News' },
    { title: 'Classroom', icon: 'school', link: '/Classroom' },
    { title: 'Coach Room', icon: 'record_voice_over', link: '/Coach', paid: true },
    { title: 'Community Board', icon: 'forum', link: '/Community' },
    { title: 'Leaderboard', icon: 'emoji_events', link: '/Leaderboard' },
    { title: 'Chat', icon: 'chat', link: '/Chat' },
  ],

  INVESTOR: [
    { title: 'Dashboard', icon: 'space_dashboard', link: '/Dashboard', primary: true },
    // คู่กับ Journal ของโหมด Forex — เป็นหน้าบันทึกรายการของโหมด Stock
    { title: 'Stock Record', icon: 'edit_note', link: '/StockRecord', primary: true },
    // สำรวจหุ้น + วิเคราะห์หุ้น ถูกยุบรวมเป็นหน้าเดียว (แถบสำรวจซ้าย + เทอร์มินัลขวา)
    // เมนูจึงเหลือรายการเดียว ส่วน /StockExplorer กับ /StockAnalysis เดิม redirect มาที่นี่
    { title: 'Stock Terminal', icon: 'candlestick_chart', link: '/Stocks', primary: true },
    // Heatmap + Discover ถูกยุบรวมเป็นหน้าเดียว (แถบอารมณ์ตลาด + แท็บ Heatmap/AI Picks)
    // เมนูจึงเหลือรายการเดียว ส่วน /Heatmap กับ /Discover เดิม redirect มาที่นี่
    { title: 'Market Pulse', icon: 'insights', link: '/Market', primary: true, paid: true },
    { title: 'Watchlist', icon: 'star', link: '/Watchlist', primary: true },
    { title: 'Analytics', icon: 'analytics', link: '/Analytics', primary: true },
    // ⛔ ไม่มี Goals ที่นี่โดยตั้งใจ — GoalsPage ปัจจุบันคิดจาก trades ของฝั่ง Forex
    //    (target profit / win rate ต่อเดือน) ซึ่งเป็น 0 ทั้งแถวในโหมด Stock
    //    Goals เวอร์ชัน stock ตามสเปก 5.6 ยังเป็นงานค้าง ดูหมายเหตุที่ route /Goals ใน routes.ts
    { title: 'Portfolios', icon: 'account_balance_wallet', link: '/Portfolio' },
    { title: 'News', icon: 'newspaper', link: '/News' },
    { title: 'Classroom', icon: 'school', link: '/Classroom' },
    { title: 'Coach Room', icon: 'record_voice_over', link: '/Coach', paid: true },
    { title: 'Community Board', icon: 'forum', link: '/Community' },
    { title: 'Leaderboard', icon: 'emoji_events', link: '/Leaderboard' },
    { title: 'Chat', icon: 'chat', link: '/Chat' },
  ],
};

export const WORKSPACE_MESSAGES = {
  traderPortfolioRequired: 'กรุณาสร้างหรือเลือกพอร์ตเทรดก่อน',
  investorPortfolioRequired: 'กรุณาสร้างหรือเลือกพอร์ตลงทุนก่อน',
  switchFailed: 'สลับโหมดไม่สำเร็จ',
  routeBlocked: (workspace: WorkspaceType) =>
    `หน้านี้ใช้ได้เฉพาะโหมด ${WORKSPACE_META[workspace].label}`,
} as const;

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
    { title: 'Dashboard', icon: 'space_dashboard', link: '/Dashboard' },
    { title: 'Journal', icon: 'edit_note', link: '/Journal' },
    { title: 'Active Positions', icon: 'trending_up', link: '/ActivePositions' },
    { title: 'Asset Explorer', icon: 'candlestick_chart', link: '/AssetExplorer' },
    { title: 'Lot Calculator', icon: 'calculate', link: '/LotCalculator' },
    { title: 'Watchlist', icon: 'star', link: '/Watchlist' },
    { title: 'Analytics', icon: 'analytics', link: '/Analytics' },
    { title: 'Goals', icon: 'track_changes', link: '/Goals' },
    { title: 'Portfolios', icon: 'account_balance_wallet', link: '/Portfolio' },
    { title: 'News', icon: 'newspaper', link: '/News' },
    { title: 'Classroom', icon: 'school', link: '/Classroom' },
    { title: 'Coach Room', icon: 'record_voice_over', link: '/Coach' },
    { title: 'Community Board', icon: 'forum', link: '/Community' },
    { title: 'Leaderboard', icon: 'emoji_events', link: '/Leaderboard' },
    { title: 'Chat', icon: 'chat', link: '/Chat' },
  ],

  INVESTOR: [
    { title: 'Dashboard', icon: 'space_dashboard', link: '/Dashboard' },
    // คู่กับ Journal ของโหมด Forex — เป็นหน้าบันทึกรายการของโหมด Stock
    { title: 'Stock Record', icon: 'edit_note', link: '/StockRecord' },
    // สำรวจหุ้น + วิเคราะห์หุ้น ถูกยุบรวมเป็นหน้าเดียว (แถบสำรวจซ้าย + เทอร์มินัลขวา)
    // เมนูจึงเหลือรายการเดียว ส่วน /StockExplorer กับ /StockAnalysis เดิม redirect มาที่นี่
    { title: 'Stock Terminal', icon: 'candlestick_chart', link: '/Stocks' },
    { title: 'Monthly Movers', icon: 'moving', link: '/MonthlyMovers' },
    { title: 'Heatmap', icon: 'grid_view', link: '/Heatmap' },
    { title: 'Discover', icon: 'auto_awesome', link: '/Discover' },
    { title: 'Watchlist', icon: 'star', link: '/Watchlist' },
    { title: 'Analytics', icon: 'analytics', link: '/Analytics' },
    // ⛔ ไม่มี Goals ที่นี่โดยตั้งใจ — GoalsPage ปัจจุบันคิดจาก trades ของฝั่ง Forex
    //    (target profit / win rate ต่อเดือน) ซึ่งเป็น 0 ทั้งแถวในโหมด Stock
    //    Goals เวอร์ชัน stock ตามสเปก 5.6 ยังเป็นงานค้าง ดูหมายเหตุที่ route /Goals ใน routes.ts
    { title: 'Portfolios', icon: 'account_balance_wallet', link: '/Portfolio' },
    { title: 'News', icon: 'newspaper', link: '/News' },
    { title: 'Classroom', icon: 'school', link: '/Classroom' },
    { title: 'Coach Room', icon: 'record_voice_over', link: '/Coach' },
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

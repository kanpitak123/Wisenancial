import type { RouteRecordRaw } from 'vue-router';

/**
 * meta.workspace = หน้านั้นเปิดได้เฉพาะโหมดนั้น (guard ใน router/index.ts เตะออกถ้าไม่ตรง)
 *   TRADER   -> โหมด Forex
 *   INVESTOR -> โหมด Stock
 * ไม่ใส่ = หน้า shared ใช้ได้ทั้งสองโหมด เนื้อหาเปลี่ยนตาม PortfolioStore.activeType
 */
const routes: RouteRecordRaw[] = [
  // ---------- หน้าแรกสาธารณะ ----------
  // เดิม '/' เด้งเข้า /login ทันที ตอนนี้เป็นหน้าแนะนำผลิตภัณฑ์ (ไม่ต้องล็อกอิน)
  // ต้องอยู่ก่อน route '/' ของ AuthLayout เพราะ path ชนกันพอดี — ตัวแรกที่ตรงชนะ
  //
  // meta.publicLanding บอก guard ว่าคนที่ล็อกอินอยู่แล้วไม่ต้องเห็นหน้าขายของ
  // ให้ส่งไป Dashboard แทน (ดู router/index.ts)
  {
    path: '/',
    component: () => import('pages/public/LandingPage.vue'),
    meta: { publicLanding: true },
  },
  {
    path: '/',
    component: () => import('layouts/AuthLayout.vue'),
    children: [
      { path: 'Login', component: () => import('pages/auth/LoginPage.vue') },
      { path: 'Register', component: () => import('pages/auth/RegisterPage.vue') },
    ],
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      // ---------- shared ----------
      { path: 'Dashboard', component: () => import('pages/shared/DashboardPage.vue') },
      { path: 'Analytics', component: () => import('pages/shared/AnalyticsPage.vue') },
      { path: 'Portfolio', component: () => import('pages/shared/PortfolioPage.vue') },
      { path: 'Watchlist', component: () => import('pages/shared/WatchlistPage.vue') },
      { path: 'News', component: () => import('pages/shared/NewsPage.vue') },
      { path: 'Classroom', component: () => import('pages/shared/ClassroomPage.vue') },
      { path: 'Community', component: () => import('pages/shared/CommunityPage.vue') },
      { path: 'Chat', component: () => import('pages/shared/ChatPage.vue') },
      { path: 'Coach', component: () => import('pages/shared/CoachRoomPage.vue') },

      // ---------- บัญชี/การชำระเงิน (ใช้ได้ทั้งสองโหมด) ----------
      // path ต้องตรงกับ redirect ของ Stripe:
      //   billing.service.ts  -> ${FRONTEND_URL}/AiCredits?success=true|canceled=true
      //   payments.service.ts -> ${FRONTEND_URL}/Upgrade?success=true|canceled=true
      { path: 'AiCredits', component: () => import('pages/shared/AiCreditsPage.vue') },
      { path: 'Upgrade', component: () => import('pages/shared/UpgradePage.vue') },

      // ---------- Forex เท่านั้น ----------
      {
        path: 'Journal',
        component: () => import('pages/trader/JournalPage.vue'),
        meta: { workspace: 'TRADER' },
      },
      {
        path: 'ActivePositions',
        component: () => import('pages/trader/ActivePositionsPage.vue'),
        meta: { workspace: 'TRADER' },
      },
      {
        path: 'AssetExplorer',
        component: () => import('pages/trader/AssetExplorerPage.vue'),
        meta: { workspace: 'TRADER' },
      },
      {
        path: 'LotCalculator',
        component: () => import('pages/trader/LotCalculatorPage.vue'),
        meta: { workspace: 'TRADER' },
      },
      // GoalsPage อยู่ใน pages/shared/ แต่เนื้อหาเป็นของ Forex ล้วน (target profit ต่อเดือน
      // คิดจาก JournalStore.trades) เลยล็อกไว้ที่ TRADER ทั้งเมนูและ URL ตรง
      //
      // ⏳ ค้าง: Goals เวอร์ชันโหมด Stock (สเปก 5.6 — เป้าเงินลงทุน/เป้าปันผลต่อปี)
      //    ยังไม่ได้ทำ ห้ามลบ GoalsPage.vue ทิ้ง ฝั่ง Forex ยังใช้อยู่
      {
        path: 'Goals',
        component: () => import('pages/shared/GoalsPage.vue'),
        meta: { workspace: 'TRADER' },
      },

      // ---------- Stock เท่านั้น ----------
      {
        path: 'StockRecord',
        component: () => import('pages/investor/StockRecordPage.vue'),
        meta: { workspace: 'INVESTOR' },
      },
      // Stock Terminal — /StockExplorer กับ /StockAnalysis เดิมถูกยุบรวมเป็นหน้าเดียว
      // (แถบสำรวจหุ้นซ้าย + เทอร์มินัลวิเคราะห์ขวา)
      //
      // /stock/:symbol ยังเป็น deep link หลักและชี้มาที่ component เดียวกับ /Stocks
      // การคลิกเลือกหุ้นจึงเปลี่ยนแค่ params ไม่ remount ทั้งหน้า
      {
        path: 'Stocks',
        component: () => import('pages/investor/StockTerminalPage.vue'),
        meta: { workspace: 'INVESTOR' },
      },
      {
        path: 'stock/:symbol',
        component: () => import('pages/investor/StockTerminalPage.vue'),
        meta: { workspace: 'INVESTOR' },
      },
      // ลิงก์เก่าที่อาจถูก bookmark ไว้ — ส่งต่อแทนการปล่อยให้ตก 404
      { path: 'StockExplorer', redirect: '/Stocks' },
      { path: 'StockAnalysis', redirect: '/Stocks' },
      {
        path: 'MonthlyMovers',
        component: () => import('pages/investor/MonthlyMoversPage.vue'),
        meta: { workspace: 'INVESTOR' },
      },
    ],
  },

  // ---------- Dev-only: ดูตัวอย่าง design token/component ใหม่ (rebrand 2026-08-17) ----------
  // ไม่ผูก auth, ไม่มีลิงก์จาก sidebar — เข้าตรง URL เท่านั้น ตัวหน้าเองบล็อกการแสดงผลถ้า
  // import.meta.env.PROD (ดู DesignPreviewPage.vue) กันไม่ให้หลุดไปโผล่ใน production build จริง
  {
    path: '/dev/design-preview',
    component: () => import('pages/dev/DesignPreviewPage.vue'),
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/system/ErrorNotFound.vue'),
  },
];

export default routes;

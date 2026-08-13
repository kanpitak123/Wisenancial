import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/AuthLayout.vue'),
    children: [
      { path: '', redirect: '/login' },
      { path: 'Login', component: () => import('pages/LoginPage.vue') },
      { path: 'Register', component: () => import('pages/RegisterPage.vue') },
    ],
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: 'Dashboard', component: () => import('pages/DashboardPage.vue') },
      {
        path: 'Journal',
        component: () => import('pages/JournalPage.vue'),
      },
      { path: 'Analytics', component: () => import('pages/AnalyticsPage.vue') },
      { path: 'Portfolio', component: () => import('pages/PortfolioPage.vue') },
      { path: 'Goals', component: () => import('pages/GoalsPage.vue') },
      { path: 'LotCalculator', component: () => import('pages/LotCalculatorPage.vue') },
      { path: 'Classroom', component: () => import('pages/ClassroomPage.vue') },
      { path: 'Community', component: () => import('pages/CommunityPage.vue') },
      { path: 'Chat', component: () => import('pages/ChatPage.vue') },
      { path: 'News', component: () => import('pages/NewsPage.vue') },
      { path: 'ActivePositions', component: () => import('pages/ActivePositionsPage.vue') },
      { path: 'AssetExplorer', component: () => import('pages/AssetExplorerPage.vue') },
      { path: 'Watchlist', component: () => import('pages/WatchlistPage.vue') },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

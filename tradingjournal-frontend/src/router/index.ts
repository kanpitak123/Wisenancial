// index.ts
import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
  type NavigationGuardNext,
  type RouteLocationNormalized,
} from 'vue-router';

import { Notify } from 'quasar';

import routes from './routes';
import { useAuthStore } from 'stores/AuthStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import {
  LOGIN_ROUTE,
  WORKSPACE_HOME_ROUTE,
  WORKSPACE_MESSAGES,
} from 'src/constants/workspace.constants';

export default defineRouter(function () {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  // 🔐 Auth Guard ต้องอยู่ตรงนี้
  router.beforeEach(
    (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
      const auth = useAuthStore();

      // เปิดใช้งานอีกครั้ง — ปลอดภัยแล้วเพราะ AuthStore อ่าน token/user จาก localStorage
      // แบบ synchronous ตอนสร้าง state (ดู AuthStore.state) เลยไม่มีจังหวะที่ isAuthenticated
      // เป็น false ชั่วคราวตอนรีเฟรชอีกต่อไป
      //
      // ถ้าไม่เปิด ผู้ใช้ที่ยังไม่ล็อกอินจะเดินเข้าหน้าที่ต้องมี token ได้ แล้วทุก API ตอบ 401
      if (to.meta.requiresAuth && !auth.isAuthenticated) {
        next(LOGIN_ROUTE);
        return;
      }

      if (auth.isAuthenticated && to.path.toLowerCase() === LOGIN_ROUTE.toLowerCase()) {
        // เด้งไป Dashboard เพราะเป็นหน้าที่เปิดได้ทั้งโหมด Forex และ Stock
        // (เดิมเด้งไป /journal ซึ่งตอนนี้เป็นหน้าเฉพาะโหมด Forex แล้ว)
        next(WORKSPACE_HOME_ROUTE);
        return;
      }

      // 🔀 Workspace Guard — กันเข้าหน้าที่ไม่ใช่ของโหมดปัจจุบัน
      const requiredWorkspace = to.meta.workspace;

      if (requiredWorkspace && usePortfolioStore().activeType !== requiredWorkspace) {
        Notify.create({
          type: 'warning',
          message: WORKSPACE_MESSAGES.routeBlocked(requiredWorkspace),
          position: 'top',
        });

        next(WORKSPACE_HOME_ROUTE);
        return;
      }

      next();
    },
  );

  return router;
});

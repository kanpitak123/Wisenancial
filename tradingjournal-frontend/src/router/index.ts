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

import routes from './routes';
import { useAuthStore } from 'stores/AuthStore';

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

      // คอมเมนต์ส่วนนี้ไว้ เพื่อไม่ให้โดนเตะกลับไปหน้า Login เวลารีเฟรช
      /*
      if (to.meta.requiresAuth && !auth.isAuthenticated) {
        next('/login');
        return;
      }
      */

      if (auth.isAuthenticated && to.path === '/login') {
        // แอบแก้ตรงนี้ให้นิดนึงครับ จาก /app/dashboard เป็น /journal ให้ตรงกับ route ที่มี
        next('/journal');
        return;
      }

      next();
    },
  );

  return router;
});

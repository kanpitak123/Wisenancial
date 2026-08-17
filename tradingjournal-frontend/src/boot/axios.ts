import { defineBoot } from '#q-app/wrappers';
import axios, { AxiosError, type AxiosInstance } from 'axios';
import { API_BASE_URL, AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import { LOGIN_ROUTE } from 'src/constants/workspace.constants';
import { installMockAdapter } from 'src/mocks';
import { useAuthStore } from 'stores/AuthStore';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

// ใช้ API_BASE_URL ตัวเดียวกับ auth.api.ts จะได้ไม่มี URL backend สองที่ให้ลืมแก้ตอน deploy
const api = axios.create({ baseURL: API_BASE_URL });

// Mock mode — ดักที่ชั้น adapter ทุก request ที่ผ่าน instance นี้จึงถูกครอบทั้งหมด
// โดยที่ service/store/page ไม่ต้องรู้เรื่องเลย (ปิด flag = กลับไปยิง backend จริงทันที)
installMockAdapter(api);

// =================================================================
// 🟢 Request — แนบ Token อัตโนมัติ
// =================================================================
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  },
);

export default defineBoot(({ app, router, store }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;

  // ===============================================================
  // 🔒 Response — token หมดอายุ/ใช้ไม่ได้ ให้ล้าง session แล้วกลับไปหน้า Login
  //    ไม่งั้น token เสียจะค้างใน localStorage แล้วทุกหน้าจะ 401 ไปเรื่อย ๆ
  // ===============================================================
  api.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const status = error instanceof AxiosError ? error.response?.status : undefined;

      // ───────────────────────────────────────────────────────────────
      // ตอน dev หน้าบ้านมักขึ้นก่อน backend เสร็จ -> คำขอชุดแรกได้
      // ERR_CONNECTION_REFUSED ทั้งที่อีกไม่กี่วินาที backend ก็พร้อม
      // ลองซ้ำให้เงียบ ๆ "ครั้งเดียว" เฉพาะ GET ที่ไม่มี response กลับมาเลย
      // (POST/PATCH ไม่ลองซ้ำ เพราะอาจไปสร้างข้อมูลซ้ำถ้าที่จริงคำขอถึงปลายทางแล้ว)
      // ───────────────────────────────────────────────────────────────
      if (error instanceof AxiosError && !error.response) {
        const config = error.config as
          | (typeof error.config & { _retriedOnce?: boolean })
          | undefined;

        const isGet = (config?.method ?? 'get').toLowerCase() === 'get';

        if (config && isGet && !config._retriedOnce) {
          config._retriedOnce = true;

          await new Promise((resolve) => setTimeout(resolve, 1200));

          return api.request(config);
        }
      }

      if (status === 401) {
        useAuthStore(store).clearSession();

        if (router.currentRoute.value.path.toLowerCase() !== LOGIN_ROUTE.toLowerCase()) {
          void router.replace(LOGIN_ROUTE);
        }
      }

      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    },
  );
});

export { api };

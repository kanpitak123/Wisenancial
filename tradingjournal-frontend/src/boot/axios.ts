import { defineBoot } from '#q-app/wrappers';
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, AUTH_ENDPOINTS, AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import { LOGIN_ROUTE } from 'src/constants/workspace.constants';
import { installMockAdapter } from 'src/mocks';
import { useAuthStore } from 'stores/AuthStore';
import type { AuthUser } from 'src/types/auth.types';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

/** config ที่ติดธงไว้แล้วว่าเคยลองซ้ำไปรอบหนึ่ง — กันวนไม่รู้จบ */
type RetryableConfig = InternalAxiosRequestConfig & {
  _retriedOnce?: boolean;
  _authRetried?: boolean;
};

// ใช้ API_BASE_URL ตัวเดียวกับ auth.api.ts จะได้ไม่มี URL backend สองที่ให้ลืมแก้ตอน deploy
const api = axios.create({
  baseURL: API_BASE_URL,

  // refresh token อยู่ใน httpOnly cookie — ถ้าไม่เปิด withCredentials เบราว์เซอร์
  // จะไม่แนบ cookie ไปกับ request ข้าม origin (:9000 -> :3000) เลย
  // (ฝั่ง backend เปิด credentials + ระบุ origin ชัดไว้แล้วใน main.ts)
  withCredentials: true,
});

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

// =================================================================
// 🔄 Silent refresh — single flight
//
// ถ้า 3 request ได้ 401 พร้อมกัน เราไม่อยากยิง /auth/refresh 3 ครั้ง เพราะ backend
// ทำ token rotation ไว้: ใบแรกที่ refresh สำเร็จจะเผา token เดิมทิ้ง อีก 2 ใบที่ตามมา
// จะกลายเป็น "reuse" ทันที แล้วโดน revoke ทั้ง family = ผู้ใช้หลุดทั้งที่ไม่มีอะไรผิด
//
// เก็บ promise ไว้ระดับโมดูล ใครมาทีหลังระหว่างที่ยังไม่เสร็จก็รอผลก้อนเดียวกัน
// =================================================================
let refreshPromise: Promise<AuthUser | null> | null = null;

function refreshOnce(refresh: () => Promise<AuthUser | null>): Promise<AuthUser | null> {
  if (!refreshPromise) {
    // ตั้งค่าให้เสร็จก่อนค่อยผูก cleanup ไม่งั้นถ้า promise settle เร็วมาก
    // ตัว finally อาจล้างค่าทิ้งก่อนที่จะได้ถูกเก็บลงตัวแปรด้วยซ้ำ
    refreshPromise = refresh();

    void refreshPromise.finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/** เผื่อเทส/hot reload — ไม่ให้ promise ค้างข้ามชุดเทส */
export function resetRefreshState() {
  refreshPromise = null;
}

export default defineBoot(({ app, router, store }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;

  const forceLogout = () => {
    useAuthStore(store).clearSession();

    if (router.currentRoute.value.path.toLowerCase() !== LOGIN_ROUTE.toLowerCase()) {
      void router.replace(LOGIN_ROUTE);
    }
  };

  // ===============================================================
  // 🔒 Response — 401 ให้ลองต่ออายุเงียบ ๆ ก่อน ค่อยเตะกลับหน้า Login
  // ===============================================================
  api.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const axiosError = error instanceof AxiosError ? error : undefined;
      const status = axiosError?.response?.status;

      // ───────────────────────────────────────────────────────────────
      // ตอน dev หน้าบ้านมักขึ้นก่อน backend เสร็จ -> คำขอชุดแรกได้
      // ERR_CONNECTION_REFUSED ทั้งที่อีกไม่กี่วินาที backend ก็พร้อม
      // ลองซ้ำให้เงียบ ๆ "ครั้งเดียว" เฉพาะ GET ที่ไม่มี response กลับมาเลย
      // (POST/PATCH ไม่ลองซ้ำ เพราะอาจไปสร้างข้อมูลซ้ำถ้าที่จริงคำขอถึงปลายทางแล้ว)
      // ───────────────────────────────────────────────────────────────
      if (axiosError && !axiosError.response) {
        const config = axiosError.config as RetryableConfig | undefined;

        const isGet = (config?.method ?? 'get').toLowerCase() === 'get';

        if (config && isGet && !config._retriedOnce) {
          config._retriedOnce = true;

          await new Promise((resolve) => setTimeout(resolve, 1200));

          return api.request(config);
        }
      }

      if (status === 401) {
        const config = axiosError?.config as RetryableConfig | undefined;
        const url = config?.url ?? '';

        // /auth/refresh กับ /auth/logout ยิงผ่าน fetch ใน auth.api.ts อยู่แล้ว
        // ไม่ได้ผ่าน instance นี้ แต่กันไว้เผื่อวันหลังมีใครย้ายมาใช้ axios
        // ไม่งั้น refresh ที่ 401 จะไปกระตุ้น refresh ซ้อนตัวเองไม่รู้จบ
        const isAuthFlowRequest =
          url.includes(AUTH_ENDPOINTS.refresh) || url.includes(AUTH_ENDPOINTS.logout);

        if (config && !config._authRetried && !isAuthFlowRequest) {
          // ธงนี้ผูกกับ request ตัวนี้ตัวเดียว — ต่อให้ refresh สำเร็จแล้วยิงซ้ำ
          // แล้วยัง 401 อีก ก็จะไม่วนต่อ ตกไปที่ forceLogout แทน
          config._authRetried = true;

          const auth = useAuthStore(store);
          const user = await refreshOnce(() => auth.refreshSession());

          if (user) {
            const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);

            if (token) {
              config.headers.Authorization = `Bearer ${token}`;
            }

            return api.request(config);
          }
        }

        forceLogout();
      }

      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    },
  );
});

export { api };

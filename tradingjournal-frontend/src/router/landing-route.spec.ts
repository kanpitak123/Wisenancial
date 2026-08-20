/**
 * เส้นทางของหน้าแรกสาธารณะ
 *
 * '/' เคย redirect ไป /login มาตลอด การเปลี่ยนให้ render หน้าขายของแทนทำให้พังเงียบได้
 * สองทาง: (1) คนที่ล็อกอินค้างไว้เปิดแอปมาเจอหน้าขายของแทนที่ทำงาน
 * (2) route '/' ของ AuthLayout ถูกจับคู่ก่อนจนหน้าแรกไม่เคยถูกเรียกเลย
 */
import { createPinia, setActivePinia } from 'pinia';
import { Notify } from 'quasar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from 'stores/AuthStore';
import { WORKSPACE_HOME_ROUTE } from 'src/constants/workspace.constants';

import createRouter from './index';
import routes from './routes';
import type { Router } from 'vue-router';

vi.mock('src/services/auth.api', () => ({
  authApi: { login: vi.fn(), register: vi.fn(), me: vi.fn() },
}));

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(),
    getQuota: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

/** defineRouter ถูก stub ให้คืนฟังก์ชันเดิม — เรียกตรงๆ ได้ router จริงพร้อม guard */
function makeRouter(): Router {
  return (createRouter as unknown as () => Router)();
}

/** lazy import ของหน้าปลายทางต้องคอมไพล์ครั้งแรก ซึ่งกินเวลาเกิน default 5s ได้ */
const NAVIGATION_TIMEOUT_MS = 30_000;

describe('หน้าแรกสาธารณะ', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    Notify.create = vi.fn();
  });

  it("'/' ผูกกับ LandingPage และต้องมาก่อน route '/' ตัวอื่น ไม่งั้นไม่มีวันถูกจับคู่", () => {
    const first = routes.find((route) => route.path === '/');

    expect(first?.redirect, "'/' ไม่ควร redirect แล้ว").toBeUndefined();
    expect(Function.prototype.toString.call(first?.component)).toContain('LandingPage');
  });

  it('ยังไม่ล็อกอินแล้วเปิด / -> เห็นหน้าแรก ไม่ถูกเด้งไป /Login', async () => {
    const router = makeRouter();

    await router.push('/');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/');
    expect(router.currentRoute.value.meta.publicLanding).toBe(true);
  }, NAVIGATION_TIMEOUT_MS);

  it('ล็อกอินอยู่แล้วเปิด / -> ไปที่ Dashboard ไม่ต้องเห็นหน้าขายของ', async () => {
    const auth = useAuthStore();

    auth.user = { id: 1, email: 'demo@wisenancial.app' } as never;
    auth.accessToken = 'token';

    const router = makeRouter();

    await router.push('/');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe(WORKSPACE_HOME_ROUTE);
  }, NAVIGATION_TIMEOUT_MS);

  it('/Login กับ /Register ยังเข้าได้ตามเดิม (กัน route ใหม่บังทั้งกลุ่ม)', async () => {
    for (const path of ['/Login', '/Register']) {
      setActivePinia(createPinia());

      const router = makeRouter();

      await router.push(path);
      await router.isReady();

      expect(router.currentRoute.value.path, path).toBe(path);
    }
  }, NAVIGATION_TIMEOUT_MS);
});

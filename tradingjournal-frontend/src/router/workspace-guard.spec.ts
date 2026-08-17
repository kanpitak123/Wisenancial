/**
 * Workspace guard — หน้าที่ผูกกับโหมดเดียวต้องเข้าตรงผ่าน URL ไม่ได้
 *
 * ที่ต้องมีเทสนี้เพราะ /Goals อยู่ใน pages/shared/ (ชื่อโฟลเดอร์หลอกตา) แต่เนื้อหา
 * เป็นของ Forex ล้วน — การเอาออกจากเมนูอย่างเดียวไม่พอ ถ้า meta.workspace หายไป
 * ผู้ใช้โหมด Stock จะพิมพ์ URL เข้าไปเจอหน้าเปล่าที่ทุกตัวเลขเป็น 0
 */
import { createPinia, setActivePinia } from 'pinia';
import { Notify } from 'quasar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from 'stores/AuthStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import createRouter from './index';
import routes from './routes';
import { WORKSPACE_HOME_ROUTE, WORKSPACE_NAV_LINKS } from 'src/constants/workspace.constants';
import type { Router } from 'vue-router';
import type { WorkspaceType } from 'src/types/workspace.types';

const notify = vi.fn();

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

/** meta.workspace ของ path ที่กำหนด (route ทั้งหมดเป็นลูกของ MainLayout) */
function workspaceMetaOf(path: string): WorkspaceType | undefined {
  const children = routes.find((route) => route.children?.some((child) => child.path === path))
    ?.children;

  return children?.find((child) => child.path === path)?.meta?.workspace;
}

/** defineRouter ถูก stub ให้คืนฟังก์ชันเดิม — เรียกตรงๆ ได้ router จริงพร้อม guard */
function makeRouter(): Router {
  return (createRouter as unknown as () => Router)();
}

/**
 * เทสที่ router.push จริงต้องรอ vitest คอมไพล์ chunk ของหน้าปลายทาง (lazy import)
 * ครั้งแรก ซึ่งกินเวลาเกิน default 5s ได้ตอนรันทั้งชุดพร้อมกัน — ไม่ใช่ความช้าของ guard
 */
const NAVIGATION_TIMEOUT_MS = 30_000;

describe('workspace guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    // guard เรียก Notify.create ตอนเตะออก — เทสนี้ไม่ได้ mount app เลยยังไม่มีตัวจริง
    Notify.create = notify;

    const auth = useAuthStore();

    auth.user = { id: 1, email: 'demo@wisenancial.app' } as never;
    auth.accessToken = 'token';
  });

  it('/Goals ถูกล็อกไว้ที่โหมด Forex ใน routes.ts', () => {
    expect(workspaceMetaOf('Goals')).toBe('TRADER');
  });

  it('เมนูโหมด Stock ไม่มี Goals แต่โหมด Forex ยังมี', () => {
    const titles = (type: WorkspaceType) => WORKSPACE_NAV_LINKS[type].map((link) => link.title);

    expect(titles('INVESTOR')).not.toContain('Goals');
    expect(titles('TRADER')).toContain('Goals');
  });

  it('อยู่โหมด Stock แล้วพิมพ์ /Goals ตรงๆ -> โดนเตะกลับ Dashboard', async () => {
    usePortfolioStore().setActiveType('INVESTOR');

    const router = makeRouter();

    await router.push('/Goals');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe(WORKSPACE_HOME_ROUTE);
  }, NAVIGATION_TIMEOUT_MS);

  it('อยู่โหมด Forex แล้วเข้า /Goals -> เข้าได้ตามปกติ (กัน regress)', async () => {
    usePortfolioStore().setActiveType('TRADER');

    const router = makeRouter();

    await router.push('/Goals');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/Goals');
  }, NAVIGATION_TIMEOUT_MS);

  it('/Dashboard เข้าได้ทั้งสองโหมด', async () => {
    for (const type of ['TRADER', 'INVESTOR'] as const) {
      setActivePinia(createPinia());

      const auth = useAuthStore();

      auth.user = { id: 1, email: 'demo@wisenancial.app' } as never;
      auth.accessToken = 'token';
      usePortfolioStore().setActiveType(type);

      const router = makeRouter();

      await router.push(WORKSPACE_HOME_ROUTE);
      await router.isReady();

      expect(router.currentRoute.value.path, `โหมด ${type}`).toBe(WORKSPACE_HOME_ROUTE);
    }
  }, NAVIGATION_TIMEOUT_MS);
});

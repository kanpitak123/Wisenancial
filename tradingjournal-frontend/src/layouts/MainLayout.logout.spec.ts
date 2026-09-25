/**
 * Sign out ต้องบอก backend ให้ revoke refresh token จริง (POST /auth/logout) ก่อนล้างของในเครื่อง
 *
 * ของเดิม handleLogout ล้างแค่ localStorage — refresh token ใน cookie ยังใช้ได้บน server
 * จนหมดอายุเอง แต่ถ้าเรียก server ไม่ถึง (ออฟไลน์/backend ล่ม) ก็ยังต้องออกจากระบบฝั่งเครื่องได้
 */
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout } from 'quasar';
import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { AUTH_STORAGE_KEYS } from 'src/constants/auth.constants';
import MainLayout from './MainLayout.vue';

const portfolioGetAll = vi.fn();
const tradeGetByPortfolio = vi.fn();
const authLogout = vi.fn();

vi.mock('src/services/auth.api', () => ({
  authApi: {
    logout: (...args: unknown[]) => authLogout(...args),
    readStoredToken: () => localStorage.getItem('access_token'),
  },
}));

vi.mock('src/services/user.service', () => ({
  userService: {
    getMe: vi.fn().mockResolvedValue({
      id: 1,
      username: 'demo',
      full_name: 'Demo',
      email: 'demo@wisenancial.app',
      role: 'USER',
      subscription_tier: 'PACK_279',
    }),
    update: vi.fn(),
  },
  getUserErrorMessage: (_e: unknown, f: string) => f,
}));

vi.mock('src/services/gamification.service', () => ({
  gamificationService: {
    fetchOverview: vi.fn().mockResolvedValue(null),
    fetchMissions: vi.fn().mockResolvedValue([]),
    fetchLeaderboard: vi.fn().mockResolvedValue([]),
    claimMission: vi.fn(),
    redeemTokens: vi.fn(),
    recordEvent: vi.fn(),
  },
  getGamificationErrorMessage: () => 'err',
}));

vi.mock('src/services/trade.service', () => ({
  tradeService: {
    leaderboard: vi.fn().mockResolvedValue([]),
    getByPortfolio: (...a: unknown[]) => tradeGetByPortfolio(...a),
  },
  getTradeErrorMessage: (_e: unknown, f: string) => f,
}));

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: (...a: unknown[]) => portfolioGetAll(...a),
    getQuota: vi.fn().mockResolvedValue(null),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (_e: unknown, f: string) => f,
}));

vi.mock('src/services/records.service', () => ({
  recordsService: { getAll: vi.fn().mockResolvedValue([]), getSummary: vi.fn().mockResolvedValue({}) },
  getRecordErrorMessage: (_e: unknown, f: string) => f,
}));

vi.mock('src/services/investor-portfolio.service', () => ({
  investorPortfolioService: {
    getDashboard: vi.fn().mockResolvedValue({ data: null }),
    getSales: vi.fn().mockResolvedValue({ data: [] }),
    getTimeline: vi.fn().mockResolvedValue({ data: [] }),
    getPerformance: vi.fn().mockResolvedValue({ data: [] }),
    buy: vi.fn(),
    sell: vi.fn(),
  },
}));

vi.mock('src/services/stock-purchases.service', () => ({
  stockPurchasesService: { getAll: vi.fn().mockResolvedValue([]), getOne: vi.fn() },
}));

vi.mock('src/services/dividend.service', () => ({
  dividendService: { getAll: vi.fn().mockResolvedValue([]), getSummary: vi.fn().mockResolvedValue({}) },
  getDividendErrorMessage: (_e: unknown, f: string) => f,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/Dashboard', query: {}, meta: {} }),
  RouterView: { render: () => h('div') },
}));


describe('MainLayout — Sign out', () => {
  let tokenSeenByServer: string | null;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    portfolioGetAll.mockResolvedValue([]);
    tradeGetByPortfolio.mockResolvedValue([]);
    tokenSeenByServer = null;

    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal('location', { href: '/Dashboard' });

    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, 'jwt');
    localStorage.setItem(AUTH_STORAGE_KEYS.user, '{"id":1}');
    localStorage.setItem('darkMode', 'true');
    localStorage.setItem('leftover-cache', 'x');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const clickSignOut = async () => {
    const wrapper = mount({ render: () => h(QLayout, () => [h(MainLayout)]) }, {
      attachTo: document.body,
      global: {
        stubs: {
          CommandPalette: true,
          PrivacyMode: true,
          MissionDialog: true,
          GlobalDateFilter: true,
          MockModeToggle: true,
          WorkspaceSwitcher: true,
          'router-view': true,
        },
      },
    });
    await flushPromises();

    await wrapper.find('.account-btn').trigger('click');
    await nextTick();
    await nextTick();

    const item = document.querySelector<HTMLElement>('[data-test="account-menu-logout"]');
    expect(item, 'ต้องมีปุ่ม Sign out').not.toBeNull();

    item!.click();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
  };

  it('เรียก POST /auth/logout ก่อนล้างของในเครื่อง (server ยังเห็น token อยู่ตอนถูกเรียก)', async () => {
    authLogout.mockImplementation(() => {
      tokenSeenByServer = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);

      return Promise.resolve({ message: 'ok' });
    });

    await clickSignOut();

    expect(authLogout).toHaveBeenCalledTimes(1);
    expect(tokenSeenByServer).toBe('jwt');
  });

  it('สำเร็จ -> ล้าง session/localStorage (คง darkMode ไว้) แล้วไปหน้า Login', async () => {
    authLogout.mockResolvedValue({ message: 'ok' });

    await clickSignOut();

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).toBeNull();
    expect(localStorage.getItem('leftover-cache')).toBeNull();
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(window.location.href).toBe('/Login');
  });

  it('ยิง /auth/logout ไม่สำเร็จ (ออฟไลน์/backend ล่ม) -> ยังออกจากระบบฝั่งเครื่องและไปหน้า Login', async () => {
    authLogout.mockRejectedValue(new Error('Failed to fetch'));

    await clickSignOut();

    expect(authLogout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem('leftover-cache')).toBeNull();
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(window.location.href).toBe('/Login');
  });
});

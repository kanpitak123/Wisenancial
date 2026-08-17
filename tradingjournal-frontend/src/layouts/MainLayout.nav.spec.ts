/**
 * เทสวินิจฉัย: sidebar เปลี่ยนตามโหมดจริงหรือไม่
 *
 * ผู้ใช้รายงานว่าสลับไปโหมด Stock แล้วเมนูยังเป็นของ Forex — ไฟล์นี้มีไว้พิสูจน์ว่า
 * ตัว binding (navLinks -> WORKSPACE_NAV_LINKS[activeType]) ทำงานถูกหรือเปล่า
 * ถ้าเทสนี้ผ่าน แปลว่าปัญหาอยู่ที่ runtime (activeType ไม่ถูกเปลี่ยน) ไม่ใช่ที่ binding
 */
import { config, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from 'src/composables/useWorkspace';
import { useInvestorStore } from 'stores/InvestorStore';
import { useJournalStore } from 'stores/JournalStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import MainLayout from './MainLayout.vue';

const portfolioGetAll = vi.fn();
const tradeGetByPortfolio = vi.fn();

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

/** ดึงชื่อเมนูที่ render อยู่จริงบน sidebar */
function menuTitles(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('.sidebar-list .q-item__label')
    .map((node) => node.text().trim())
    .filter((text) => text.length > 0);
}

describe('MainLayout — sidebar ตามโหมด', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    portfolioGetAll.mockResolvedValue([]);
    tradeGetByPortfolio.mockResolvedValue([]);

    // ลูกที่ไม่เกี่ยวกับเมนู stub ทิ้งให้ mount เร็วและไม่ยิง API
    config.global.stubs = {
      ...(config.global.stubs as Record<string, unknown>),
      CommandPalette: true,
      PrivacyMode: true,
      MissionDialog: true,
      GlobalDateFilter: true,
      MockModeToggle: true,
      WorkspaceSwitcher: true,
      'router-view': true,
    };
  });

  const mountLayout = async () => {
    const wrapper = mount({ render: () => h(QLayout, () => [h(MainLayout)]) }, {
      attachTo: document.body,
    });

    await nextTick();
    await nextTick();

    return wrapper;
  };

  /** useWorkspace ใช้ได้เฉพาะใน setup() — ห่อด้วย component จิ๋ว */
  const mountWorkspaceApi = () => {
    let api!: ReturnType<typeof useWorkspace>;

    mount({
      setup() {
        api = useWorkspace();
        return () => h('div');
      },
    });

    return api;
  };

  it('โหมด Forex (ค่าเริ่มต้น) แสดงเมนูของ TRADER', async () => {
    const wrapper = await mountLayout();
    const titles = menuTitles(wrapper);

    expect(titles).toContain('Journal');
    expect(titles).toContain('Lot Calculator');
    // Goals เป็นของ Forex — ต้องยังอยู่หลังถูกถอดออกจากเมนูโหมด Stock
    expect(titles).toContain('Goals');
    expect(titles).not.toContain('Stock Record');
    expect(titles).not.toContain('Stock Terminal');
  });

  it('เปลี่ยน activeType เป็น INVESTOR แล้วเมนูต้องเปลี่ยนตาม', async () => {
    const wrapper = await mountLayout();
    const store = usePortfolioStore();

    store.setActiveType('INVESTOR');
    await nextTick();

    const titles = menuTitles(wrapper);

    expect(titles).toContain('Stock Record');
    // เดิมเป็นสองรายการ (Stock Explorer + Stock Analysis) ตอนนี้ยุบเป็นหน้าเดียว
    expect(titles).toContain('Stock Terminal');
    expect(titles).not.toContain('Stock Explorer');
    expect(titles).not.toContain('Stock Analysis');
    expect(titles).toContain('Monthly Movers');
    expect(titles).not.toContain('Journal');
    expect(titles).not.toContain('Lot Calculator');
    expect(titles).not.toContain('Active Positions');
    // GoalsPage คิดเป้าจาก trades ของ Forex — โหมด Stock ยังไม่มีตัวเทียบ (สเปก 5.6 ค้างอยู่)
    expect(titles).not.toContain('Goals');
  });

  it('สลับกลับไปกลับมา 3 รอบ เมนูเปลี่ยนถูกทุกรอบ', async () => {
    const wrapper = await mountLayout();
    const store = usePortfolioStore();

    for (let round = 1; round <= 3; round++) {
      store.setActiveType('INVESTOR');
      await nextTick();

      expect(menuTitles(wrapper), `รอบ ${round} (Stock)`).toContain('Stock Record');
      expect(menuTitles(wrapper), `รอบ ${round} (Stock)`).not.toContain('Journal');

      store.setActiveType('TRADER');
      await nextTick();

      expect(menuTitles(wrapper), `รอบ ${round} (Forex)`).toContain('Journal');
      expect(menuTitles(wrapper), `รอบ ${round} (Forex)`).not.toContain('Stock Record');
    }
  });

  // ── ไล่หาสาเหตุที่ activeType ไม่เปลี่ยนตอนรันจริง ──────────────────────────
  describe('เดินผ่าน switchTo() จริง ไม่ใช่ setActiveType ตรงๆ', () => {
    it('switchTo สำเร็จ -> เมนูเปลี่ยน', async () => {
      const wrapper = await mountLayout();
      const workspace = mountWorkspaceApi();

      await workspace.switchTo('INVESTOR');
      await nextTick();

      expect(menuTitles(wrapper)).toContain('Stock Record');
    });

    it('โหลดพอร์ตล้มเหลว -> ยัง throw แต่เมนูเปลี่ยนแล้ว (setActiveType อยู่ก่อน await)', async () => {
      const wrapper = await mountLayout();
      const workspace = mountWorkspaceApi();

      portfolioGetAll.mockRejectedValue(new Error('401'));

      await expect(workspace.switchTo('INVESTOR')).rejects.toBeDefined();
      await nextTick();

      expect(menuTitles(wrapper)).toContain('Stock Record');
    });

    // D1 — เดิมถ้า store ปลายทาง loading ค้างอยู่ initialize() จะ return เงียบๆ
    // ทำให้ setActiveType ไม่ถูกเรียก เมนูค้างโหมดเดิม แต่ switchTo ยังคืน true
    it('store ปลายทางมีรอบค้างอยู่ -> เมนูต้องเปลี่ยนอยู่ดี', async () => {
      const wrapper = await mountLayout();
      const workspace = mountWorkspaceApi();
      const investorStore = useInvestorStore();

      investorStore.loading = true;

      const result = await workspace.switchTo('INVESTOR');
      await nextTick();

      expect(result).toBe(true);
      expect(usePortfolioStore().activeType).toBe('INVESTOR');
      expect(menuTitles(wrapper)).toContain('Stock Record');
      expect(menuTitles(wrapper)).not.toContain('Journal');
    });

    it('มีรอบ initialize ค้างอยู่ -> เรียกซ้ำต้องรอตัวเดิม ไม่ยิงซ้อน', async () => {
      const workspace = mountWorkspaceApi();
      const investorStore = useInvestorStore();

      let release: (value: unknown) => void = () => {};
      portfolioGetAll.mockImplementationOnce(
        () => new Promise((resolve) => { release = resolve; }),
      );

      const first = workspace.switchTo('INVESTOR');
      await new Promise((resolve) => setTimeout(resolve, 0));

      // เรียก initialize ซ้ำระหว่างที่รอบแรกยังค้าง -> ต้องได้ promise เดิม ไม่ยิง API ใหม่
      const callsBefore = portfolioGetAll.mock.calls.length;
      const second = investorStore.initialize();

      expect(portfolioGetAll.mock.calls.length).toBe(callsBefore);

      release([]);
      await Promise.all([first, second]);

      expect(usePortfolioStore().activeType).toBe('INVESTOR');
    });

    // D2 — generation token ใน TraderStore/InvestorStore ทำให้ผลของรอบที่ล้าสมัยถูกทิ้ง
    it('initialize ของโหมดเดิมที่ค้างอยู่ ต้องไม่ยัดข้อมูล Forex กลับเข้ามาหลังสลับ', async () => {
      // ไม่ mount MainLayout เพราะ onMounted ของมันจะ boot เองแล้วกิน mock ไปก่อน
      const workspace = mountWorkspaceApi();
      const journal = useJournalStore();

      const traderPortfolio = {
        id: 1,
        user_id: 1,
        name: 'Forex Main',
        portfolio_type: 'TRADER',
        initial_balance: 1000,
        current_balance: 1000,
        investor_cost_method: 'FIFO',
        currency: 'USD',
        icon: null,
        color: null,
        is_default: true,
        created_at: null,
        updated_at: null,
      };

      // ให้ initialize ฝั่ง TRADER ค้างรอ แล้วปล่อยทีหลัง
      let releaseTrader: (value: unknown) => void = () => {};
      portfolioGetAll.mockImplementationOnce(
        () => new Promise((resolve) => { releaseTrader = resolve; }),
      );

      const bootPromise = workspace.initializeActive().catch(() => null);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // ผู้ใช้กดสลับระหว่างที่ boot ยังไม่เสร็จ
      portfolioGetAll.mockResolvedValue([]);
      await workspace.switchTo('INVESTOR');

      expect(journal.trades, 'หลังสลับ ควรว่าง').toHaveLength(0);
      expect(usePortfolioStore().activeType).toBe('INVESTOR');

      // boot ของ TRADER เพิ่งได้คำตอบ แล้ววิ่งต่อ
      tradeGetByPortfolio.mockResolvedValue([{ id: 1, pnl: 100 }]);
      releaseTrader([traderPortfolio]);

      await bootPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      // ถ้าล้ม = มี race จริง: ข้อมูล forex กลับเข้ามาทั้งที่อยู่โหมด Stock แล้ว
      expect(journal.trades, 'เทรด forex ไม่ควรกลับมาหลังสลับไป Stock').toHaveLength(0);
      expect(usePortfolioStore().activeType, 'activeType ไม่ควรถูกดึงกลับ').toBe('INVESTOR');
    });
  });

  it('ป้ายโหมดบนหัว drawer เปลี่ยนตามด้วย', async () => {
    const wrapper = await mountLayout();
    const store = usePortfolioStore();

    expect(wrapper.find('.workspace-tag').text()).toContain('Forex');

    store.setActiveType('INVESTOR');
    await nextTick();

    expect(wrapper.find('.workspace-tag').text()).toContain('Stock');
  });
});

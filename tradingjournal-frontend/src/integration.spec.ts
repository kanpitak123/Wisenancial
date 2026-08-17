/**
 * เทส flow ที่ต่อกันข้ามหลายเฟส
 *
 * แต่ละเฟสมีเทสของตัวเองผ่านหมดแล้ว แต่ผ่านแยกกันไม่ได้แปลว่าต่อกันแล้วทำงาน —
 * ไฟล์นี้จึงเดินทั้ง flow จริง: สลับโหมดซ้ำหลายรอบ, โควต้าข้ามสองโหมด,
 * และซื้อหุ้นแล้วดูว่า Dashboard/Analytics ของโหมด Stock อัปเดตตาม
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from 'src/composables/useWorkspace';
import { useAnalyticsStore } from 'stores/AnalyticsStore';
import { useDividendStore } from 'stores/DividendStore';
import { useGoalStore } from 'stores/GoalStore';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { useJournalStore } from 'stores/JournalStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useRecordStore } from 'stores/RecordStore';
import { useWatchlistStore } from 'stores/WatchlistStore';
import PortfolioPage from 'pages/shared/PortfolioPage.vue';
import StockRecordPage from 'pages/investor/StockRecordPage.vue';
import type { Portfolio, PortfolioQuota } from 'src/types/portfolio.types';
import type { StockPurchase } from 'src/types/investor-portfolio.types';

// ── mocks ของทุก service ที่ flow แตะ ─────────────────────────────────────────
const portfolioGetAll = vi.fn();
const portfolioGetQuota = vi.fn();
const portfolioCreate = vi.fn();

const tradeGetByPortfolio = vi.fn();
const recordsGetAll = vi.fn();
const recordsGetSummary = vi.fn();
const dividendGetAll = vi.fn();
const dividendGetSummary = vi.fn();

const investorBuy = vi.fn();
const investorGetDashboard = vi.fn();
const investorGetSales = vi.fn();
const investorGetTimeline = vi.fn();
const investorGetPerformance = vi.fn();
const stockPurchasesGetAll = vi.fn();

// StockSymbolPicker (ในหน้าบันทึกซื้อหุ้น) ดึงรายชื่อหุ้นผ่าน api.get('/stocks')
// mock ไว้ไม่ให้เทสยิงเน็ตจริง
vi.mock('boot/axios', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: (...a: unknown[]) => portfolioGetAll(...a),
    getQuota: (...a: unknown[]) => portfolioGetQuota(...a),
    create: (...a: unknown[]) => portfolioCreate(...a),
    getOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/trade.service', () => ({
  tradeService: {
    getByPortfolio: (...a: unknown[]) => tradeGetByPortfolio(...a),
    getActive: vi.fn(),
    leaderboard: vi.fn(),
  },
  getTradeErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/records.service', () => ({
  recordsService: {
    getAll: (...a: unknown[]) => recordsGetAll(...a),
    getSummary: (...a: unknown[]) => recordsGetSummary(...a),
  },
  getRecordErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/dividend.service', () => ({
  dividendService: {
    getAll: (...a: unknown[]) => dividendGetAll(...a),
    getSummary: (...a: unknown[]) => dividendGetSummary(...a),
  },
  getDividendErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/investor-portfolio.service', () => ({
  investorPortfolioService: {
    buy: (...a: unknown[]) => investorBuy(...a),
    sell: vi.fn(),
    getDashboard: (...a: unknown[]) => investorGetDashboard(...a),
    getSales: (...a: unknown[]) => investorGetSales(...a),
    getTimeline: (...a: unknown[]) => investorGetTimeline(...a),
    getPerformance: (...a: unknown[]) => investorGetPerformance(...a),
  },
}));

vi.mock('src/services/stock-purchases.service', () => ({
  stockPurchasesService: {
    getAll: (...a: unknown[]) => stockPurchasesGetAll(...a),
    getOne: vi.fn(),
  },
}));

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useRoute: () => ({ path: '/Dashboard', query: {}, meta: {} }),
}));

// ── fixtures ──────────────────────────────────────────────────────────────────
function portfolio(id: number, type: 'TRADER' | 'INVESTOR', name = `พอร์ต ${id}`): Portfolio {
  return {
    id,
    user_id: 1,
    name,
    initial_balance: 10000,
    current_balance: 12000,
    portfolio_type: type,
    investor_cost_method: 'FIFO',
    currency: type === 'INVESTOR' ? 'THB' : 'USD',
    icon: null,
    color: null,
    is_default: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function quota(max: number, trader: number, investor: number): PortfolioQuota {
  const used = trader + investor;

  return { max, used, remaining: Math.max(0, max - used), byType: { TRADER: trader, INVESTOR: investor } };
}

function purchase(overrides: Partial<StockPurchase> = {}): StockPurchase {
  return {
    id: 1,
    portfolio_id: 2,
    stock_symbol: 'PTT.BK',
    stock_name: 'PTT',
    shares_count: 100,
    remaining_shares: 100,
    purchase_price: 35,
    total_amount: 3500,
    fees: 5,
    currency: 'THB',
    purchase_reason: null,
    expectation: null,
    target_price: null,
    stop_loss: null,
    strategy: null,
    emotion: null,
    notes: null,
    folder_name: null,
    status: 'OPEN',
    sold_price: null,
    sold_date: null,
    closed_at: null,
    purchase_date: '2026-03-15T00:00:00.000Z',
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

const TRADES = [
  { id: 1, portfolio_id: 1, pair: 'XAU/USD', pnl: 120, result_status: 'WIN', trade_type: 'BUY' },
  { id: 2, portfolio_id: 1, pair: 'EUR/USD', pnl: -40, result_status: 'LOSS', trade_type: 'SELL' },
];

const DASHBOARD = {
  portfolio: { id: 2, name: 'Long-Term Stock', currency: 'THB' },
  summary: {
    cash: 100000,
    invested_cost: 3500,
    market_value: 4000,
    portfolio_value: 104000,
    realized_pnl: 0,
    unrealized_pnl: 500,
    dividends: 0,
    total_pnl: 500,
    total_return_percent: 14.28,
    open_holdings: 1,
    closed_sales: 0,
  },
  holdings: [
    {
      symbol: 'PTT.BK',
      name: 'PTT',
      currency: 'THB',
      shares: 100,
      average_cost: 35,
      cost_basis: 3500,
      market_price: 40,
      market_value: 4000,
      unrealized_pnl: 500,
      unrealized_percent: 14.28,
    },
  ],
  recent_activity: [],
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setupHappyPath() {
  portfolioGetAll.mockImplementation((query?: { type?: string }) => {
    const all = [portfolio(1, 'TRADER', 'Forex Main'), portfolio(2, 'INVESTOR', 'Long-Term Stock')];

    return Promise.resolve(query?.type ? all.filter((p) => p.portfolio_type === query.type) : all);
  });

  portfolioGetQuota.mockResolvedValue(quota(3, 1, 1));

  tradeGetByPortfolio.mockResolvedValue(TRADES);
  recordsGetAll.mockResolvedValue([]);
  recordsGetSummary.mockResolvedValue({ portfolio_id: 1, totals: {}, net_amount: 0, record_count: 0 });
  dividendGetAll.mockResolvedValue([]);
  dividendGetSummary.mockResolvedValue({ gross_amount: 0, net_amount: 0, tax_withheld: 0 });

  investorGetDashboard.mockResolvedValue({ data: DASHBOARD });
  investorGetSales.mockResolvedValue({ data: [] });
  investorGetTimeline.mockResolvedValue({ data: [] });
  investorGetPerformance.mockResolvedValue({ data: [] });
  stockPurchasesGetAll.mockResolvedValue([purchase()]);
}

describe('integration — งานข้ามเฟส', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    setupHappyPath();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // B1 — สลับโหมดซ้ำ 3 รอบแล้ว store ของโหมดที่ไม่ได้ใช้ต้องว่าง
  // ══════════════════════════════════════════════════════════════════════════
  describe('สลับโหมด Forex <-> Stock ซ้ำ 3 รอบ', () => {
    /** useWorkspace ใช้ได้เฉพาะใน setup() — ห่อด้วย component จิ๋ว */
    function mountWorkspace() {
      let api!: ReturnType<typeof useWorkspace>;

      mount({
        setup() {
          api = useWorkspace();
          return () => h('div');
        },
      });

      return api;
    }

    it('สลับไป Stock แล้ว JournalStore (Forex) ต้องว่าง', async () => {
      const workspace = mountWorkspace();
      const journal = useJournalStore();

      // ค่าเริ่มต้นคือ TRADER อยู่แล้ว switchTo('TRADER') จึงไม่ทำอะไร — ใช้ initializeActive แทน
      await workspace.initializeActive();
      expect(journal.trades).toHaveLength(2);

      await workspace.switchTo('INVESTOR');

      expect(journal.trades).toHaveLength(0);
      expect(journal.currentPortfolioId).toBeNull();
    });

    it('สลับกลับ Forex แล้ว store ฝั่ง Stock ต้องว่าง', async () => {
      const workspace = mountWorkspace();
      const investor = useInvestorPortfolioStore();
      const dividends = useDividendStore();

      await workspace.switchTo('INVESTOR');
      expect(investor.dashboard).not.toBeNull();

      await workspace.switchTo('TRADER');

      expect(investor.dashboard).toBeNull();
      expect(investor.purchases).toHaveLength(0);
      expect(dividends.items).toHaveLength(0);
    });

    it('วน 3 รอบแล้วไม่มีข้อมูลค้างข้ามโหมดเลยสักรอบ', async () => {
      const workspace = mountWorkspace();
      const journal = useJournalStore();
      const investor = useInvestorPortfolioStore();

      await workspace.switchTo('TRADER');

      for (let round = 1; round <= 3; round++) {
        await workspace.switchTo('INVESTOR');

        expect(journal.trades, `รอบ ${round}: เทรด forex ค้างในโหมด Stock`).toHaveLength(0);
        expect(investor.dashboard, `รอบ ${round}: ข้อมูลหุ้นไม่ถูกโหลด`).not.toBeNull();

        await workspace.switchTo('TRADER');

        expect(investor.dashboard, `รอบ ${round}: ข้อมูลหุ้นค้างในโหมด Forex`).toBeNull();
        expect(journal.trades, `รอบ ${round}: เทรด forex ไม่ถูกโหลด`).toHaveLength(2);
      }
    });

    it('store ที่ผูกกับพอร์ต (Analytics/Goal/Watchlist) ถูกล้างทุกครั้งที่สลับ', async () => {
      const workspace = mountWorkspace();
      const analytics = useAnalyticsStore();
      const goal = useGoalStore();
      const watchlist = useWatchlistStore();

      await workspace.switchTo('TRADER');

      analytics.portfolioId = 1;
      analytics.portfolioType = 'TRADER';
      goal.monthlyPlan.targetProfit = 5000;
      watchlist.items = [{ symbol: 'XAU/USD' } as never];

      await workspace.switchTo('INVESTOR');

      expect(analytics.portfolioId).toBeNull();
      expect(analytics.portfolioType).toBeNull();
      expect(goal.monthlyPlan.targetProfit).toBe(0);
      expect(watchlist.items).toHaveLength(0);
    });

    it('RecordStore ถูกโหลดใหม่ของโหมดปลายทาง ไม่ใช่ถูกล้างทิ้ง', async () => {
      const workspace = mountWorkspace();
      const records = useRecordStore();

      recordsGetAll.mockResolvedValue([
        { id: 9, portfolio_id: 2, type: 'STOCK_BUY', amount: -3500 },
      ]);

      await workspace.switchTo('INVESTOR');

      // ล้างก่อน initialize เสมอ ไม่งั้นของที่โหมดใหม่เพิ่งโหลดจะโดนล้างตาม
      expect(records.records).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // เฟส 1+2 — โควต้ารวมข้ามสองโหมด
  // ══════════════════════════════════════════════════════════════════════════
  describe('โควต้าเต็มข้ามสองโหมด', () => {
    const byTest = (wrapper: VueWrapper, name: string) =>
      wrapper.find(`[data-test="${name}"]`);

    async function mountPortfolioPage() {
      const wrapper = mount(
        { render: () => h(QLayout, () => [h(QPageContainer, () => [h(PortfolioPage)])]) },
        { attachTo: document.body },
      );

      await flush();
      await nextTick();

      return wrapper;
    }

    it('stock 2 + forex 1 = 3/3 -> ปุ่มสร้าง disable ในโหมด Stock', async () => {
      portfolioGetQuota.mockResolvedValue(quota(3, 1, 2));

      const store = usePortfolioStore();

      store.activeType = 'INVESTOR';

      const wrapper = await mountPortfolioPage();

      expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 3/3 พอร์ต');
      expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 2');
      expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Forex 1');
      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
    });

    it('สลับไปโหมด Forex แล้วปุ่มก็ยัง disable (โควต้าเป็นก้อนเดียว)', async () => {
      portfolioGetQuota.mockResolvedValue(quota(3, 1, 2));

      const store = usePortfolioStore();

      store.activeType = 'INVESTOR';

      const wrapper = await mountPortfolioPage();

      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();

      // สลับโหมด — พอร์ตที่แสดงเปลี่ยน แต่เพดานเป็นก้อนเดียวกัน
      store.activeType = 'TRADER';
      await nextTick();

      expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 3/3 พอร์ต');
      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
      expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(true);
    });

    it('สร้างพอร์ต stock ใบสุดท้ายแล้วโหมด Forex ก็สร้างต่อไม่ได้ทันที', async () => {
      portfolioGetQuota.mockResolvedValue(quota(3, 1, 1));

      const store = usePortfolioStore();

      store.activeType = 'INVESTOR';

      const wrapper = await mountPortfolioPage();

      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();

      portfolioCreate.mockResolvedValue(portfolio(3, 'INVESTOR', 'พอร์ตหุ้นที่สอง'));
      portfolioGetQuota.mockResolvedValue(quota(3, 1, 2));

      await store.createPortfolio({ name: 'พอร์ตหุ้นที่สอง', initial_balance: 1000 });
      await flush();
      await nextTick();

      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();

      // ข้ามไปโหมด Forex — ต้องยังเต็มอยู่
      store.activeType = 'TRADER';
      await nextTick();

      expect(store.hasReachedQuota).toBe(true);
      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
    });

    it('ลบพอร์ตฝั่ง Stock แล้วโหมด Forex สร้างได้อีกครั้ง', async () => {
      portfolioGetQuota.mockResolvedValue(quota(3, 1, 2));

      const store = usePortfolioStore();

      store.activeType = 'TRADER';

      const wrapper = await mountPortfolioPage();

      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();

      store.applyQuotaDelta('INVESTOR', -1);
      await nextTick();

      expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 2/3 พอร์ต');
      expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // เฟส 3 + B3/B4 — ซื้อหุ้นแล้ว Dashboard/Analytics โหมด Stock อัปเดต
  // ══════════════════════════════════════════════════════════════════════════
  describe('ซื้อหุ้นแล้วหน้าอื่นของโหมด Stock อัปเดตตาม', () => {
    async function mountStockRecord() {
      const portfolioStore = usePortfolioStore();

      portfolioStore.portfolios = [portfolio(1, 'TRADER'), portfolio(2, 'INVESTOR')];
      portfolioStore.activeType = 'INVESTOR';
      portfolioStore.activePortfolioIds.INVESTOR = 2;

      const wrapper = mount(
        { render: () => h(QLayout, () => [h(QPageContainer, () => [h(StockRecordPage)])]) },
        { attachTo: document.body },
      );

      await flush();
      await nextTick();

      return wrapper;
    }

    it('ซื้อสำเร็จ -> store โหลดข้อมูลใหม่ทั้งชุด (dashboard/holdings/lot)', async () => {
      const wrapper = await mountStockRecord();
      const investor = useInvestorPortfolioStore();

      expect(investor.purchases).toHaveLength(1);
      expect(investor.holdings).toHaveLength(1);

      investorBuy.mockResolvedValue({ data: { success: true } });

      // หลังซื้อ backend คืนพอร์ตที่มีหุ้นเพิ่ม
      const updatedDashboard = {
        ...DASHBOARD,
        summary: { ...DASHBOARD.summary, open_holdings: 2, invested_cost: 5500, total_pnl: 800 },
        holdings: [
          ...DASHBOARD.holdings,
          {
            symbol: 'AAPL',
            name: 'Apple',
            currency: 'THB',
            shares: 10,
            average_cost: 200,
            cost_basis: 2000,
            market_price: 230,
            market_value: 2300,
            unrealized_pnl: 300,
            unrealized_percent: 15,
          },
        ],
      };

      investorGetDashboard.mockResolvedValue({ data: updatedDashboard });
      stockPurchasesGetAll.mockResolvedValue([purchase(), purchase({ id: 2, stock_symbol: 'AAPL' })]);

      const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
        buyForm: Record<string, unknown>;
        submitBuy: () => Promise<void>;
      };

      Object.assign(vm.buyForm, {
        stock_symbol: 'AAPL',
        purchase_price: 200,
        shares_count: 10,
      });

      await vm.submitBuy();
      await flush();

      // ── ข้อมูลที่ DashboardPage โหมด Stock อ่าน ──
      expect(investor.holdings).toHaveLength(2);
      expect(investor.holdings.map((h) => h.symbol)).toContain('AAPL');
      expect(investor.summary?.open_holdings).toBe(2);
      expect(investor.summary?.total_pnl).toBe(800);

      // ── ข้อมูลที่ StockRecordPage เอง (lot) อ่าน ──
      expect(investor.purchases).toHaveLength(2);
    });

    it('lot ใหม่โผล่ในตารางบนหน้าจอจริง', async () => {
      const wrapper = await mountStockRecord();

      expect(wrapper.find('[data-test="purchase-2"]').exists()).toBe(false);

      investorBuy.mockResolvedValue({ data: { success: true } });
      stockPurchasesGetAll.mockResolvedValue([
        purchase(),
        purchase({ id: 2, stock_symbol: 'AAPL', folder_name: 'เติบโต' }),
      ]);

      const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
        buyForm: Record<string, unknown>;
        submitBuy: () => Promise<void>;
      };

      Object.assign(vm.buyForm, { stock_symbol: 'AAPL', purchase_price: 200, shares_count: 10 });

      await vm.submitBuy();
      await flush();
      await nextTick();

      expect(wrapper.find('[data-test="purchase-2"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="folder-เติบโต"]').exists()).toBe(true);
    });

    it('AnalyticsStore ของโหมด Stock อ่าน portfolioType เป็น INVESTOR', async () => {
      await mountStockRecord();

      const analytics = useAnalyticsStore();

      analytics.portfolioId = 2;
      analytics.portfolioType = 'INVESTOR';

      expect(analytics.isInvestor).toBe(true);
      expect(analytics.isTrader).toBe(false);
      // ฝั่ง INVESTOR กราฟเป็น total equity (เงินสด + มูลค่าหุ้น) ไม่ใช่ equity แบบ forex
      // และไม่ใช่ cash ledger ล้วนแบบเดิมแล้ว
      expect(analytics.chartData.series[0]?.name).toBe('Total equity');
    });

    it('ซื้อไม่สำเร็จ -> ข้อมูลเดิมไม่ถูกแตะ', async () => {
      const wrapper = await mountStockRecord();
      const investor = useInvestorPortfolioStore();

      investorBuy.mockRejectedValue({ response: { data: { message: 'ยอดเงินสดไม่เพียงพอ' } } });

      const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
        buyForm: Record<string, unknown>;
        submitBuy: () => Promise<void>;
      };

      Object.assign(vm.buyForm, { stock_symbol: 'AAPL', purchase_price: 200, shares_count: 10 });

      await vm.submitBuy();
      await flush();

      expect(investor.purchases).toHaveLength(1);
      expect(investor.holdings).toHaveLength(1);
      expect(investor.error).toContain('ยอดเงินสด');
    });
  });
});

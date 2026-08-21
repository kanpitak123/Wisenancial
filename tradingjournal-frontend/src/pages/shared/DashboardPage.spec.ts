/**
 * DashboardPage — สิ่งที่ต้องต่างกันระหว่างโหมด Forex (TRADER) กับ Stock (INVESTOR)
 *
 * รอบ A: โหมด Stock ต้องไม่มีการ์ด Goal (อ่านจาก JournalStore/GoalStore ของฝั่ง
 *        Forex ซึ่งเป็น 0 ทั้งแถวในโหมดหุ้น) — ส่วนปุ่ม Share ตอนนี้มีทั้งสองโหมด
 *        แล้ว (ดู describe "การ์ดแชร์โหมด Stock" ด้านล่าง) เพียงแต่เนื้อหาต่างกัน
 * รอบ B: โหมด Stock ต้องมี Asset Allocation / Top Movers / ประวัติกิจกรรม + export CSV
 *
 * เทสฝั่ง Forex อยู่ด้วยเพื่อกัน regress — การซ่อนของในโหมดหุ้นต้องไม่ไปโดนโหมดเทรด
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDividendStore } from 'stores/DividendStore';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import DashboardPage from './DashboardPage.vue';
import type { Dividend } from 'src/types/dividend.types';
import type {
  InvestorActivity,
  InvestorDashboard,
  InvestorHolding,
} from 'src/types/investor-portfolio.types';
import type { Portfolio } from 'src/types/portfolio.types';
import type { WorkspaceType } from 'src/types/workspace.types';
import { SHARE_QR_TARGET_URL } from 'src/constants/share.constants';

const downloadCsv = vi.fn();
const getMonthlyTarget = vi.fn();
const getDailyPnl = vi.fn();
const qrToDataUrl = vi.fn();
const dividendGetAll = vi.fn();
const dividendGetSummary = vi.fn();

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

vi.mock('src/services/goal.service', () => ({
  goalService: {
    getMonthlyTarget: (...args: unknown[]) => getMonthlyTarget(...args),
    setMonthlyTarget: vi.fn(),
  },
  getGoalErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/dividend.service', () => ({
  dividendService: {
    getAll: (...args: unknown[]) => dividendGetAll(...args),
    getSummary: (...args: unknown[]) => dividendGetSummary(...args),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  getDividendErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/analytics.service', () => ({
  analyticsService: {
    getOverview: vi.fn().mockResolvedValue(null),
    getPerformance: vi.fn().mockResolvedValue([]),
    getDailyPnl: (...args: unknown[]) => getDailyPnl(...args),
    getTimeline: vi.fn().mockResolvedValue([]),
    getAllocation: vi.fn().mockResolvedValue([]),
  },
  getAnalyticsErrorMessage: (_error: unknown, fallback: string) => fallback,
  isAnalyticsPaidTierError: () => false,
}));

// export จริงเขียนไฟล์ลงดิสก์ — ดัก downloadCsv ไว้ แต่ยังให้ตัว build CSV ของจริงทำงาน
vi.mock('src/utils/csv-export', async () => {
  const actual = await vi.importActual('src/utils/csv-export');

  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsv(...args) };
});

// ApexCharts แตะ DOM API ที่ happy-dom ไม่มี — ไม่เกี่ยวกับสิ่งที่เทสนี้ตรวจ
// สะท้อน series/สีออกมาเป็น data attribute เพื่อให้เทสตรวจค่าที่หน้าส่งเข้ากราฟได้
// โดยไม่ต้องพึ่ง Apex จริง (การ์ดแชร์ถูก teleport ออกไปนอก wrapper ด้วย)
vi.mock('vue3-apexcharts', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['options', 'series'],
    template:
      '<div class="apex" :data-series="JSON.stringify(series ?? null)" :data-colors="JSON.stringify(options?.colors ?? null)" />',
  },
}));

// qrcode จริงวาดผ่าน <canvas> ซึ่ง happy-dom ไม่มี — ตัวที่สแกนได้จริงถูกตรวจในเบราว์เซอร์
vi.mock('qrcode', () => ({ default: { toDataURL: (...args: unknown[]) => qrToDataUrl(...args) } }));

vi.mock('html2canvas', () => ({ default: vi.fn() }));

function portfolio(type: WorkspaceType): Portfolio {
  return {
    id: 7,
    user_id: 1,
    name: type === 'TRADER' ? 'Forex Main' : 'Stock Main',
    portfolio_type: type,
    initial_balance: 100000,
    current_balance: 120000,
    investor_cost_method: 'FIFO',
    currency: 'THB',
    icon: null,
    color: null,
    is_default: true,
    created_at: null,
    updated_at: null,
  } as unknown as Portfolio;
}

function holding(overrides: Partial<InvestorHolding> = {}): InvestorHolding {
  return {
    symbol: 'PTT.BK',
    name: 'PTT Public Company',
    currency: 'THB',
    shares: 100,
    average_cost: 35,
    cost_basis: 3500,
    market_price: 40,
    market_value: 4000,
    unrealized_pnl: 500,
    unrealized_percent: 14.28,
    ...overrides,
  };
}

function activity(overrides: Partial<InvestorActivity> = {}): InvestorActivity {
  return {
    id: 1,
    type: 'BUY',
    amount: -3500,
    symbol: 'PTT.BK',
    description: 'ซื้อ PTT.BK',
    occurred_at: '2026-03-15T09:30:00.000Z',
    status: 'ACTIVE',
    ...overrides,
  };
}

function dividend(overrides: Partial<Dividend> = {}): Dividend {
  return {
    id: 31,
    user_id: 1,
    portfolio_id: 7,
    symbol: 'PTT.BK',
    name: 'PTT Public Company',
    payment_date: '2026-04-25T00:00:00.000Z',
    shares: 100,
    dividend_per_share: 2.25,
    wht_rate: 0.1,
    gross_amount: 225,
    tax_withheld: 22.5,
    net_amount: 202.5,
    status: 'ACTIVE',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function investorDashboard(holdings: InvestorHolding[]): InvestorDashboard {
  return {
    portfolio: { id: 7, name: 'Stock Main', currency: 'THB' },
    summary: {
      cash: 10000,
      invested_cost: 3500,
      market_value: 4000,
      portfolio_value: 14000,
      realized_pnl: 0,
      unrealized_pnl: 500,
      dividends: 202.5,
      total_pnl: 702.5,
      total_return_percent: 5.02,
      open_holdings: holdings.length,
      closed_sales: 0,
    },
    holdings,
    recent_activity: [],
  };
}

/**
 * ใส่ปันผลลง store พร้อมปัก portfolioId ให้ตรงกับพอร์ตที่ active
 *
 * ถ้าไม่ปัก DashboardPage จะเห็นว่า DividendStore ยังไม่ผูกกับพอร์ตนี้แล้วสั่ง load() ใหม่
 * ทับข้อมูลที่เทสวางไว้ — ซึ่งเป็นพฤติกรรมที่ถูกต้องตอนผู้ใช้สลับพอร์ตจริง
 */
function setDividends(items: Dividend[]) {
  const store = useDividendStore();

  store.items = items;
  store.portfolioId = 7;
}

/** ตั้ง store ให้อยู่ในโหมดที่ต้องการก่อน mount — หน้าอ่าน activeType ตอน setup */
function setWorkspace(type: WorkspaceType) {
  const portfolioStore = usePortfolioStore();

  portfolioStore.portfolios = [portfolio(type)];
  portfolioStore.setActiveType(type);
  portfolioStore.selectPortfolio(7);
}

async function mountDashboard(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(DashboardPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await nextTick();

  return wrapper;
}

/** กดแท็บย่อยของการ์ดประวัติกิจกรรมเหมือนผู้ใช้จริง (state อยู่ใน <script setup> เลยเข้าตรงๆ ไม่ได้) */
async function clickActivityTab(wrapper: VueWrapper, label: string) {
  const button = wrapper
    .findAll('[data-test="activity-card"] .filter-toggle button')
    .find((node) => node.text().includes(label));

  if (!button) {
    throw new Error(`ไม่พบแท็บ "${label}"`);
  }

  await button.trigger('click');
  await nextTick();
}

describe('DashboardPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    getMonthlyTarget.mockResolvedValue(0);
    getDailyPnl.mockResolvedValue({});
    qrToDataUrl.mockResolvedValue('data:image/png;base64,QRSTUB');
    dividendGetAll.mockResolvedValue([]);
    dividendGetSummary.mockResolvedValue(null);
  });

  // ── รอบ A: ของฝั่ง Forex ต้องหายไปในโหมด Stock ────────────────────────────
  describe('โหมด Stock ไม่มีของฝั่ง Forex', () => {
    beforeEach(() => setWorkspace('INVESTOR'));

    it('ไม่ render การ์ด Goal', async () => {
      const wrapper = await mountDashboard();

      expect(wrapper.text()).not.toContain('No goal set for this month');
      expect(wrapper.text()).not.toContain('monthly goal');
    });

    it('ไม่ยิงโหลดเป้าหมายรายเดือนทิ้งเปล่า', async () => {
      await mountDashboard();

      expect(getMonthlyTarget).not.toHaveBeenCalled();
    });
  });

  // ── กัน regress: โหมด Forex ต้องเหมือนเดิมทุกอย่าง ─────────────────────────
  describe('โหมด Forex ยังครบเหมือนเดิม', () => {
    beforeEach(() => setWorkspace('TRADER'));

    it('ยัง render การ์ด Goal', async () => {
      const wrapper = await mountDashboard();

      expect(wrapper.text()).toContain('Goal —');
    });

    it('ยัง render ปุ่ม Share และกดแล้วการ์ดแชร์เปิดได้', async () => {
      const wrapper = await mountDashboard();
      const button = wrapper.find('.share-btn-main');

      expect(button.exists()).toBe(true);

      await button.trigger('click');
      await nextTick();
      await nextTick();

      // q-dialog teleport ออกไปนอก wrapper — ต้องมองที่ document
      expect(document.getElementById('share-image-area')).not.toBeNull();
    });

    it('ยัง render ปฏิทินและ Recent Trades ไม่ใช่ของโหมดหุ้น', async () => {
      const wrapper = await mountDashboard();

      expect(wrapper.text()).toContain('Trading Calendar');
      expect(wrapper.text()).toContain('Recent Trades');
      expect(wrapper.find('[data-test="allocation-card"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="movers-card"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="activity-card"]').exists()).toBe(false);
    });

    it('ยังโหลดเป้าหมายรายเดือนตอนเปิดหน้า', async () => {
      await mountDashboard();

      expect(getMonthlyTarget).toHaveBeenCalled();
    });
  });

  // ── การ์ดแชร์ฝั่ง Stock — เทียบเท่าฝั่ง Forex แต่เนื้อหาเป็นของพอร์ตหุ้นจริง
  //    (ไม่มี "month p&l"/"win rate" เพราะ holding ไม่ได้รีเซ็ตรายเดือนแบบ trade) ──
  describe('การ์ดแชร์โหมด Stock', () => {
    beforeEach(() => setWorkspace('INVESTOR'));

    it('ยัง render ปุ่ม Share และกดแล้วเห็นเนื้อหาพอร์ตหุ้น ไม่ใช่ของฝั่ง Forex', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'PTT.BK', market_value: 4000, unrealized_pnl: 500 }),
      ]);

      const wrapper = await mountDashboard();
      const button = wrapper.find('.share-btn-main');

      expect(button.exists()).toBe(true);

      await button.trigger('click');
      await nextTick();
      await nextTick();

      // q-dialog teleport ออกไปนอก wrapper — ต้องมองที่ document
      expect(document.getElementById('share-image-area')).not.toBeNull();

      const dialogText = document.body.textContent ?? '';

      expect(dialogText).toContain('portfolio value');
      expect(dialogText).toContain('total return');
      expect(dialogText).toContain('holdings');
      // ต้องไม่ใช่การ์ดของฝั่ง Forex
      expect(dialogText).not.toContain('month p&l');
      expect(dialogText).not.toContain('win rate');
    });

    it('แถบสัดส่วนพอร์ตกับชิป best holding ผูกค่าจาก holding จริง', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        // PTT.BK: น้ำหนัก 75% และกำไร 600/3000 = +20% -> ต้องเป็น best holding
        holding({ symbol: 'PTT.BK', market_value: 6000, cost_basis: 3000, unrealized_pnl: 600 }),
        holding({ symbol: 'AAPL', market_value: 2000, cost_basis: 2000, unrealized_pnl: -100 }),
      ]);

      const wrapper = await mountDashboard();

      await wrapper.find('.share-btn-main').trigger('click');
      await nextTick();
      await nextTick();

      const segments = [...document.querySelectorAll('[data-test="share-alloc-segment"]')];
      const legend = [...document.querySelectorAll('[data-test="share-alloc-legend-item"]')];

      // 2 holding -> 2 segment ไม่มี "Others" และความกว้างต้องเป็น weight จริง
      expect(segments).toHaveLength(2);
      expect((segments[0] as HTMLElement).style.width).toBe('75%');
      expect((segments[1] as HTMLElement).style.width).toBe('25%');

      expect(legend).toHaveLength(2);
      expect(legend[0]?.textContent).toContain('PTT.BK');
      expect(legend[0]?.textContent).toContain('75%');
      expect(legend[1]?.textContent).toContain('AAPL');
      expect(legend[1]?.textContent).toContain('25%');

      // best holding เรียงตาม return% ไม่ใช่มูลค่า และตัวติดลบต้องไม่ถูกเลือก
      const bestChip = document.querySelector('[data-test="share-best-holding"]');

      expect(bestChip?.textContent).toContain('PTT.BK');
      expect(bestChip?.textContent).toContain('+20.0%');
      expect(bestChip?.querySelector('.chip-dot')?.classList.contains('dot-green')).toBe(true);
    });
  });

  // ── รอบ B: section ใหม่ของโหมด Stock ──────────────────────────────────────
  describe('Asset Allocation', () => {
    beforeEach(() => setWorkspace('INVESTOR'));

    it('ไม่มี holding -> ขึ้น empty state ไม่ใช่โดนัทเปล่า', async () => {
      const wrapper = await mountDashboard();

      expect(wrapper.find('[data-test="allocation-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="allocation-legend-item"]').exists()).toBe(false);
    });

    it('คิด weight จาก market_value จริงของแต่ละตัว', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'PTT.BK', market_value: 7500 }),
        holding({ symbol: 'AAPL', market_value: 2500 }),
      ]);

      const wrapper = await mountDashboard();
      const legend = wrapper.findAll('[data-test="allocation-legend-item"]');

      expect(legend).toHaveLength(2);
      expect(legend[0]?.text()).toContain('PTT.BK');
      expect(legend[0]?.text()).toContain('75.0%');
      expect(legend[1]?.text()).toContain('AAPL');
      expect(legend[1]?.text()).toContain('25.0%');
    });

    it('ไม่มีราคาตลาด -> ถอยไปใช้ cost_basis เหมือนที่ backend ทำ', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'PTT.BK', market_value: null, cost_basis: 1000 }),
        holding({ symbol: 'AAPL', market_value: null, cost_basis: 3000 }),
      ]);

      const wrapper = await mountDashboard();
      const legend = wrapper.findAll('[data-test="allocation-legend-item"]');

      expect(legend[0]?.text()).toContain('AAPL');
      expect(legend[0]?.text()).toContain('75.0%');
    });

    it('แยกหุ้นไทย/ต่างประเทศจากนามสกุลสัญลักษณ์จริง', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'PTT.BK', market_value: 6000 }),
        holding({ symbol: 'KBANK.BK', market_value: 2000 }),
        holding({ symbol: 'AAPL', market_value: 2000 }),
      ]);

      const wrapper = await mountDashboard();
      const groups = wrapper.findAll('[data-test="allocation-class"]');

      expect(groups).toHaveLength(2);
      expect(groups[0]?.text()).toContain('หุ้นไทย');
      expect(groups[0]?.text()).toContain('80.0%');
      expect(groups[1]?.text()).toContain('หุ้นต่างประเทศ');
      expect(groups[1]?.text()).toContain('20.0%');
    });
  });

  describe('Top Movers', () => {
    beforeEach(() => setWorkspace('INVESTOR'));

    it('ไม่มีข้อมูล -> ขึ้น empty state ทั้งสองฝั่ง', async () => {
      const wrapper = await mountDashboard();

      expect(wrapper.find('[data-test="movers-empty-gainers"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="movers-empty-losers"]').exists()).toBe(true);
    });

    it('เรียงกำไรมากสุดก่อน และขาดทุนหนักสุดก่อน', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'AAA', unrealized_percent: 5 }),
        holding({ symbol: 'BBB', unrealized_percent: 20 }),
        holding({ symbol: 'CCC', unrealized_percent: -3 }),
        holding({ symbol: 'DDD', unrealized_percent: -18 }),
      ]);

      const wrapper = await mountDashboard();
      const gainers = wrapper.findAll('[data-test="mover-gainers"]');
      const losers = wrapper.findAll('[data-test="mover-losers"]');

      expect(gainers.map((node) => node.text())).toHaveLength(2);
      expect(gainers[0]?.text()).toContain('BBB');
      expect(gainers[0]?.text()).toContain('+20.00%');
      expect(gainers[1]?.text()).toContain('AAA');

      expect(losers).toHaveLength(2);
      expect(losers[0]?.text()).toContain('DDD');
      expect(losers[0]?.text()).toContain('-18.00%');
      expect(losers[1]?.text()).toContain('CCC');
    });

    it('ตัดที่ 5 ตัวต่อฝั่ง', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard(
        Array.from({ length: 8 }, (_, index) =>
          holding({ symbol: `SYM${index}`, unrealized_percent: index + 1 }),
        ),
      );

      const wrapper = await mountDashboard();

      expect(wrapper.findAll('[data-test="mover-gainers"]')).toHaveLength(5);
    });

    it('holding ที่ backend ยังไม่มี % ให้ -> ไม่ถูกนับเป็น mover', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'NOPRICE', unrealized_percent: null, unrealized_pnl: null }),
      ]);

      const wrapper = await mountDashboard();

      expect(wrapper.find('[data-test="movers-empty-gainers"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="movers-empty-losers"]').exists()).toBe(true);
    });
  });

  describe('ประวัติกิจกรรม + export CSV', () => {
    beforeEach(() => setWorkspace('INVESTOR'));

    it('ไม่มีข้อมูล -> empty state ของแท็บซื้อขาย', async () => {
      const wrapper = await mountDashboard();

      expect(wrapper.find('[data-test="activity-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="activity-row"]').exists()).toBe(false);
    });

    it('แสดงกิจกรรมจาก timeline และตัดที่ 8 แถว', async () => {
      const store = useInvestorPortfolioStore();

      store.dashboard = investorDashboard([]);
      store.timeline = Array.from({ length: 12 }, (_, index) => activity({ id: index + 1 }));

      const wrapper = await mountDashboard();

      expect(wrapper.findAll('[data-test="activity-row"]')).toHaveLength(8);
    });

    it('สลับไปแท็บปันผลแล้วเห็นรายการปันผล ไม่ใช่รายการซื้อขาย', async () => {
      const store = useInvestorPortfolioStore();

      store.dashboard = investorDashboard([]);
      store.timeline = [activity()];
      setDividends([dividend()]);

      const wrapper = await mountDashboard();

      expect(wrapper.find('[data-test="dividend-row"]').exists()).toBe(false);

      await clickActivityTab(wrapper, 'ปันผล');

      expect(wrapper.find('[data-test="activity-row"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="dividend-row"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="dividend-row"]').text()).toContain('PTT.BK');
    });

    it('ปันผลที่ถูกกลับรายการ (REVERSED) ไม่ถูกนับ -> ขึ้น empty state', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([]);
      setDividends([dividend({ status: 'REVERSED' })]);

      const wrapper = await mountDashboard();

      await clickActivityTab(wrapper, 'ปันผล');

      expect(wrapper.find('[data-test="dividend-empty"]').exists()).toBe(true);
    });

    it('export แท็บซื้อขาย -> ได้ CSV ของกิจกรรมทั้งชุด ไม่ใช่แค่ 8 แถวที่โชว์', async () => {
      const store = useInvestorPortfolioStore();

      store.dashboard = investorDashboard([]);
      store.timeline = Array.from({ length: 12 }, (_, index) => activity({ id: index + 1 }));

      const wrapper = await mountDashboard();

      await wrapper.find('[data-test="activity-export"]').trigger('click');

      expect(downloadCsv).toHaveBeenCalledTimes(1);

      const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

      expect(filename).toContain('activity-stock-main-');
      expect(filename.endsWith('.csv')).toBe(true);
      // 12 แถว + หัวตาราง
      expect(csv.split('\r\n')).toHaveLength(13);
      expect(csv).toContain('"PTT.BK"');
      expect(csv).toContain('"THB"');
    });

    it('export แท็บปันผล -> ได้ CSV ของปันผล ไม่ใช่ของกิจกรรม', async () => {
      const store = useInvestorPortfolioStore();

      store.dashboard = investorDashboard([]);
      store.timeline = [activity()];
      setDividends([dividend(), dividend({ id: 32, symbol: 'AAPL' })]);

      const wrapper = await mountDashboard();

      await clickActivityTab(wrapper, 'ปันผล');

      await wrapper.find('[data-test="activity-export"]').trigger('click');

      const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

      expect(filename).toContain('dividends-stock-main-');
      expect(csv.split('\r\n')).toHaveLength(3);
      expect(csv).toContain('"Net Amount"');
      expect(csv).toContain('"202.5"');
    });

    it('DividendStore ยังไม่ผูกกับพอร์ตนี้ -> หน้าโหลดปันผลให้เอง', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([]);
      dividendGetAll.mockResolvedValue([dividend()]);

      const wrapper = await mountDashboard();

      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();

      expect(dividendGetAll).toHaveBeenCalledWith(7);

      await clickActivityTab(wrapper, 'ปันผล');

      expect(wrapper.find('[data-test="dividend-row"]').exists()).toBe(true);
    });

    it('DividendStore ผูกกับพอร์ตนี้อยู่แล้ว -> ไม่ยิงซ้ำ', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([]);
      setDividends([dividend()]);

      await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(dividendGetAll).not.toHaveBeenCalled();
    });

    it('ไม่มีข้อมูล -> ไม่ดาวน์โหลดไฟล์เปล่า', async () => {
      useInvestorPortfolioStore().dashboard = investorDashboard([]);

      const wrapper = await mountDashboard();

      await wrapper.find('[data-test="activity-export"]').trigger('click');

      expect(downloadCsv).not.toHaveBeenCalled();
    });
  });

  // ── เฟส 1: ส่วนที่เลื่อนออกไปจาก ca10191 — กราฟ Monthly Momentum + QR ──────
  //
  //    ตัวที่เทสนี้ตรวจไม่ได้คือ "ภาพที่ html2canvas ถ่ายออกมาแล้วมีกราฟ/QR ติดมาจริง"
  //    (ต้องใช้เบราว์เซอร์จริงกับ canvas จริง) — ที่นี่ตรวจว่าค่าที่ป้อนเข้ากราฟกับ
  //    ปลายทางของ QR ถูกต้อง ซึ่งเป็นส่วนที่ผิดได้เงียบๆ ที่สุด
  describe('การ์ดแชร์ — Monthly Momentum', () => {
    beforeEach(() => setWorkspace('TRADER'));

    /** วันที่ในเดือนที่การ์ดกำลังโชว์อยู่ — หน้าเริ่มที่ new Date() เสมอ */
    function dayOfCurrentMonth(day: number) {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      return `${now.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
    }

    async function openShareCard(wrapper: VueWrapper) {
      await wrapper.find('.share-btn-main').trigger('click');
      await nextTick();
      await nextTick();
    }

    function momentumChart() {
      return document.querySelector('[data-test="share-momentum"] .apex');
    }

    it('สะสม P&L รายวันต่อกัน และตัดท้ายที่วันสุดท้ายที่มีข้อมูลจริง', async () => {
      getDailyPnl.mockResolvedValue({
        [dayOfCurrentMonth(1)]: 100,
        [dayOfCurrentMonth(3)]: -40,
        [dayOfCurrentMonth(4)]: 250,
      });

      const wrapper = await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openShareCard(wrapper);

      const chart = momentumChart();

      expect(chart).not.toBeNull();

      const series = JSON.parse(chart?.getAttribute('data-series') ?? 'null');

      // วันที่ 2 ไม่มีเทรด -> ยอดสะสมคงเดิม ไม่ใช่ 0 และไม่ใช่ค่าที่เดาขึ้นมา
      // ตัดจบที่วันที่ 4 ไม่ลากยาวไปจนสิ้นเดือน
      expect(series[0].data).toEqual([100, 100, 60, 310]);
    });

    it('จุดสุดท้ายของเส้นเท่ากับ month p&l ที่โชว์บนการ์ดใบเดียวกัน', async () => {
      getDailyPnl.mockResolvedValue({
        [dayOfCurrentMonth(2)]: 500,
        [dayOfCurrentMonth(5)]: -125.5,
      });

      const wrapper = await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openShareCard(wrapper);

      const series = JSON.parse(momentumChart()?.getAttribute('data-series') ?? 'null');
      const data: number[] = series[0].data;

      expect(data[data.length - 1]).toBe(374.5);
    });

    it('เดือนที่ปิดติดลบ -> เส้นเป็นสีแดง ไม่ใช่เขียวไว้ก่อนตามเรฟ', async () => {
      getDailyPnl.mockResolvedValue({
        [dayOfCurrentMonth(1)]: 100,
        [dayOfCurrentMonth(2)]: -400,
      });

      const wrapper = await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openShareCard(wrapper);

      expect(JSON.parse(momentumChart()?.getAttribute('data-colors') ?? 'null')).toEqual([
        '#e5484d',
      ]);
    });

    it('มี P&L แค่วันเดียว -> ไม่ render กราฟ (จุดเดียวไม่ใช่เส้น)', async () => {
      getDailyPnl.mockResolvedValue({ [dayOfCurrentMonth(1)]: 100 });

      const wrapper = await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openShareCard(wrapper);

      expect(momentumChart()).toBeNull();
    });

    it('ไม่มี P&L ทั้งเดือน -> ไม่ render กราฟเปล่า', async () => {
      const wrapper = await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openShareCard(wrapper);

      expect(momentumChart()).toBeNull();
    });

    it('โหมด Stock ไม่มี Monthly Momentum — ช่องนั้นเป็น Portfolio Allocation ตามเรฟ', async () => {
      setWorkspace('INVESTOR');
      getDailyPnl.mockResolvedValue({
        [dayOfCurrentMonth(1)]: 100,
        [dayOfCurrentMonth(2)]: 200,
      });
      useInvestorPortfolioStore().dashboard = investorDashboard([
        holding({ symbol: 'PTT.BK', market_value: 4000 }),
      ]);

      const wrapper = await mountDashboard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await openShareCard(wrapper);

      expect(momentumChart()).toBeNull();
      expect(document.querySelector('[data-test="share-alloc-segment"]')).not.toBeNull();
    });
  });

  describe('การ์ดแชร์ — QR code', () => {
    beforeEach(() => setWorkspace('TRADER'));

    async function openShareCard(wrapper: VueWrapper) {
      await wrapper.find('.share-btn-main').trigger('click');
      await nextTick();
      await nextTick();
    }

    it('ชี้ไปหน้า landing สาธารณะ ไม่ใช่ /profile/:username ที่ยังต้องล็อกอิน', async () => {
      const wrapper = await mountDashboard();

      await openShareCard(wrapper);
      await nextTick();

      expect(qrToDataUrl).toHaveBeenCalledWith(SHARE_QR_TARGET_URL, expect.anything());
      expect(SHARE_QR_TARGET_URL).not.toContain('/profile/');
    });

    it('render เป็น <img> (ไม่ใช่ <canvas> ที่ html2canvas โคลนแล้วได้ผืนว่าง)', async () => {
      const wrapper = await mountDashboard();

      await openShareCard(wrapper);
      await nextTick();

      const qr = document.querySelector('[data-test="share-qr"]');

      expect(qr?.tagName).toBe('IMG');
      expect(qr?.getAttribute('src')).toBe('data:image/png;base64,QRSTUB');
    });

    it('สร้าง QR ตอนเปิด dialog เท่านั้น ไม่ใช่ตอนเปิดหน้า', async () => {
      const wrapper = await mountDashboard();

      expect(qrToDataUrl).not.toHaveBeenCalled();

      await openShareCard(wrapper);
      await nextTick();

      expect(qrToDataUrl).toHaveBeenCalledTimes(1);
    });

    it('QR สร้างไม่สำเร็จ -> การ์ดยังเปิดได้ แค่ไม่มี QR', async () => {
      qrToDataUrl.mockRejectedValue(new Error('nope'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = await mountDashboard();

      await openShareCard(wrapper);
      await nextTick();

      expect(document.getElementById('share-image-area')).not.toBeNull();
      expect(document.querySelector('[data-test="share-qr"]')).toBeNull();
    });
  });
});

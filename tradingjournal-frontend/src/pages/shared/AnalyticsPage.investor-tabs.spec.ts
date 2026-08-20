/**
 * แท็บ AI Insights + Planning & Tools ของโหมด Stock
 *
 * ก่อนหน้านี้โหมด Stock มีแค่ Dashboard/Allocation/Timeline — สองแท็บนี้หายไปทั้งแท็บ
 * เทสคุมสามเรื่องที่พังเงียบได้ง่าย:
 *   1. แท็บโผล่เฉพาะโหมด Stock (โหมด Forex ต้องไม่เห็น)
 *   2. performers โดน PaidTierGuard 403 -> ต้องขึ้นการ์ดอัปเกรด ไม่ใช่กริดว่าง
 *   3. เปิดแท็บแล้วต้องยิงโหลดข้อมูลของแท็บนั้นจริง (lazy-load)
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer, QTab } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from './AnalyticsPage.vue';
import { useAnalyticsStore } from 'stores/AnalyticsStore';
import type { AnalyticsOverview, PerformersResponse } from 'src/types/analytics.types';
import type * as PaidTierModule from 'src/utils/paid-tier';

const getPerformers = vi.fn();
const investorLoad = vi.fn();

// DcaPredictorCard ใช้ StockSymbolPicker ที่ดึงรายชื่อหุ้นผ่าน api.get('/stocks')
// mock ไว้ไม่ให้เทสยิงเน็ตจริง
vi.mock('boot/axios', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('src/services/analytics.service', async () => {
  const { isPaidTierError } = await vi.importActual<typeof PaidTierModule>('src/utils/paid-tier');

  const empty = vi.fn().mockResolvedValue([]);

  return {
    analyticsService: {
      getOverview: vi.fn(),
      getPerformance: empty,
      getDailyPnl: vi.fn().mockResolvedValue({}),
      getMonthlyGrowth: empty,
      getBehavioral: vi.fn().mockResolvedValue(null),
      getWinRate: vi.fn().mockResolvedValue(null),
      getTimeline: empty,
      getAllocation: empty,
      getReturnVsBenchmark: vi.fn().mockResolvedValue(null),
      getTimeWeightedReturn: vi.fn().mockResolvedValue(null),
      getMonthlyHeatmap: empty,
      getPerformers: (...args: unknown[]) => getPerformers(...args),
      getHoldingPeriod: vi.fn().mockResolvedValue(null),
      getCashFlow: vi.fn().mockResolvedValue(null),
      simulateDca: vi.fn(),
    },
    getAnalyticsErrorMessage: (_error: unknown, fallback: string) => fallback,
    isAnalyticsPaidTierError: isPaidTierError,
  };
});

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn().mockResolvedValue([]),
    getQuota: vi.fn().mockResolvedValue(null),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/ai.service', () => ({
  aiService: {
    getModels: vi.fn().mockResolvedValue({ models: [], minBalance: 10 }),
    reviewPortfolio: vi.fn(),
    analyzeRisk: vi.fn(),
    analyzeChart: vi.fn(),
    getCredits: vi.fn(),
  },
  getAiErrorMessage: () => 'ai error',
  isAiCreditError: () => false,
}));

vi.mock('src/services/dividend.service', () => ({
  dividendService: { getTaxSummary: vi.fn().mockResolvedValue(null) },
  getDividendErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('stores/InvestorPortfolioStore', () => ({
  useInvestorPortfolioStore: () => ({
    portfolioId: null,
    dashboard: null,
    sales: [],
    load: investorLoad,
  }),
}));

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

const performers: PerformersResponse = {
  best: [{ symbol: 'NVDA', pnl: 1200, returnPercent: 24.5, closedAt: '2026-07-02' }],
  worst: [{ symbol: 'INTC', pnl: -300, returnPercent: -9.1, closedAt: null }],
};

async function mountPage(type: 'INVESTOR' | 'TRADER' = 'INVESTOR'): Promise<VueWrapper> {
  const store = useAnalyticsStore();

  // ตั้ง state ตรงๆ แทนการให้หน้าโหลดเอง — เทสนี้สนใจแท็บ ไม่ใช่ data fetching ของ dashboard
  store.portfolioId = 7;
  store.portfolioType = type;
  store.overview = {
    portfolio: { id: 7, name: 'Stock', type: 'INVESTOR', currency: 'USD' },
    summary: {
      current_value: 1000,
      cash: 100,
      invested_cost: 900,
      holdings_value: 900,
      realized_pnl: 0,
      unrealized_pnl: 0,
      dividend_income: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
      contributed_capital: 900,
      investment_gain: 100,
      open_holdings: 1,
      closed_sales: 0,
    },
    holdings: [
      {
        symbol: 'NVDA',
        shares: 10,
        average_cost: 90,
        cost_basis: 900,
        market_price: 100,
        market_value: 1000,
        unrealized_pnl: 100,
      },
    ],
    recent_activity: [],
  } as AnalyticsOverview;

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(AnalyticsPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

/** กดแท็บบนแถบแท็บหลักด้วยชื่อ (q-tab ผูก name ผ่าน prop ไม่ใช่ attribute) */
async function openTab(wrapper: VueWrapper, name: string) {
  const tab = wrapper.findAllComponents(QTab).find((item) => item.props('name') === name);

  expect(tab, `tab "${name}" not found`).toBeDefined();

  await tab!.trigger('click');
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('AnalyticsPage — แท็บของโหมด Stock', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();
    getPerformers.mockResolvedValue(performers);
    investorLoad.mockResolvedValue(undefined);
  });

  it('โหมด Stock มีแท็บ AI Insights และ Planning & Tools', async () => {
    const wrapper = await mountPage('INVESTOR');
    const names = wrapper.findAllComponents(QTab).map((tab) => tab.props('name'));

    expect(names).toContain('ai');
    expect(names).toContain('tools');
  });

  it('โหมด Forex ไม่มีสองแท็บนี้ (เป็นเครื่องมือฝั่งหุ้นล้วน)', async () => {
    const wrapper = await mountPage('TRADER');
    const names = wrapper.findAllComponents(QTab).map((tab) => tab.props('name'));

    expect(names).not.toContain('ai');
    expect(names).not.toContain('tools');
  });

  it('เปิดแท็บ AI Insights -> โหลด performers และแสดงทั้งสองฝั่ง', async () => {
    const wrapper = await mountPage();

    await openTab(wrapper, 'ai');

    expect(getPerformers).toHaveBeenCalledWith(7);
    expect(wrapper.find('[data-test="analytics-tab-ai"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="ai-portfolio-advisor"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="ai-risk-analysis"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="performers-grid"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="performer-best"]').text()).toContain('NVDA');
    expect(wrapper.find('[data-test="performer-worst"]').text()).toContain('INTC');
  });

  it('performers โดน 403 -> ขึ้นการ์ดต้องอัปเกรด ไม่ใช่กริดว่าง', async () => {
    getPerformers.mockRejectedValue(httpError(403));

    const wrapper = await mountPage();

    await openTab(wrapper, 'ai');

    expect(wrapper.find('[data-test="performers-upgrade"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="performers-grid"]').exists()).toBe(false);
    // การ์ด AI สองตัวไม่ได้ติด PaidTierGuard จึงต้องยังอยู่
    expect(wrapper.find('[data-test="ai-portfolio-advisor"]').exists()).toBe(true);

    // ตรงนี้การ์ดไปแทนเนื้อหาหลักทั้งก้อน จึงต้องเป็น variant ที่เน้น ไม่ใช่แถบจางๆ
    // ถ้า prop prominent หลุดหายไปเมื่อไหร่ ผู้ใช้แพ็กฟรีจะเห็นแค่กล่องเล็กๆ กลางหน้าว่าง
    expect(wrapper.find('[data-test="performers-upgrade"]').classes()).toContain(
      'ws-upgrade--prominent',
    );
  });

  it('ยิง performers ครั้งเดียวแม้สลับแท็บไปกลับ', async () => {
    const wrapper = await mountPage();

    await openTab(wrapper, 'ai');
    await openTab(wrapper, 'tools');
    await openTab(wrapper, 'ai');

    expect(getPerformers).toHaveBeenCalledTimes(1);
  });

  it('เปิดแท็บ Planning & Tools -> เห็นเครื่องมือครบทั้ง 4 ตัว และโหลดข้อมูลพอร์ตหุ้น', async () => {
    const wrapper = await mountPage();

    await openTab(wrapper, 'tools');

    expect(investorLoad).toHaveBeenCalledWith(7);
    expect(wrapper.find('[data-test="avg-cost-calculator"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="pl-export-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="dividend-tax-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="dca-predictor"]').exists()).toBe(true);
  });

  it('ยังไม่กดแท็บ -> ไม่ยิง performers (lazy-load จริง ไม่ใช่โหลดล่วงหน้า)', async () => {
    await mountPage();

    expect(getPerformers).not.toHaveBeenCalled();
  });
});

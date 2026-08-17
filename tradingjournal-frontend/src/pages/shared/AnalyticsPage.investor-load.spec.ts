/**
 * การโหลดข้อมูลตอนเปิด /Analytics ด้วยพอร์ต INVESTOR
 *
 * บั๊กเดิม: loadAllData() ยิง /analytics/portfolio/:id/daily-pnl ทุกครั้งโดยไม่ดูประเภทพอร์ต
 * backend (AnalyticsService.assertType) ตอบ 400 "Endpoint นี้ใช้กับ TRADER portfolio เท่านั้น"
 * แล้ว error ถูกโยนทับงานที่โหลดสำเร็จไปแล้ว จนทุกแท็บของโหมด Stock ว่างหมด
 *
 * เทสล็อกสองชั้น:
 *   1. พอร์ต INVESTOR ต้องไม่ยิง daily-pnl เลย (พอร์ต TRADER ต้องยังยิงเหมือนเดิม)
 *   2. ต่อให้ endpoint ตัวใดตัวหนึ่งพัง แท็บอื่นต้องยังโหลดข้อมูลของตัวเองได้
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer, QTab } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from './AnalyticsPage.vue';
import { usePortfolioStore } from 'stores/PortfolioStore';
import type { AnalyticsOverview } from 'src/types/analytics.types';
import type { Portfolio, PortfolioType } from 'src/types/portfolio.types';
import type * as PaidTierModule from 'src/utils/paid-tier';

const getDailyPnl = vi.fn();
const getOverview = vi.fn();
const getPerformance = vi.fn();
const getTimeline = vi.fn();
const getAllocation = vi.fn();

// DcaPredictorCard ใช้ StockSymbolPicker ที่ดึงรายชื่อหุ้นผ่าน api.get('/stocks')
// mock ไว้ไม่ให้เทสยิงเน็ตจริง
vi.mock('boot/axios', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('src/services/analytics.service', async () => {
  const { isPaidTierError } = await vi.importActual<typeof PaidTierModule>('src/utils/paid-tier');

  return {
    analyticsService: {
      getOverview: (...args: unknown[]) => getOverview(...args),
      getPerformance: (...args: unknown[]) => getPerformance(...args),
      getDailyPnl: (...args: unknown[]) => getDailyPnl(...args),
      getMonthlyGrowth: vi.fn().mockResolvedValue([]),
      getBehavioral: vi.fn().mockResolvedValue(null),
      getWinRate: vi.fn().mockResolvedValue(null),
      getTimeline: (...args: unknown[]) => getTimeline(...args),
      getAllocation: (...args: unknown[]) => getAllocation(...args),
      getReturnVsBenchmark: vi.fn().mockResolvedValue(null),
      getTimeWeightedReturn: vi.fn().mockResolvedValue(null),
      getMonthlyHeatmap: vi.fn().mockResolvedValue([]),
      getPerformers: vi.fn().mockResolvedValue(null),
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
    load: vi.fn().mockResolvedValue(undefined),
  }),
}));

/** 400 ที่ backend ตอบกลับมาจริงเมื่อพอร์ต INVESTOR ยิง daily-pnl */
const traderOnlyError = () =>
  Object.assign(new Error('Request failed with status code 400'), {
    response: {
      status: 400,
      data: { message: 'Endpoint นี้ใช้กับ TRADER portfolio เท่านั้น' },
    },
  });

function makePortfolio(type: PortfolioType): Portfolio {
  return {
    id: 7,
    user_id: 1,
    name: type === 'INVESTOR' ? 'QA Stock' : 'QA Forex',
    initial_balance: 100000,
    current_balance: 100000,
    portfolio_type: type,
    investor_cost_method: 'FIFO',
    currency: 'THB',
    icon: null,
    color: null,
    is_default: true,
    created_at: null,
    updated_at: null,
  };
}

function overviewOf(type: PortfolioType): AnalyticsOverview {
  return {
    portfolio: { id: 7, name: 'QA', type, currency: 'THB' },
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
    holdings: [],
    recent_activity: [],
  } as AnalyticsOverview;
}

async function mountPage(type: PortfolioType): Promise<VueWrapper> {
  const portStore = usePortfolioStore();

  portStore.portfolios = [makePortfolio(type)];
  portStore.activeType = type;
  portStore.activePortfolioIds = { TRADER: null, INVESTOR: null, [type]: 7 };

  getOverview.mockResolvedValue(overviewOf(type));

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(AnalyticsPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

async function openTab(wrapper: VueWrapper, name: string) {
  const tab = wrapper.findAllComponents(QTab).find((item) => item.props('name') === name);

  expect(tab, `tab "${name}" not found`).toBeDefined();

  await tab!.trigger('click');
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('AnalyticsPage — โหลดข้อมูลตามประเภทพอร์ต', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();

    getPerformance.mockResolvedValue([]);
    getTimeline.mockResolvedValue([]);
    getAllocation.mockResolvedValue([]);
    getDailyPnl.mockResolvedValue({});
  });

  it('พอร์ต INVESTOR ไม่ยิง daily-pnl (ปฏิทินเป็นของพอร์ต TRADER เท่านั้น)', async () => {
    // ถ้าหลุดไปยิงจริง backend จะตอบ 400 — ให้ mock พังแบบเดียวกับของจริงไว้ดักเลย
    getDailyPnl.mockRejectedValue(traderOnlyError());

    await mountPage('INVESTOR');

    expect(getDailyPnl).not.toHaveBeenCalled();
    expect(getOverview).toHaveBeenCalled();
    expect(getPerformance).toHaveBeenCalled();
  });

  it('พอร์ต TRADER ยังยิง daily-pnl เหมือนเดิม', async () => {
    await mountPage('TRADER');

    expect(getDailyPnl).toHaveBeenCalled();
  });

  it('daily-pnl พังฝั่ง TRADER ต้องไม่ลากแท็บอื่นตาย', async () => {
    getDailyPnl.mockRejectedValue(traderOnlyError());

    const wrapper = await mountPage('TRADER');

    // overview/performance ยิงไปพร้อมกัน จึงต้องได้ข้อมูลของตัวเองครบแม้ปฏิทินพัง
    expect(getOverview).toHaveBeenCalled();
    expect(getPerformance).toHaveBeenCalled();

    // และแท็บอื่นยังกดเข้าไปโหลดข้อมูลของตัวเองต่อได้
    await openTab(wrapper, 'growth');

    expect(wrapper.find('[data-test="analytics-tab-ai"]').exists()).toBe(false);
  });

  it('โหมด Stock เปิดครบทุกแท็บได้โดยไม่มี endpoint ของฝั่ง TRADER หลุดไป', async () => {
    const wrapper = await mountPage('INVESTOR');

    for (const tab of ['allocation', 'timeline', 'ai', 'tools', 'dashboard']) {
      await openTab(wrapper, tab);
    }

    expect(getDailyPnl).not.toHaveBeenCalled();
    expect(getTimeline).toHaveBeenCalled();
    expect(getAllocation).toHaveBeenCalled();
  });
});

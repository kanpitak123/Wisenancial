/**
 * StockAnalysisPage — พฤติกรรมตอนโหลดข้อมูลทับของเดิม
 *
 * สวีทนี้เกิดจากบั๊กจริงที่เจอตอน QA รอบแรกหลังรวมหน้าเป็น Stock Terminal:
 *
 *   1. สลับหุ้นเร็ว ๆ แล้วคำขอเก่าตอบทีหลัง เขียนทับข้อมูลของหุ้นตัวใหม่
 *      (URL เป็น NVDA แต่หน้าจอโชว์ MSFT)
 *   2. ทุกครั้งที่เปลี่ยน timeframe/หุ้น loading=true ทำให้ v-if ถอด terminal-main
 *      ทั้งก้อนทิ้ง — รวมทั้ง q-tab-panels ที่มี transition ค้างและ PriceChart ที่ถือ
 *      canvas อยู่ ทำให้ Vue เจอ vnode ที่ element ถูกถอดไปแล้ว (n1.el === null)
 *      และกราฟถูกสร้างใหม่ตอน container ยังไม่มีขนาดจนกลายเป็นกราฟเปล่า
 *
 * จึงล็อกไว้ว่า: โหลดทับของเดิมต้องไม่ถอดกราฟทิ้ง ต้องมีตัวบอกสถานะให้เห็น
 * และผลลัพธ์ที่มาช้าต้องถูกทิ้ง
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const replace = vi.fn();
const routeParams = ref<Record<string, string>>({ symbol: 'AAPL' });

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({
    get path() {
      return `/stock/${routeParams.value.symbol ?? ''}`;
    },
    get params() {
      return routeParams.value;
    },
    query: {},
    meta: {},
  }),
}));

// lightweight-charts วาดลง canvas ล้วน — happy-dom มองไม่เห็น ที่นี่สนใจแค่ว่า
// คอมโพเนนต์กราฟ "ยังอยู่ในต้นไม้หรือถูกถอดทิ้ง"
vi.mock('lightweight-charts', () => {
  const series = () => ({
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn((options: unknown) => ({ options })),
    removePriceLine: vi.fn(),
  });

  return {
    createChart: vi.fn(() => ({
      addSeries: vi.fn(() => series()),
      removeSeries: vi.fn(),
      remove: vi.fn(),
      timeScale: vi.fn(() => ({ fitContent: vi.fn(), applyOptions: vi.fn() })),
    })),
    CandlestickSeries: { type: 'Candlestick' },
    LineSeries: { type: 'Line' },
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
    CrosshairMode: { Normal: 0, Magnet: 1, Hidden: 2 },
  };
});

const get = vi.fn();
vi.mock('boot/axios', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

vi.mock('src/services/stocks.service', () => ({
  stocksService: {
    list: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 }),
  },
  SECTOR_OPTIONS: ['Technology'],
  EXCHANGE_OPTIONS: ['NASDAQ', 'NYSE', 'SET'],
}));

const StockTerminalPage = (await import('./StockTerminalPage.vue')).default;

function historicalBars(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: 100 + index,
    high: 105 + index,
    low: 98 + index,
    close: 102 + index,
    volume: 1_000_000 + index,
  }));
}

function analysisPayload(symbol: string) {
  const bars = historicalBars(30);

  return {
    profile: {
      symbol,
      name: `${symbol} Inc.`,
      description: 'desc',
      ceo: 'CEO',
      website: 'example.com',
      industry: 'Tech',
      marketCap: 2_000_000_000_000,
      sector: 'Technology',
      headquarters: 'US',
      currentPrice: 120,
      priceChange: 1.2,
      dividendYield: 0.5,
    },
    financials: [
      { symbol, revenue: 1, netIncome: 1, eps: 6, peRatio: 30, quarter: 'Q1', year: 2026 },
    ],
    historicalData: bars,
    technicalIndicators: {
      rsi: 55,
      stochastic: { k: 50, d: 50 },
      overboughtOversold: {
        status: 'Neutral',
        rsi: 55,
        stochasticK: 50,
        stochasticD: 50,
        isStrongReversal: false,
        description: 'ok',
      },
      supportLevels: [100],
      resistanceLevels: [130],
      currentPrice: 120,
      detectedPattern: { name: null, detectedAt: null, coordinates: [] },
      emas: {
        ema20: bars.map((_, i) => 100 + i),
        ema50: bars.map((_, i) => 99 + i),
        ema100: bars.map((_, i) => 98 + i),
      },
    },
  };
}

/** คำขอ /stocks/analysis/* ที่ถูกกักไว้ ให้เทสสั่งปล่อยเองตามลำดับที่ต้องการ */
let deferredAnalysis: { symbol: string; release: () => void }[] = [];

function mockApi({ defer }: { defer: boolean }) {
  get.mockImplementation((url: string) => {
    if (url.startsWith('/stocks/analysis/')) {
      const symbol = url.split('/').pop()!.split('?')[0]!;

      if (!defer) return Promise.resolve({ data: analysisPayload(symbol) });

      return new Promise<void>((resolve) => {
        deferredAnalysis.push({ symbol, release: resolve });
      }).then(() => ({ data: analysisPayload(symbol) }));
    }

    if (url.startsWith('/stocks/intrinsic-value/'))
      return Promise.resolve({
        data: {
          symbol: 'X',
          currentPrice: 1,
          intrinsicValue: 1,
          status: 'Fair Value',
          discountPremium: 0,
          analysis: {},
          confidence: 1,
        },
      });

    if (url.startsWith('/stocks/seasonality/'))
      return Promise.resolve({
        data: { symbol: 'X', analysis: [], overallWinRate: 0, totalYearsAnalyzed: 0 },
      });

    if (url.startsWith('/market/analysis/')) return Promise.resolve({ data: null });
    if (url.startsWith('/stocks/analyst/')) return Promise.resolve({ data: null });
    if (url === '/stocks/popular') return Promise.resolve({ data: [] });
    if (url === '/stocks') return Promise.resolve({ data: [] });
    if (url === '/market/quotes/realtime') return Promise.resolve({ data: [] });

    return Promise.resolve({ data: {} });
  });
}

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mountTerminal(): VueWrapper {
  return mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(StockTerminalPage)])]) },
    { attachTo: document.body },
  );
}

const chartExists = (wrapper: VueWrapper) => wrapper.find('[data-test="price-chart"]').exists();

describe('StockAnalysisPage — โหลดทับของเดิม', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    deferredAnalysis = [];
    routeParams.value = { symbol: 'AAPL' };
    vi.clearAllMocks();
  });

  it('เปลี่ยน timeframe แล้วกราฟต้องไม่ถูกถอดทิ้ง และมีตัวบอกว่ากำลังโหลด', async () => {
    mockApi({ defer: true });
    const wrapper = mountTerminal();
    await settle();

    deferredAnalysis.shift()?.release();
    await settle();

    expect(chartExists(wrapper)).toBe(true);

    const timeframeButtons = wrapper.findAll('.timeframe-btn');
    await timeframeButtons[4]!.trigger('click');
    await settle(2);

    // ระหว่างโหลดรอบใหม่: กราฟยังอยู่ (ไม่ถูก v-if ถอดไปเป็นโครงร่าง) + เห็นสถานะโหลด
    expect(chartExists(wrapper)).toBe(true);
    expect(wrapper.find('.terminal-skeleton').exists()).toBe(false);
    expect(wrapper.find('[data-test="chart-loading-overlay"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="analysis-refreshing"]').exists()).toBe(true);

    deferredAnalysis.pop()?.release();
    await settle();

    expect(chartExists(wrapper)).toBe(true);
    expect(wrapper.find('[data-test="chart-loading-overlay"]').exists()).toBe(false);
  });

  it('สลับหุ้นเร็ว ๆ แล้วคำขอเก่าที่ตอบทีหลังต้องไม่เขียนทับหุ้นตัวปัจจุบัน', async () => {
    mockApi({ defer: true });
    const wrapper = mountTerminal();
    await settle();

    deferredAnalysis.shift()?.release();
    await settle();

    routeParams.value = { symbol: 'MSFT' };
    await nextTick();
    routeParams.value = { symbol: 'NVDA' };
    await settle(2);

    expect(deferredAnalysis.some((entry) => entry.symbol === 'NVDA')).toBe(true);
    expect(deferredAnalysis.some((entry) => entry.symbol === 'MSFT')).toBe(true);

    // ปล่อยย้อนลำดับ — คำขอที่ยิงทีหลังตอบก่อน ของเก่ากว่าทยอยตอบตามมา
    // ทั้งหมดที่ตอบช้ากว่ารอบล่าสุดต้องถูกทิ้ง ไม่ใช่เขียนทับ
    while (deferredAnalysis.length > 0) {
      deferredAnalysis.pop()!.release();
      await settle(2);
    }

    await settle();

    expect(wrapper.find('.symbol').text()).toBe('NVDA');
  });

  it('โหลดทับของเดิมไม่สำเร็จ -> ขึ้นแถบ error ที่กดลองใหม่ได้ ไม่ใช่จอเปล่าเงียบ ๆ', async () => {
    mockApi({ defer: false });
    const wrapper = mountTerminal();
    await settle();

    expect(chartExists(wrapper)).toBe(true);

    // ให้รอบถัดไปพัง
    get.mockImplementation((url: string) => {
      if (url.startsWith('/stocks/analysis/')) return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: {} });
    });

    await wrapper.findAll('.timeframe-btn')[4]!.trigger('click');
    await settle();

    expect(wrapper.find('[data-test="analysis-refresh-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="analysis-refresh-retry"]').exists()).toBe(true);
    // ข้อมูลเดิมยังอยู่ให้ดู ไม่ถูกล้างทิ้ง
    expect(chartExists(wrapper)).toBe(true);
  });

  it('โหลดครั้งแรก (ยังไม่มีข้อมูล) ยังขึ้นโครงร่างเหมือนเดิม', async () => {
    mockApi({ defer: true });
    const wrapper = mountTerminal();
    await settle();

    expect(wrapper.find('.terminal-skeleton').exists()).toBe(true);
    expect(chartExists(wrapper)).toBe(false);

    deferredAnalysis.shift()?.release();
    await settle();

    expect(wrapper.find('.terminal-skeleton').exists()).toBe(false);
    expect(chartExists(wrapper)).toBe(true);
  });
});

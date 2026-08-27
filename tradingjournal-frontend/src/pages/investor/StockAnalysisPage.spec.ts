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
    if (url === '/stocks/popular') return Promise.resolve({ data: popularUs });
    if (url === '/stocks/popular-th') return Promise.resolve({ data: popularTh });
    if (url === '/stocks') return Promise.resolve({ data: [] });
    if (url === '/market/quotes/realtime') return Promise.resolve({ data: [] });

    return Promise.resolve({ data: {} });
  });
}

/** แถวหุ้นยอดนิยมที่ mock ของ api.get จะคืน — เทสแต่ละข้อเขียนทับได้ */
let popularUs: unknown[] = [];
let popularTh: unknown[] = [];

const US_ROWS = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 214.5,
    changePercent: 0.62,
    preMarketPrice: 214.9,
    preMarketChangePercent: 0.18,
    support1: 210,
    support2: 205,
    resistance1: 220,
    resistance2: 226,
    dividendYield: 0.53,
    marketCap: 3_300_000_000_000,
  },
];

const TH_ROWS = [
  {
    symbol: 'PTT.BK',
    name: 'PTT Public Company',
    price: 33.25,
    changePercent: -1.2,
    support: 32.5,
    resistance: 34.75,
    valueMB: 1820,
    pe: 11.4,
    eps: 2.91,
    dividendPct: 6.02,
  },
];

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
    popularUs = US_ROWS;
    popularTh = TH_ROWS;
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

/**
 * การ์ด "หุ้นยอดนิยม" ใต้กราฟ — แท็บสามโหมดที่ย้ายมาจากหัวแถบสำรวจซ้าย
 *
 * แถบซ้ายของ Stock Terminal ถูกถอดออกทั้งหมด ปุ่มสามตัว (สำรวจหุ้น/หุ้นไทย/หุ้นสหรัฐ)
 * กับเนื้อหาที่มันคุมย้ายมาอยู่บนการ์ดใบนี้แทน สวีทนี้ล็อกว่าย้ายแล้วยังทำงานครบ
 */
describe('StockAnalysisPage — การ์ดหุ้นยอดนิยม (แท็บ 3 โหมด)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    deferredAnalysis = [];
    routeParams.value = { symbol: 'AAPL' };
    popularUs = US_ROWS;
    popularTh = TH_ROWS;
    vi.clearAllMocks();
  });

  /** mount แล้วรอให้กราฟ + การ์ดโหลดเสร็จ (การ์ดอยู่ในแท็บกราฟซึ่งเป็นแท็บเริ่มต้น) */
  async function mountReady(): Promise<VueWrapper> {
    mockApi({ defer: false });
    const wrapper = mountTerminal();
    await settle();
    return wrapper;
  }

  const modeUrls = () =>
    get.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith('/stocks/popular'));

  it('แท็บทั้งสามอยู่บนหัวการ์ด ไม่ใช่บนแถบซ้ายอีกแล้ว', async () => {
    const wrapper = await mountReady();

    const bar = wrapper.find('[data-test="popular-mode-bar"]');
    expect(bar.exists()).toBe(true);

    // อยู่ใน q-card-section หัวการ์ดเดียวกับชื่อ "หุ้นยอดนิยม"
    const header = wrapper.find('.popular-header');
    expect(header.find('[data-test="popular-mode-bar"]').exists()).toBe(true);
    expect(header.text()).toContain('หุ้นยอดนิยม');

    expect(wrapper.find('[data-test="popular-mode-EXPLORE"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="popular-mode-TH"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="popular-mode-US"]').exists()).toBe(true);

    // แถบซ้ายเดิมต้องไม่เหลือแล้ว
    expect(wrapper.find('[data-test="terminal-rail"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="rail-mode-bar"]').exists()).toBe(false);
  });

  it('ชื่อการ์ดกับแถบแท็บเป็นพี่น้องกัน — อยู่แถวเดียวกัน', async () => {
    const wrapper = await mountReady();

    // ถ้าแท็บหลุดไปซ้อนในกล่องชื่อ มันจะตกมาคนละบรรทัดทันที
    const header = wrapper.find('.popular-header').element;
    const children = Array.from(header.children);

    expect(children).toHaveLength(2);
    expect(children[0]?.classList.contains('popular-header__title')).toBe(true);
    expect(children[1]?.getAttribute('data-test')).toBe('popular-mode-bar');
  });

  it('เริ่มต้นที่หุ้นสหรัฐ และแสดงตารางฝั่งสหรัฐ', async () => {
    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="popular-mode-US"]').classes()).toContain(
      'popular-mode--active',
    );
    expect(modeUrls()).toContain('/stocks/popular');
    expect(wrapper.find('.popular-table').text()).toContain('AAPL');
  });

  it('กดหุ้นไทย -> ยิง /stocks/popular-th และสลับเป็นตารางคอลัมน์ของฝั่งไทย', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();

    expect(modeUrls()).toContain('/stocks/popular-th');

    const thTable = wrapper.find('[data-test="popular-table-th"]');
    expect(thTable.exists()).toBe(true);
    expect(thTable.text()).toContain('PTT');

    // คอลัมน์เฉพาะฝั่งไทย (P/E, EPS, มูลค่าซื้อขาย) ต้องมี ส่วน "แนวรับ 2" ของฝั่งสหรัฐต้องไม่มี
    expect(thTable.text()).toContain('P/E');
    expect(thTable.text()).toContain('EPS');
    expect(thTable.text()).not.toContain('แนวรับ 2');
  });

  it('ตารางหุ้นไทยตัดนามสกุล .BK ออกเหมือนหน้าอื่น', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();

    const symbolCell = wrapper.find('[data-test="popular-row-th"] .stock-cell-symbol');
    expect(symbolCell.text()).toBe('PTT');
  });

  it('กดสำรวจหุ้น -> แสดงตัวสำรวจหุ้นในการ์ด ไม่ใช่ตารางหุ้นยอดนิยม', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="popular-mode-EXPLORE"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-test="popular-explore"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="popular-table-th"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'StockExplorerRail' }).exists()).toBe(true);
  });

  it('คลิกแถวในตารางหุ้นไทย -> เปลี่ยนหุ้นผ่าน /stock/:symbol', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();

    await wrapper.find('[data-test="popular-row-th"]').trigger('click');

    expect(push).toHaveBeenCalledWith('/stock/PTT.BK');
  });

  it('จำโหมดล่าสุดไว้ และหยิบกลับมาตอนเปิดหน้าใหม่', async () => {
    const first = await mountReady();
    await first.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();

    expect(localStorage.getItem('wisenancial.stockTerminal.popularMode')).toBe('TH');

    first.unmount();
    vi.clearAllMocks();

    const second = await mountReady();

    expect(second.find('[data-test="popular-mode-TH"]').classes()).toContain(
      'popular-mode--active',
    );
    expect(modeUrls()).toContain('/stocks/popular-th');
    expect(modeUrls()).not.toContain('/stocks/popular');
  });

  it('ค่าโหมดที่ค้างอยู่แต่ไม่รู้จักแล้ว -> ถอยกลับไปค่าเริ่มต้น ไม่ใช่การ์ดว่าง', async () => {
    localStorage.setItem('wisenancial.stockTerminal.popularMode', 'CRYPTO');

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="popular-mode-US"]').classes()).toContain(
      'popular-mode--active',
    );
    expect(wrapper.find('.popular-table').exists()).toBe(true);
  });

  it('โหมด Explore ที่จำไว้ ต้องไม่ยิงขอราคาหุ้นยอดนิยมโดยเปล่าประโยชน์', async () => {
    localStorage.setItem('wisenancial.stockTerminal.popularMode', 'EXPLORE');

    const wrapper = await mountReady();

    expect(wrapper.find('[data-test="popular-explore"]').exists()).toBe(true);
    expect(modeUrls()).toHaveLength(0);
  });

  it('ตลาดที่เลือกไม่มีข้อมูล -> ขึ้น empty state ที่กดลองใหม่ได้', async () => {
    popularTh = [];

    const wrapper = await mountReady();
    await wrapper.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-test="popular-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="popular-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="popular-row-th"]').exists()).toBe(false);
  });

  it('สลับไทย -> สหรัฐ -> ไทย ยิงราคาใหม่ทุกครั้ง (ราคาสด ไม่ใช่ค่าค้าง)', async () => {
    const wrapper = await mountReady();

    await wrapper.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();
    await wrapper.find('[data-test="popular-mode-US"]').trigger('click');
    await settle();
    await wrapper.find('[data-test="popular-mode-TH"]').trigger('click');
    await settle();

    expect(modeUrls().filter((url) => url === '/stocks/popular-th')).toHaveLength(2);
  });

  it('ปุ่ม "ดูทั้งหมด" เดิมถูกถอดออก — Explore เป็นแท็บอยู่ตรงนั้นแล้ว', async () => {
    const wrapper = await mountReady();

    expect(wrapper.find('.popular-footer').exists()).toBe(false);
    expect(wrapper.find('.view-all-btn').exists()).toBe(false);
  });
});

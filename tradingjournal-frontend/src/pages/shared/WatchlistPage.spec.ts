/**
 * หน้า Watchlist ตัวจริงคือฟีด AI recommendations 4 หมวดจาก GET /stocks/radar
 * ไม่ใช่รายการที่ผู้ใช้กดเพิ่มเอง (ของเดิมที่ path นี้)
 *
 * เทสครอบพฤติกรรมที่แยกสอง section แบบออกจากกัน:
 *   - Upside/Downside มีตัวกรอง 3 ตัว และตัวกรองของแต่ละ section ต้องไม่กวนกัน
 *   - Near/Not-recommended ตัดเหลือ 4 อันแรกจนกว่าจะกดดูทั้งหมด
 *   - การ์ดต้องพาไป /stock/:symbol
 *   - โหมด Forex ต้องไม่เห็น radar (ฟีดเป็นข้อมูลหุ้นล้วน)
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer, QSelect } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WatchlistPage from './WatchlistPage.vue';
import type { RadarCategory, RadarDateBucket, RadarStock } from 'stores/AiRecommendationsStore';
import type { StockSector } from 'src/types/stocks.types';
import type * as StocksServiceModule from 'src/services/stocks.service';

const getRadar = vi.fn();
const push = vi.fn();

vi.mock('src/services/stocks.service', async () => {
  const actual = await vi.importActual<typeof StocksServiceModule>('src/services/stocks.service');

  return {
    ...actual,
    stocksService: { list: vi.fn(), getRadar: () => getRadar() },
  };
});

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/Watchlist', query: {}, meta: {} }),
}));

// section "ติดตามเอง" ไม่ใช่ของที่เทสนี้สนใจ — ตัด CRUD จริงออกให้ mount ได้โดยไม่แตะ axios
vi.mock('src/composables/useWatchlist', () => ({
  useWatchlist: () => ({
    currentItems: { value: [] },
    isLoading: { value: false },
    isSubmitting: { value: false },
    loadForPortfolio: vi.fn().mockResolvedValue([]),
    addAsset: vi.fn(),
    removeAsset: vi.fn(),
  }),
}));

let investorMode = true;

vi.mock('src/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    meta: { value: { label: 'Stock', icon: 'trending_up', color: 'teal-5' } },
    get isInvestor() {
      return { value: investorMode };
    },
  }),
}));

vi.mock('stores/PortfolioStore', () => ({
  usePortfolioStore: () => ({
    portfolios: [],
    activePortfolio: null,
    activePortfolioId: null,
    loadPortfolios: vi.fn().mockResolvedValue([]),
  }),
}));

function radarStock(
  symbol: string,
  category: RadarCategory,
  overrides: Partial<RadarStock> = {},
): RadarStock {
  return {
    symbol,
    name: `${symbol} Inc.`,
    category,
    sector: 'Technology' as StockSector,
    dateBucket: 'TODAY' as RadarDateBucket,
    initialPrice: 100,
    currentPrice: 110,
    startDate: '2026-08-01',
    returnPercent: 10,
    ...overrides,
  };
}

const FEED: RadarStock[] = [
  radarStock('AAPL', 'Upside', { sector: 'Technology', dateBucket: 'TODAY', returnPercent: 12 }),
  radarStock('JPM', 'Upside', {
    sector: 'Financials',
    dateBucket: 'THIS_WEEK',
    returnPercent: 3,
  }),
  radarStock('XOM', 'Upside', { sector: 'Energy', dateBucket: 'THIS_MONTH', returnPercent: 25 }),
  radarStock('INTC', 'Downside', {
    sector: 'Technology',
    dateBucket: 'TODAY',
    currentPrice: 80,
    returnPercent: -20,
  }),
  radarStock('F', 'Downside', {
    sector: 'Consumer',
    dateBucket: 'THIS_WEEK',
    currentPrice: 97,
    returnPercent: -3,
  }),
  // 6 ตัว -> เกินลิมิต 4 ของ section แบบ view-all
  ...['N1', 'N2', 'N3', 'N4', 'N5', 'N6'].map((s) => radarStock(s, 'Near-recommended')),
  ...['X1', 'X2'].map((s) => radarStock(s, 'Not-recommended')),
];

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(WatchlistPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

/** q-select ของ section ที่ระบุ เรียงตามลำดับใน template: sector, date, change */
function filtersOf(wrapper: VueWrapper, category: RadarCategory) {
  const section = wrapper.find(`[data-test="radar-section-${category}"]`);

  return wrapper
    .findAllComponents(QSelect)
    .filter((select) => section.element.contains(select.element));
}

function cardsIn(wrapper: VueWrapper, category: RadarCategory) {
  return wrapper.findAll(`[data-test="radar-section-${category}"] [data-test="radar-card"]`);
}

describe('WatchlistPage — AI radar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();
    investorMode = true;
    getRadar.mockResolvedValue(FEED);
  });

  it('โหลดสำเร็จ -> แสดงครบทั้ง 4 หมวด พร้อมจำนวนของแต่ละหมวด', async () => {
    const wrapper = await mountPage();

    expect(cardsIn(wrapper, 'Upside')).toHaveLength(3);
    expect(cardsIn(wrapper, 'Downside')).toHaveLength(2);
    // ตัดเหลือ 4 จาก 6
    expect(cardsIn(wrapper, 'Near-recommended')).toHaveLength(4);
    expect(cardsIn(wrapper, 'Not-recommended')).toHaveLength(2);
  });

  it('ฟิลเตอร์ sector ของ Upside กรองถูก และไม่กวน Downside', async () => {
    const wrapper = await mountPage();

    await filtersOf(wrapper, 'Upside')[0]!.setValue('Technology');
    await nextTick();

    expect(cardsIn(wrapper, 'Upside')).toHaveLength(1);
    expect(wrapper.find('[data-test="radar-section-Upside"]').text()).toContain('AAPL');
    // Downside ยังครบ — ตัวกรองแยกชุดกัน
    expect(cardsIn(wrapper, 'Downside')).toHaveLength(2);
  });

  it('ฟิลเตอร์ช่วงเวลากรองถูก', async () => {
    const wrapper = await mountPage();

    await filtersOf(wrapper, 'Upside')[1]!.setValue('THIS_MONTH');
    await nextTick();

    expect(cardsIn(wrapper, 'Upside')).toHaveLength(1);
    expect(wrapper.find('[data-test="radar-section-Upside"]').text()).toContain('XOM');
  });

  it('ฟิลเตอร์ขนาดการเปลี่ยนแปลงเทียบค่าสัมบูรณ์ — ฝั่ง Downside ที่ติดลบต้องผ่านด้วย', async () => {
    const wrapper = await mountPage();

    await filtersOf(wrapper, 'Downside')[2]!.setValue(10);
    await nextTick();

    // -20% ผ่าน, -3% ไม่ผ่าน
    expect(cardsIn(wrapper, 'Downside')).toHaveLength(1);
    expect(wrapper.find('[data-test="radar-section-Downside"]').text()).toContain('INTC');
  });

  it('กรองจนไม่เหลืออะไร -> ขึ้น empty state ของ section นั้น ไม่ใช่กริดว่าง', async () => {
    const wrapper = await mountPage();

    await filtersOf(wrapper, 'Upside')[0]!.setValue('Healthcare');
    await nextTick();

    expect(cardsIn(wrapper, 'Upside')).toHaveLength(0);
    expect(wrapper.find('[data-test="radar-section-Upside"] [data-test="radar-no-match"]').exists()).toBe(
      true,
    );
  });

  it('ปุ่มดูทั้งหมดสลับระหว่าง 4 อันแรกกับทั้งหมด', async () => {
    const wrapper = await mountPage();

    const toggle = wrapper.find('[data-test="radar-view-all-Near-recommended"]');

    expect(toggle.exists()).toBe(true);

    await toggle.trigger('click');
    expect(cardsIn(wrapper, 'Near-recommended')).toHaveLength(6);

    await toggle.trigger('click');
    expect(cardsIn(wrapper, 'Near-recommended')).toHaveLength(4);
  });

  it('หมวดที่มีไม่เกิน 4 ตัว ไม่ต้องมีปุ่มดูทั้งหมด', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="radar-view-all-Not-recommended"]').exists()).toBe(false);
  });

  it('คลิกการ์ด -> ไปหน้า Stock Analysis ของสัญลักษณ์นั้น', async () => {
    const wrapper = await mountPage();

    await cardsIn(wrapper, 'Upside')[0]!.trigger('click');

    expect(push).toHaveBeenCalledWith('/stock/AAPL');
  });

  it('radar ล้ม -> ขึ้นการ์ด error ให้กดลองใหม่ ไม่ใช่หน้าว่าง', async () => {
    getRadar.mockRejectedValue(new Error('boom'));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="radar-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="radar-card"]').exists()).toBe(false);
  });

  it('radar ว่าง -> ขึ้น empty state ของทั้งฟีด', async () => {
    getRadar.mockResolvedValue([]);

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="radar-empty"]').exists()).toBe(true);
  });

  it('โหมด Forex ไม่เรียก radar และไม่แสดง section ของ AI — เหลือแค่ส่วนติดตามเอง', async () => {
    investorMode = false;

    const wrapper = await mountPage();

    expect(getRadar).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="radar-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="manual-section"]').exists()).toBe(true);
  });
});

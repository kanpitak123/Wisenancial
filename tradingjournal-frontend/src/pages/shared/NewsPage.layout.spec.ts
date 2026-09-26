/**
 * NewsPage — ยืนยันว่าการยุบ 3 คอลัมน์เหลือ 2 ไม่ได้ทำอะไรพัง
 *
 * งานรอบนี้ย้ายแต่ markup ไม่ได้แตะ handler เลย เทสจึงจับสองเรื่อง:
 *   1) โครงใหม่ถูกต้อง — คอลัมน์ขวาเดิม (.news-side) ต้องหายไป และวิดเจ็ตทั้งสามใบ
 *      ต้องไปโผล่ในคอลัมน์ซ้าย (.news-rail) ครบ
 *   2) ตัวกรอง/ค้นหา/ปักหมุด ยังต่อสายอยู่กับ useNews ตัวเดิมทุกเส้น — ถ้าใครย้าย
 *      markup แล้วเผลอตัด @click ทิ้ง เทสข้อนี้จะจับได้
 */
import { flushPromises, mount } from '@vue/test-utils';
import { QLayout, QPageContainer } from 'quasar';
import { createPinia, setActivePinia } from 'pinia';
import { h, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedNewsItem } from 'src/types/news.types';
import NewsPage from './NewsPage.vue';

const changeScope = vi.fn().mockResolvedValue(undefined);
const updateFilters = vi.fn();
const applyFilters = vi.fn().mockResolvedValue(undefined);
const togglePin = vi.fn().mockResolvedValue(undefined);
const changeLanguage = vi.fn().mockResolvedValue(undefined);
const initialize = vi.fn().mockResolvedValue(undefined);
const refresh = vi.fn().mockResolvedValue(undefined);
const loadMore = vi.fn().mockResolvedValue(undefined);
const clearFilters = vi.fn();
const routerPush = vi.fn();

function makeItem(over: Partial<UnifiedNewsItem> = {}): UnifiedNewsItem {
  return {
    id: 'n1',
    sourceId: 1,
    scope: 'INVESTOR',
    kind: 'MARKET_ARTICLE',
    title: 'NVDA beats estimates',
    summary: 'Data centre revenue up',
    source: 'Reuters',
    url: 'https://example.com',
    importance: 'HIGH',
    sentiment: 'POSITIVE',
    aiSummary: null,
    impactAnalysis: null,
    aiTrend: 'BULLISH',
    aiImpactProbability: 0.7,
    translatedSummary: null,
    relatedSymbols: ['NVDA'],
    country: 'US',
    impact: 'High',
    forecast: null,
    previous: null,
    actual: null,
    sector: null,
    publishedAt: new Date().toISOString(),
    isPinned: false,
    ...over,
  } as UnifiedNewsItem;
}

const NEWS = [
  makeItem({ id: 'n1', relatedSymbols: ['NVDA'], isPinned: true }),
  makeItem({ id: 'n2', relatedSymbols: ['NVDA', 'AMD'], title: 'AMD guidance' }),
];

vi.mock('src/composables/useNews', () => ({
  useNews: () => ({
    scope: ref('ALL'),
    language: ref('th'),
    news: ref(NEWS),
    displayedNews: ref(NEWS),
    filters: ref({ search: '', importance: null, sentiment: null }),
    isLoading: ref(false),
    isPinning: ref([] as string[]),
    hasNews: ref(true),
    canLoadMore: ref(false),
    initialize,
    changeScope,
    changeLanguage,
    updateFilters,
    applyFilters,
    togglePin,
    clearFilters,
    refresh,
    loadMore,
  }),
}));

vi.mock('src/services/market.service', () => ({
  marketService: {
    getEarningsCalendar: vi.fn().mockResolvedValue({
      items: [{ symbol: 'AAPL', earningsDate: '2026-09-01', epsEstimate: 1.42 }],
    }),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => ({ path: '/News', query: {}, meta: {} }),
}));

/** q-page ต้องอยู่ใต้ q-layout > q-page-container ไม่งั้น Quasar ไม่ render อะไรเลย */
async function mountPage() {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(NewsPage)])]) },
    { attachTo: document.body },
  );
  await flushPromises();
  return wrapper;
}

describe('NewsPage — โครง 2 คอลัมน์', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('คอลัมน์ขวาเดิมถูกยุบทิ้ง เหลือสองคอลัมน์', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('.news-side').exists(), 'คอลัมน์ที่สามต้องไม่เหลือ').toBe(false);
    expect(wrapper.find('.news-rail').exists()).toBe(true);
    expect(wrapper.find('.news-main').exists()).toBe(true);
  });

  it('วิดเจ็ตทั้งสามใบย้ายเข้าคอลัมน์ซ้ายครบ ไม่มีใบไหนตกหล่น', async () => {
    const wrapper = await mountPage();

    const railText = wrapper.find('.news-rail').text();
    const cards = wrapper.findAll('.news-rail .side-card');

    // ตัวกรอง + Most mentioned + Pinned news + Earnings
    expect(wrapper.find('.news-rail .rail-card').exists()).toBe(true);
    expect(cards.length).toBe(3);
    expect(railText).toContain('NVDA'); // most-mentioned คำนวณจากข่าวที่โหลดมา
    expect(railText).toContain('AAPL'); // earnings calendar
  });

  it('คอลัมน์ฟีดมีคำปฏิเสธ AI เหนือการ์ดข่าว (สรุป AI ในการ์ดเป็นเนื้อหาที่ AI สร้าง)', async () => {
    const wrapper = await mountPage();

    const disclaimer = wrapper.find('.news-main [data-test="ai-disclaimer"]');
    const firstCard = wrapper.find('.news-main .news-card');

    expect(disclaimer.exists()).toBe(true);
    expect(disclaimer.text()).toContain('ไม่ใช่คำแนะนำทางการเงิน');
    // อยู่ก่อนการ์ดข่าวใบแรกในลำดับเอกสาร
    expect(
      disclaimer.element.compareDocumentPosition(firstCard.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('ฟีดข่าวยัง render อยู่ในคอลัมน์ขวา', async () => {
    const wrapper = await mountPage();

    const cards = wrapper.findAll('.news-main .news-card');
    expect(cards.length).toBe(NEWS.length);
    expect(wrapper.find('.news-main').text()).toContain('NVDA beats estimates');
  });

  // ── สายที่ต้องไม่ขาดตอนย้าย markup ────────────────────────────────────────
  it('กดตัวกรองขอบเขต -> ยังเรียก changeScope', async () => {
    const wrapper = await mountPage();

    const scopeButtons = wrapper.findAll('.news-rail .scope-item');
    await scopeButtons[1]!.trigger('click');
    await flushPromises();

    expect(changeScope).toHaveBeenCalledWith('TRADER');
  });

  it('พิมพ์ค้นหา -> ยังเรียก updateFilters (หลังพ้น debounce 250ms)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(
        { render: () => h(QLayout, () => [h(QPageContainer, () => [h(NewsPage)])]) },
        { attachTo: document.body },
      );
      await nextTick();

      await wrapper.find('.search-input input').setValue('nvda');
      expect(updateFilters, 'ยังไม่ควรยิงก่อนพ้น debounce').not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);

      expect(updateFilters).toHaveBeenCalledWith({ search: 'nvda' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('กดปักหมุดบนการ์ดข่าว -> ยังเรียก togglePin พร้อมตัวข่าว', async () => {
    const wrapper = await mountPage();

    const pinBtn = wrapper.find('.news-main .news-card [data-test="news-pin"]');
    expect(pinBtn.exists(), 'ปุ่มปักหมุดต้องยังอยู่บนการ์ด').toBe(true);

    await pinBtn.trigger('click');
    await flushPromises();

    expect(togglePin).toHaveBeenCalledTimes(1);
    expect(togglePin.mock.calls[0]![0]).toMatchObject({ id: 'n1' });
  });

  it('socket ยังถูกต่อผ่าน initialize() ตอน mount', async () => {
    await mountPage();

    // useNews().initialize() คือจุดที่ store.connectSocket() ถูกเรียก
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('กดสัญลักษณ์ในการ์ด most-mentioned -> ยังเด้งไปหน้าหุ้น', async () => {
    const wrapper = await mountPage();

    await wrapper.find('.news-rail .trending-row').trigger('click');

    expect(routerPush).toHaveBeenCalled();
  });
});

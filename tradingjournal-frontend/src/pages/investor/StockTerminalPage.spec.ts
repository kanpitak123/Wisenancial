/**
 * Stock Terminal — เปลือกหน้าที่เหลืออยู่หลังถอดแถบสำรวจซ้ายออก
 *
 * เดิมหน้านี้เป็นสองเสาและสวีทนี้คุมทั้งแถบซ้าย (ค้นหา/ฟิลเตอร์/ตาราง/ย่อ-ขยาย) กับ
 * แถบปุ่มสามโหมด ตอนนี้ของพวกนั้นย้ายที่กันหมดแล้ว:
 *   - ตัวสำรวจหุ้น -> StockExplorerRail.spec.ts (คุมค้นหา/ฟิลเตอร์/เรียง/คลิกแถว)
 *   - แท็บสามโหมด + ตารางหุ้นยอดนิยม -> StockAnalysisPage.spec.ts (การ์ดใต้กราฟ)
 *
 * เหลือให้หน้านี้รับผิดชอบแค่เรื่องเดียว: แปลง URL เป็นหุ้นที่จะแสดง
 *   - /stock/:symbol -> เปิดเทอร์มินัลของหุ้นตัวนั้น
 *   - /Stocks (ไม่มี symbol) -> หาหุ้นตั้งต้นมาให้เอง แล้ว replace URL
 *   - หาไม่ได้ -> empty state ที่กดลองใหม่ได้ ไม่ใช่จอค้าง
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const routeParams = ref<Record<string, string>>({});

vi.mock('src/services/stocks.service', () => ({
  stocksService: {
    list: (...args: unknown[]) => list(...args),
    getPopular: vi.fn().mockResolvedValue([]),
  },
  SECTOR_OPTIONS: ['Technology', 'Financials'],
  EXCHANGE_OPTIONS: ['NASDAQ', 'NYSE', 'SET'],
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ path: '/Stocks', params: routeParams.value, query: {}, meta: {} }),
}));

// เทอร์มินัลฝั่งขวาเป็นคอมโพเนนต์ใหญ่ที่ลากทั้ง apex/lightweight-charts และ service อีกสิบตัว
// สวีทนี้สนใจ "หน้าเลือกหุ้นตัวไหนมาแสดง" ไม่ใช่เนื้อในของมัน — ตัวมันมีสเปคของตัวเองแล้ว
vi.mock('./StockAnalysisPage.vue', () => ({
  default: {
    name: 'StockAnalysisPageStub',
    template: '<div data-test="analysis-stub" />',
  },
}));

const StockTerminalPage = (await import('./StockTerminalPage.vue')).default;

function listingRow(symbol: string) {
  return {
    symbol,
    name: `${symbol} Corporation`,
    exchange: 'NASDAQ',
    sector: 'Technology',
    price: 100,
    changePercent: 1.5,
    marketCap: 2_000_000_000_000,
    peRatio: 30,
    dividendYield: 0.5,
    volume: 1_000_000,
  };
}

async function mountPage(symbol?: string): Promise<VueWrapper> {
  routeParams.value = symbol ? { symbol } : {};

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(StockTerminalPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

describe('StockTerminalPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();
    list.mockResolvedValue({ rows: [listingRow('AAPL')], total: 1, page: 1, pageSize: 1 });
  });

  it('deep link /stock/:symbol -> เปิดเทอร์มินัลเลย ไม่ขึ้น empty state', async () => {
    const wrapper = await mountPage('NVDA');

    expect(wrapper.find('[data-test="analysis-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="terminal-empty"]').exists()).toBe(false);
  });

  it('มี symbol อยู่แล้ว -> ไม่ต้องไปหาหุ้นตั้งต้นมาให้ซ้ำ', async () => {
    await mountPage('NVDA');

    expect(list).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('เข้ามาแบบไม่มี symbol -> หาหุ้นตัวแรกมาให้แล้ว replace URL', async () => {
    await mountPage();

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 1 });
    expect(replace).toHaveBeenCalledWith('/stock/AAPL');
    // replace ไม่ใช่ push — ปุ่ม back ต้องไม่ย้อนกลับมาที่หน้าว่าง
    expect(push).not.toHaveBeenCalled();
  });

  it('สัญลักษณ์ตัวพิมพ์เล็กจาก listing -> normalize เป็นตัวใหญ่ก่อนพาไป', async () => {
    list.mockResolvedValue({ rows: [listingRow('msft')], total: 1, page: 1, pageSize: 1 });

    await mountPage();

    expect(replace).toHaveBeenCalledWith('/stock/MSFT');
  });

  it('listing ว่าง -> ขึ้น empty state ที่กดลองใหม่ได้ ไม่ใช่ค้างสปินเนอร์', async () => {
    list.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 1 });

    const wrapper = await mountPage();

    expect(replace).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="terminal-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="terminal-retry"]').exists()).toBe(true);
  });

  it('listing พัง -> ไม่โยน error ออกไป และยังขึ้น empty state ให้ลองใหม่', async () => {
    list.mockRejectedValue(new Error('500'));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="terminal-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="analysis-stub"]').exists()).toBe(false);
  });

  it('กดลองใหม่ -> ยิง listing ซ้ำอีกรอบ', async () => {
    list.mockRejectedValueOnce(new Error('500'));

    const wrapper = await mountPage();
    expect(wrapper.find('[data-test="terminal-retry"]').exists()).toBe(true);

    list.mockResolvedValue({ rows: [listingRow('TSLA')], total: 1, page: 1, pageSize: 1 });
    await wrapper.find('[data-test="terminal-retry"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(replace).toHaveBeenCalledWith('/stock/TSLA');
  });

  // ── ของที่ย้ายออกไปแล้ว ต้องไม่เหลือค้างในหน้านี้ ────────────────────────────
  it('ไม่มีแถบสำรวจซ้ายและปุ่มย่อ/ขยายเหลืออยู่', async () => {
    const wrapper = await mountPage('AAPL');

    expect(wrapper.find('[data-test="terminal-rail"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="rail-toggle"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="stock-explorer-rail"]').exists()).toBe(false);
  });

  it('แถบปุ่มสามโหมดไม่ได้อยู่ที่หน้านี้แล้ว (ย้ายไปการ์ดใต้กราฟ)', async () => {
    const wrapper = await mountPage('AAPL');

    expect(wrapper.find('[data-test="rail-mode-bar"]').exists()).toBe(false);
    expect(localStorage.getItem('wisenancial.stockTerminal.railCollapsed')).toBeNull();
  });

  it('เทอร์มินัลกินเต็มความกว้าง ไม่มีเสาซ้ายมาเบียด', async () => {
    const wrapper = await mountPage('AAPL');

    const page = wrapper.find('[data-test="stock-terminal-page"]');
    expect(page.element.children).toHaveLength(1);
    expect(wrapper.find('[data-test="terminal-body"]').exists()).toBe(true);
  });
});

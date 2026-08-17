/**
 * Stock Terminal — หน้าที่ยุบ /StockExplorer กับ /StockAnalysis เดิมเข้าด้วยกัน
 *
 * สองหน้าเดิมไม่เคยมีสเปคของตัวเอง สวีทนี้จึงเป็นตัวแรกที่ล็อกพฤติกรรมของทั้งคู่หลังรวม:
 *   - ความสามารถของ Explorer (ค้นหา / ฟิลเตอร์ตลาด-กลุ่ม / เรียงลำดับ / ตาราง) ต้องยังอยู่
 *   - คลิกแถวแล้วฝั่งขวาเปลี่ยนหุ้นผ่าน /stock/:symbol ซึ่งเป็น deep link หลัก
 *   - เข้าหน้าโดยไม่มี symbol ต้องไม่ค้างหน้าว่าง
 *   - ย่อ/ขยายแถบซ้ายได้และจำสถานะไว้
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QBtn, QLayout, QPageContainer, QTable } from 'quasar';
import { h, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockListing } from 'src/types/stocks.types';

const list = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const routeParams = ref<Record<string, string>>({});

vi.mock('src/services/stocks.service', () => ({
  stocksService: { list: (...args: unknown[]) => list(...args) },
  SECTOR_OPTIONS: ['Technology', 'Financials'],
  EXCHANGE_OPTIONS: ['NASDAQ', 'NYSE', 'SET'],
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ path: '/Stocks', params: routeParams.value, query: {}, meta: {} }),
}));

// เทอร์มินัลฝั่งขวาเป็นคอมโพเนนต์ใหญ่ที่ลากทั้ง apex/lightweight-charts และ service อีกสิบตัว
// สวีทนี้สนใจ "โครงหน้ารวม" ไม่ใช่เนื้อในของมัน — ตัวมันมีสเปคของตัวเองอยู่แล้ว
vi.mock('./StockAnalysisPage.vue', () => ({
  default: {
    name: 'StockAnalysisPageStub',
    emits: ['browse-all'],
    template: '<div data-test="analysis-stub"><button data-test="stub-browse-all" @click="$emit(\'browse-all\')" /></div>',
  },
}));

const StockTerminalPage = (await import('./StockTerminalPage.vue')).default;

function listing(symbol: string, overrides: Partial<StockListing> = {}): StockListing {
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
    ...overrides,
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

const railTable = (wrapper: VueWrapper) =>
  wrapper.findAllComponents(QTable).find((table) => table.attributes('data-test') === 'rail-table');

describe('StockTerminalPage — โครงหน้ารวม', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();
    list.mockResolvedValue({
      rows: [listing('AAPL'), listing('MSFT'), listing('NVDA')],
      total: 3,
      page: 1,
      pageSize: 20,
    });
  });

  it('แถบสำรวจหุ้นกับเทอร์มินัลอยู่หน้าเดียวกัน ไม่ต้องสลับหน้า', async () => {
    const wrapper = await mountPage('AAPL');

    expect(wrapper.find('[data-test="stock-explorer-rail"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="analysis-stub"]').exists()).toBe(true);
  });

  it('ความสามารถของ Explorer เดิมยังอยู่ครบ (ค้นหา/ตลาด/กลุ่ม/เรียงลำดับ/ตาราง)', async () => {
    const wrapper = await mountPage('AAPL');

    expect(wrapper.find('[data-test="rail-search"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rail-market-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rail-exchange"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rail-sector"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rail-sort"]').exists()).toBe(true);
    expect(railTable(wrapper)).toBeDefined();
  });

  it('ตารางแสดงหุ้นที่โหลดมาจริง', async () => {
    const wrapper = await mountPage('AAPL');

    expect(wrapper.text()).toContain('AAPL');
    expect(wrapper.text()).toContain('MSFT');
    expect(wrapper.text()).toContain('NVDA');
  });

  it('คลิกแถว -> ไปที่ /stock/:symbol (deep link หลัก) ไม่ใช่ route อื่น', async () => {
    const wrapper = await mountPage('AAPL');

    railTable(wrapper)!.vm.$emit('row-click', new Event('click'), listing('MSFT'), 1);
    await nextTick();

    expect(push).toHaveBeenCalledWith('/stock/MSFT');
  });

  it('คลิกหุ้นตัวที่เปิดอยู่แล้ว -> ไม่ยิง navigation ซ้ำ', async () => {
    const wrapper = await mountPage('AAPL');

    railTable(wrapper)!.vm.$emit('row-click', new Event('click'), listing('AAPL'), 0);
    await nextTick();

    expect(push).not.toHaveBeenCalled();
  });

  it('deep link /stock/:symbol -> เปิดเทอร์มินัลเลย ไม่ขึ้น empty state', async () => {
    const wrapper = await mountPage('NVDA');

    expect(wrapper.find('[data-test="analysis-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="terminal-empty"]').exists()).toBe(false);
  });

  it('เข้าหน้าโดยไม่มี symbol -> เลือกหุ้นตัวแรกในตารางให้เอง (replace ไม่ใช่ push)', async () => {
    await mountPage();

    expect(replace).toHaveBeenCalledWith('/stock/AAPL');
    expect(push).not.toHaveBeenCalled();
  });

  it('ไม่มี symbol และตารางว่าง -> ขึ้น empty state เชิญให้เลือก ไม่ใช่จอเปล่า', async () => {
    list.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 });

    const wrapper = await mountPage();

    expect(replace).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="terminal-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="analysis-stub"]').exists()).toBe(false);
  });

  it('ย่อ/ขยายแถบซ้ายได้ และจำสถานะไว้ข้ามการเปิดหน้า', async () => {
    const wrapper = await mountPage('AAPL');
    const rail = wrapper.find('[data-test="terminal-rail"]');

    expect(rail.classes()).not.toContain('terminal-rail--collapsed');

    await wrapper.find('[data-test="rail-toggle"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="terminal-rail"]').classes()).toContain(
      'terminal-rail--collapsed',
    );

    const reopened = await mountPage('AAPL');

    expect(reopened.find('[data-test="terminal-rail"]').classes()).toContain(
      'terminal-rail--collapsed',
    );
  });

  it('ย่อแถบแล้วตารางต้องไม่ถูกถอดทิ้ง (ขยายกลับไม่ต้องโหลดใหม่)', async () => {
    const wrapper = await mountPage('AAPL');

    expect(list).toHaveBeenCalledTimes(1);

    await wrapper.find('[data-test="rail-toggle"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-test="rail-toggle"]').trigger('click');
    await nextTick();

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('ปุ่ม "ดูทั้งหมด" ในเทอร์มินัล -> กางแถบซ้าย แทนการเปลี่ยนหน้าไป /StockExplorer เดิม', async () => {
    const wrapper = await mountPage('AAPL');

    await wrapper.find('[data-test="rail-toggle"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-test="terminal-rail"]').classes()).toContain(
      'terminal-rail--collapsed',
    );

    await wrapper.find('[data-test="stub-browse-all"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="terminal-rail"]').classes()).not.toContain(
      'terminal-rail--collapsed',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('มีปุ่มเปิดแถบสำรวจใน empty state ตอนที่แถบถูกย่ออยู่', async () => {
    list.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 });
    localStorage.setItem('wisenancial.stockTerminal.railCollapsed', '1');

    const wrapper = await mountPage();
    const empty = wrapper.find('[data-test="terminal-empty"]');

    expect(empty.exists()).toBe(true);
    expect(empty.findComponent(QBtn).exists()).toBe(true);
  });
});

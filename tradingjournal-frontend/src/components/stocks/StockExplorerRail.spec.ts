/**
 * แถบสำรวจหุ้น — เนื้อที่ย้ายมาจาก StockExplorerPage.vue เดิม
 *
 * ตัวหน้าเดิมไม่เคยมีสเปค สวีทนี้ล็อกสิ่งที่ห้ามหายไประหว่างยุบสองหน้า:
 * ทุกตัวกรองต้องแปลงเป็นพารามิเตอร์ที่ยิงถึง /stocks/listing จริง และการเปลี่ยนตัวกรอง
 * ต้องเด้งกลับหน้าแรกเสมอ ไม่งั้นจะค้างอยู่หน้า 5 ของผลลัพธ์ชุดเก่าแล้วเห็นตารางว่าง
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer, QSelect, QTable } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockListing } from 'src/types/stocks.types';

const list = vi.fn();

vi.mock('src/services/stocks.service', () => ({
  stocksService: { list: (...args: unknown[]) => list(...args) },
  SECTOR_OPTIONS: ['Technology', 'Financials'],
  EXCHANGE_OPTIONS: ['NASDAQ', 'NYSE', 'SET'],
}));

const StockExplorerRail = (await import('./StockExplorerRail.vue')).default;

function listing(symbol: string, overrides: Partial<StockListing> = {}): StockListing {
  return {
    symbol,
    name: `${symbol} Corporation`,
    exchange: 'NASDAQ',
    sector: 'Technology',
    price: 100,
    changePercent: -2.25,
    marketCap: 2_000_000_000_000,
    peRatio: 30,
    dividendYield: 0.5,
    volume: 1_000_000,
    ...overrides,
  };
}

async function mountRail(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const wrapper = mount(
    {
      render: () =>
        h(QLayout, () => [h(QPageContainer, () => [h(StockExplorerRail, props)])]),
    },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

const railComponent = (wrapper: VueWrapper) => wrapper.findComponent(StockExplorerRail);

const lastListArgs = () => list.mock.calls[list.mock.calls.length - 1]?.[0];

/**
 * QSelect ของ Quasar ไม่ส่ง attribute แปลกปลอมไปที่ element ราก (ยัดไว้ที่ control ข้างใน)
 * หา data-test ใน DOM ก่อนแล้วค่อยไล่หา component ที่ครอบมันอยู่
 */
const selectByTest = (wrapper: VueWrapper, test: string) => {
  const target = wrapper.find(`[data-test="${test}"]`);

  if (!target.exists()) return undefined;

  return wrapper
    .findAllComponents(QSelect)
    .find((item) => item.element.contains(target.element));
};

describe('StockExplorerRail', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();
    list.mockResolvedValue({
      rows: [listing('AAPL'), listing('MSFT')],
      total: 2,
      page: 1,
      pageSize: 20,
    });
  });

  it('โหลดรายการทันทีที่ mount ด้วยค่าเริ่มต้น (หุ้นโลก เรียงตามมูลค่าตลาด)', async () => {
    await mountRail();

    expect(list).toHaveBeenCalledTimes(1);
    expect(lastListArgs()).toMatchObject({
      market: 'GLOBAL',
      exchange: 'ALL',
      sector: 'ALL',
      sortBy: 'marketCap',
      sortDir: 'desc',
      page: 1,
    });
  });

  it('ยิง loaded พร้อมรายชื่อหุ้นครั้งแรกที่โหลดได้ (ให้หน้าแม่เลือกตัวตั้งต้น)', async () => {
    const wrapper = await mountRail();

    expect(railComponent(wrapper).emitted('loaded')?.[0]).toEqual([['AAPL', 'MSFT']]);
  });

  it('loaded ยิงครั้งเดียว ไม่ยิงซ้ำทุกครั้งที่เปลี่ยนตัวกรอง', async () => {
    const wrapper = await mountRail();

    selectByTest(wrapper, 'rail-sector')!.vm.$emit('update:modelValue', 'Technology');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(railComponent(wrapper).emitted('loaded')).toHaveLength(1);
  });

  it('คลิกแถว -> ยิง select พร้อมสัญลักษณ์', async () => {
    const wrapper = await mountRail();

    wrapper.findComponent(QTable).vm.$emit('row-click', new Event('click'), listing('MSFT'), 1);
    await nextTick();

    expect(railComponent(wrapper).emitted('select')?.[0]).toEqual(['MSFT']);
  });

  it('เปลี่ยนกลุ่มอุตสาหกรรม -> ยิงใหม่พร้อมกลุ่มนั้น และกลับไปหน้า 1', async () => {
    const wrapper = await mountRail();

    selectByTest(wrapper, 'rail-sector')!.vm.$emit('update:modelValue', 'Financials');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastListArgs()).toMatchObject({ sector: 'Financials', page: 1 });
  });

  it('เปลี่ยนการเรียงลำดับ -> ส่ง sortBy ที่เลือก (P/E ยังเรียงได้แม้ไม่มีคอลัมน์ในแถบแคบ)', async () => {
    const wrapper = await mountRail();

    selectByTest(wrapper, 'rail-sort')!.vm.$emit('update:modelValue', 'peRatio');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastListArgs()).toMatchObject({ sortBy: 'peRatio', page: 1 });
  });

  it('สลับไปหุ้นไทย -> ส่ง market TH และรีเซ็ตตัวกรองตลาดที่ใช้ไม่ได้', async () => {
    const wrapper = await mountRail();
    const rail = railComponent(wrapper);

    selectByTest(wrapper, 'rail-exchange')!.vm.$emit('update:modelValue', 'NYSE');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lastListArgs()).toMatchObject({ exchange: 'NYSE' });

    rail.findComponent({ name: 'QBtnToggle' }).vm.$emit('update:modelValue', 'TH');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastListArgs()).toMatchObject({ market: 'TH', exchange: 'ALL' });
    // โหมดหุ้นไทยล็อกที่ SET อยู่แล้ว ตัวกรองตลาดจึงต้องหายไป ไม่ใช่ค้างให้กดแล้วไม่มีผล
    expect(selectByTest(wrapper, 'rail-exchange')).toBeUndefined();
  });

  it('ไฮไลต์แถวของหุ้นที่กำลังเปิดอยู่', async () => {
    const wrapper = await mountRail({ selectedSymbol: 'msft' });

    const active = wrapper.findAll('.rail-symbol-cell--active');

    expect(active).toHaveLength(1);
    expect(active[0]!.text()).toContain('MSFT');
  });

  it('ไม่พบผลลัพธ์ -> ขึ้นข้อความบอก ไม่ใช่ตารางเปล่า', async () => {
    list.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 });

    const wrapper = await mountRail();

    expect(wrapper.find('.rail-empty').exists()).toBe(true);
  });

  it('โหลดพัง -> ไม่ล้างรายการเดิมทิ้ง และไม่โยน error ออกไปจากคอมโพเนนต์', async () => {
    const wrapper = await mountRail();

    list.mockRejectedValue(new Error('500'));

    selectByTest(wrapper, 'rail-sector')!.vm.$emit('update:modelValue', 'Technology');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.text()).toContain('AAPL');
  });

  it('ตัดนามสกุล .BK ออกจากสัญลักษณ์หุ้นไทยตอนแสดงผล', async () => {
    list.mockResolvedValue({
      rows: [listing('PTT.BK', { exchange: 'SET' })],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const wrapper = await mountRail();

    expect(wrapper.find('.rail-symbol').text()).toBe('PTT');
  });
});

/**
 * StockSymbolPicker — ช่องค้นหาหุ้นที่ถอดออกมาจากแถบค้นหาของ Stock Terminal
 *
 * จุดที่ต้องล็อกไว้: ต้องค้นได้ทั้ง "สัญลักษณ์" และ "ชื่อบริษัทเต็ม" เพราะเหตุผลที่
 * ยกมันออกมาเป็นคอมโพเนนต์กลางคือฟอร์ม DCA กับหน้าบันทึกซื้อหุ้นเดิมเป็นช่องพิมพ์
 * เปล่า ๆ ที่ต้องจำ ticker เอง
 */
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchStockCatalog, type StockCatalogItem } from 'src/composables/useStockCatalog';

// vi.mock ถูก hoist ขึ้นบนสุด — ตัวแปรปกติจะยังไม่ถูก init ตอน factory ทำงาน
// จึงต้องประกาศผ่าน vi.hoisted
const { CATALOG } = vi.hoisted(() => ({
  CATALOG: [
    { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  ] as StockCatalogItem[],
}));

vi.mock('boot/axios', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: CATALOG }) },
}));

const StockSymbolPicker = (await import('./StockSymbolPicker.vue')).default;

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('searchStockCatalog', () => {
  it('ค้นด้วยสัญลักษณ์ได้', () => {
    expect(searchStockCatalog(CATALOG, 'nv').map((i) => i.symbol)).toEqual(['NVDA']);
  });

  it('ค้นด้วยชื่อบริษัทเต็มได้ ไม่ใช่แค่ ticker', () => {
    expect(searchStockCatalog(CATALOG, 'micro').map((i) => i.symbol)).toEqual(['MSFT']);
    expect(searchStockCatalog(CATALOG, 'johnson').map((i) => i.symbol)).toEqual(['JNJ']);
  });

  it('ตัวที่ขึ้นต้นด้วยคำค้นมาก่อนตัวที่มีคำค้นอยู่กลางข้อความ', () => {
    const items: StockCatalogItem[] = [
      { symbol: 'ZAPP', name: 'Something Apple-ish' },
      { symbol: 'AAPL', name: 'Apple Inc.' },
    ];

    expect(searchStockCatalog(items, 'APP')[0]!.symbol).toBe('AAPL');
  });

  it('คำค้นว่าง -> ไม่คืนอะไรเลย (ไม่ใช่คืนทั้งรายการ)', () => {
    expect(searchStockCatalog(CATALOG, '   ')).toEqual([]);
  });
});

describe('StockSymbolPicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('พิมพ์แล้วขึ้นรายการแนะนำ และเลือกได้ -> ส่งค่าออกเป็นสัญลักษณ์', async () => {
    const wrapper = mount(StockSymbolPicker, {
      props: { modelValue: '' },
      attachTo: document.body,
    });

    await settle();

    await wrapper.find('input').setValue('micro');
    await settle();

    const options = wrapper.findAll('[data-test="symbol-picker-option"]');
    expect(options.length).toBe(1);
    expect(options[0]!.text()).toContain('Microsoft');

    await options[0]!.trigger('mousedown');
    await settle();

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted?.at(-1)).toEqual(['MSFT']);
    expect(wrapper.emitted('select')?.at(-1)?.[0]).toMatchObject({ symbol: 'MSFT' });
  });

  it('พิมพ์เองโดยไม่เลือกจากรายการ ก็ยังส่งค่าออก (เป็นตัวพิมพ์ใหญ่)', async () => {
    const wrapper = mount(StockSymbolPicker, {
      props: { modelValue: '' },
      attachTo: document.body,
    });

    await settle();

    await wrapper.find('input').setValue('tsla');
    await settle();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['TSLA']);
  });
});

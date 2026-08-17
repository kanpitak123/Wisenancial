import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortfolioStore } from 'stores/PortfolioStore';
import PortfolioPage from './PortfolioPage.vue';
import type { PortfolioQuota, PortfolioType } from 'src/types/portfolio.types';

// หน้านี้ไม่ได้เทส data-fetching — ตัด service ออกให้ mount ได้โดยไม่แตะ axios
vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(),
    getQuota: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

// useWorkspace ดึง router เข้ามา ซึ่งเทสนี้ไม่ได้ติดตั้ง
vi.mock('src/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    meta: { value: { label: 'Stock', icon: 'trending_up', color: 'teal-5' } },
  }),
}));

function quota(max: number, trader: number, investor: number): PortfolioQuota {
  const used = trader + investor;

  return {
    max,
    used,
    remaining: Math.max(0, max - used),
    byType: { TRADER: trader, INVESTOR: investor },
  };
}

/**
 * mount หน้าโดยกำหนดโควต้าไว้ล่วงหน้า
 *
 * q-page ต้องอยู่ใต้ q-layout > q-page-container ไม่งั้น Quasar จะไม่ render อะไรเลย
 * ("QPage needs to be a deep child of QLayout")
 */
async function mountPage(preset: PortfolioQuota | null) {
  const store = usePortfolioStore();

  store.hasLoadedAll = true;
  store.quota = preset;
  store.activeType = 'INVESTOR' as PortfolioType;

  // ใช้ render function ไม่ใช่ template string — vitest ใช้ Vue รุ่น runtime-only
  // ที่ compile template ตอนรันไม่ได้ และ q-* ก็ไม่ได้ถูก register แบบ global
  const wrapper = mount(
    {
      render: () => h(QLayout, () => [h(QPageContainer, () => [h(PortfolioPage)])]),
    },
    { attachTo: document.body },
  );

  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();

  return { wrapper, store };
}

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

describe('PortfolioPage — แถบโควต้า', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('โควต้าเหลือ -> โชว์ "ใช้ไป 2/3 พอร์ต" พร้อมแยกตามโหมด', async () => {
    const { wrapper } = await mountPage(quota(3, 1, 1));

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 2/3 พอร์ต');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 1');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Forex 1');
  });

  it('byType แสดงตัวเลขแยกโหมดถูกต้องเมื่อสัดส่วนไม่เท่ากัน', async () => {
    const { wrapper } = await mountPage(quota(5, 1, 3));

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 4/5 พอร์ต');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 3');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Forex 1');
  });

  it('โควต้าเหลือ -> ปุ่มสร้างพอร์ตกดได้ และไม่มีปุ่มอัปเกรด', async () => {
    const { wrapper } = await mountPage(quota(3, 1, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(false);
    expect(byTest(wrapper, 'quota-full-note').exists()).toBe(false);
  });

  it('โควต้าเต็ม -> ปุ่มสร้างพอร์ต disable', async () => {
    const { wrapper } = await mountPage(quota(3, 2, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
  });

  it('โควต้าเต็ม -> โชว์ปุ่มอัปเกรดและลิงก์ไป /Upgrade', async () => {
    const { wrapper } = await mountPage(quota(3, 3, 0));

    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(true);

    const note = byTest(wrapper, 'quota-full-note');

    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('ใช้โควต้าครบแล้ว');
    expect(note.html()).toContain('/Upgrade');
  });

  it('โควต้าเต็ม -> ปุ่มถูก disable จนกดเปิด dialog ไม่ได้', async () => {
    const { wrapper } = await mountPage(quota(2, 1, 1));

    const button = byTest(wrapper, 'create-portfolio-btn');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-disabled')).toBe('true');

    await button.trigger('click');
    await wrapper.vm.$nextTick();

    // dialog ของ Quasar render ผ่าน portal — เช็คว่าไม่มี dialog โผล่ใน document
    expect(document.body.querySelector('.q-dialog')).toBeNull();
  });

  it('ยังโหลดโควต้าไม่เสร็จ (quota = null) -> ไม่ disable ปุ่มไว้ก่อน', async () => {
    const { wrapper } = await mountPage(null);

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(false);
    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 0 พอร์ต');
  });

  it('สร้างพอร์ตสำเร็จ -> แถบโควต้าขยับทันทีและปุ่มถูก disable เมื่อเต็ม', async () => {
    const { wrapper, store } = await mountPage(quota(3, 1, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();

    // จำลองผลของ createPortfolio() ที่ขยับตัวเลขในเครื่องทันที
    store.applyQuotaDelta('INVESTOR', 1);
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 3/3 พอร์ต');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 2');
    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(true);
  });

  it('ลบพอร์ตแล้วโควต้าคืน -> ปุ่มกลับมากดได้', async () => {
    const { wrapper, store } = await mountPage(quota(2, 1, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();

    store.applyQuotaDelta('TRADER', -1);
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 1/2 พอร์ต');
    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(false);
  });
});

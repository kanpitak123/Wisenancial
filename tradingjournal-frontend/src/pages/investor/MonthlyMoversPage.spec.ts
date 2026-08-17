/**
 * เป้าหมาย: ผู้ใช้แพ็กฟรีต้องไม่เจอ "หน้าว่างเงียบๆ"
 *
 * /market-insights/movers ยัง gate ด้วย PaidTierGuard อยู่ (ตั้งใจ — ใช้ข้อมูลตลาดภายนอก)
 * ของเดิมส่ง error เข้า safeLoad ที่แค่เด้ง notify แล้วปล่อยตารางว่างไว้
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QBtn, QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MonthlyMoversPage from './MonthlyMoversPage.vue';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';

const getMonthlyMovers = vi.fn();

vi.mock('src/services/volatility.service', () => ({
  volatilityService: {
    getMonthlyMovers: (...args: unknown[]) => getMonthlyMovers(...args),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/MonthlyMovers', query: {}, meta: {} }),
}));

const mover = (symbol: string, changePercent: number) => ({
  symbol,
  name: `${symbol} Co.`,
  market: 'GLOBAL',
  monthChangePercent: changePercent,
  volatility: 30,
  avgDailyValue: 1_000_000,
  endPrice: 100,
});

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(MonthlyMoversPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

describe('MonthlyMoversPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('403 จาก PaidTierGuard -> ขึ้นการ์ดต้องอัปเกรด พร้อมลิงก์ไปหน้าแพ็กเกจ', async () => {
    getMonthlyMovers.mockRejectedValue(httpError(403));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="movers-upgrade"]').exists()).toBe(true);

    // ปุ่มต้องพาไปหน้าแพ็กเกจจริง (q-btn ผูก route ผ่าน prop `to` ไม่ใช่ href ตรงๆ)
    const cta = wrapper
      .findAllComponents(QBtn)
      .find((button) => button.attributes('data-test') === 'upgrade-notice-cta');

    expect(cta).toBeDefined();
    expect(cta?.props('to')).toBe(UPGRADE_ROUTE);
    // ตารางต้องไม่ render คู่กับการ์ด ไม่งั้นจะเห็นคอลัมน์ว่างสามช่องซ้อนอยู่
    expect(wrapper.find('.movers-grid').exists()).toBe(false);
  });

  it('402 ก็นับเป็นต้องอัปเกรดเหมือนกัน', async () => {
    getMonthlyMovers.mockRejectedValue(httpError(402));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="movers-upgrade"]').exists()).toBe(true);
  });

  it('โหลดสำเร็จ -> แสดงตาราง ไม่มีการ์ดอัปเกรด', async () => {
    getMonthlyMovers.mockResolvedValue({
      period: '2026-08',
      market: 'GLOBAL',
      gainers: [mover('NVDA', 12.5)],
      losers: [mover('INTC', -8.1)],
      mostVolatile: [mover('TSLA', 4.2)],
    });

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="movers-upgrade"]').exists()).toBe(false);
    expect(wrapper.find('.movers-grid').exists()).toBe(true);
    expect(wrapper.text()).toContain('NVDA');
    expect(wrapper.text()).toContain('INTC');
  });

  it('เป็นสมาชิกแล้วแต่ยังไม่มีข้อมูล -> ขึ้น empty state ไม่ใช่ว่างเปล่า', async () => {
    getMonthlyMovers.mockResolvedValue({
      period: '2026-08',
      market: 'GLOBAL',
      gainers: [],
      losers: [],
      mostVolatile: [],
    });

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="movers-upgrade"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test="movers-empty"]')).toHaveLength(3);
  });

  it('error อื่น (500) -> ไม่ขึ้นการ์ดอัปเกรด เพราะไม่ใช่เรื่องแพ็กเกจ', async () => {
    getMonthlyMovers.mockRejectedValue(httpError(500));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="movers-upgrade"]').exists()).toBe(false);
  });
});

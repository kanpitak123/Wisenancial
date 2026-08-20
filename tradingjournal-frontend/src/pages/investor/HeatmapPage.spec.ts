/**
 * เป้าหมายเดียวกับ MonthlyMoversPage.spec.ts — ผู้ใช้แพ็กฟรีต้องไม่เจอ "หน้าว่างเงียบๆ"
 *
 * /market-insights/heatmap อยู่บนคอนโทรลเลอร์เดียวกับ /market-insights/movers จึงติด
 * PaidTierGuard เหมือนกัน แพ็กฟรีจะได้ 403 กลับมาเสมอ
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QBtn, QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeatmapPage from './HeatmapPage.vue';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';

const getHeatmap = vi.fn();

vi.mock('src/services/heatmap.service', () => ({
  heatmapService: {
    getHeatmap: (...args: unknown[]) => getHeatmap(...args),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/Heatmap', query: {}, meta: {} }),
}));

const tile = (symbol: string, changePercent: number, weight = 10) => ({
  symbol,
  name: `${symbol} Inc.`,
  sector: 'Technology',
  changePercent,
  weight,
  tradedValue: 1_000_000,
});

const response = (sectors: unknown[]) => ({
  market: 'GLOBAL',
  asOf: '2026-08-20T03:00:00.000Z',
  sectors,
});

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(HeatmapPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

describe('HeatmapPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('403 จาก PaidTierGuard -> ขึ้นการ์ดต้องอัปเกรด พร้อมลิงก์ไปหน้าแพ็กเกจ', async () => {
    getHeatmap.mockRejectedValue(httpError(403));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="heatmap-upgrade"]').exists()).toBe(true);

    const cta = wrapper
      .findAllComponents(QBtn)
      .find((button) => button.attributes('data-test') === 'upgrade-notice-cta');

    expect(cta).toBeDefined();
    expect(cta?.props('to')).toBe(UPGRADE_ROUTE);
    // กริดต้องไม่ render คู่กับการ์ดอัปเกรด ไม่งั้นจะเห็นช่องว่างซ้อนอยู่ข้างล่าง
    expect(wrapper.find('[data-test="heatmap-grid"]').exists()).toBe(false);
  });

  it('402 ก็นับเป็นต้องอัปเกรดเหมือนกัน', async () => {
    getHeatmap.mockRejectedValue(httpError(402));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="heatmap-upgrade"]').exists()).toBe(true);
  });

  it('โหลดสำเร็จ -> วาดช่องหุ้นครบทุกตัวและไม่มีการ์ดอัปเกรด', async () => {
    getHeatmap.mockResolvedValue(
      response([
        {
          sector: 'Technology',
          avgChangePercent: 1.42,
          totalWeight: 20,
          tiles: [tile('NVDA', 3.1), tile('AAPL', -0.8)],
        },
      ]),
    );

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="heatmap-upgrade"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="heatmap-grid"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="heatmap-tile-NVDA"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="heatmap-tile-AAPL"]').exists()).toBe(true);
  });

  it('ช่องบวกเป็นเขียว ช่องลบเป็นแดง — สีคือตัวสื่อความหมายหลักของหน้านี้', async () => {
    getHeatmap.mockResolvedValue(
      response([
        {
          sector: 'Technology',
          avgChangePercent: 1.15,
          totalWeight: 20,
          tiles: [tile('NVDA', 3.1), tile('AAPL', -2.4)],
        },
      ]),
    );

    const wrapper = await mountPage();

    // 23,130,48 = เขียว / 193,0,21 = แดง (ค่าเดียวกับ --positive/--negative ของธีม)
    expect(wrapper.find('[data-test="heatmap-tile-NVDA"]').attributes('style')).toContain(
      'rgba(23, 130, 48',
    );
    expect(wrapper.find('[data-test="heatmap-tile-AAPL"]').attributes('style')).toContain(
      'rgba(193, 0, 21',
    );
  });

  it('หุ้นน้ำหนักมากได้ช่องกว้างกว่า (flex-grow ตามน้ำหนัก)', async () => {
    getHeatmap.mockResolvedValue(
      response([
        {
          sector: 'Technology',
          avgChangePercent: 1,
          totalWeight: 33,
          tiles: [tile('BIG', 1, 30), tile('SMALL', 1, 3)],
        },
      ]),
    );

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="heatmap-tile-BIG"]').attributes('style')).toContain(
      'flex-grow: 30',
    );
    expect(wrapper.find('[data-test="heatmap-tile-SMALL"]').attributes('style')).toContain(
      'flex-grow: 3',
    );
  });

  it('เป็นสมาชิกแล้วแต่ยังไม่มีข้อมูล -> ขึ้น empty state ไม่ใช่ว่างเปล่า', async () => {
    getHeatmap.mockResolvedValue(response([]));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="heatmap-upgrade"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="heatmap-empty"]').exists()).toBe(true);
  });

  it('error อื่น (500) -> ไม่ขึ้นการ์ดอัปเกรด เพราะไม่ใช่เรื่องแพ็กเกจ', async () => {
    getHeatmap.mockRejectedValue(httpError(500));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="heatmap-upgrade"]').exists()).toBe(false);
  });
});

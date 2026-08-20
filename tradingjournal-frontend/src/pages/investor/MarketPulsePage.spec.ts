/**
 * MarketPulsePage — หน้าที่ยุบ /Heatmap กับ /Discover เดิมมารวมกัน
 *
 * เทสทั้งหมดของสองหน้าเดิมยกมาไว้ที่นี่ครบ เพราะการรวมหน้าไม่ควรทำให้ข้อรับประกันเดิม
 * หายไป โดยเฉพาะสองข้อที่เป็นเหตุผลของการมีเทสตั้งแต่แรก:
 *   - แพ็กฟรีต้องไม่เจอ "หน้าว่างเงียบๆ" (heatmap/sentiment ติด PaidTierGuard → 403)
 *   - เปิดหน้าเฉยๆ ต้องไม่เสียเครดิต AI (ต้องกดปุ่มเองเท่านั้น)
 *
 * ที่เพิ่มเข้ามาใหม่: แถบอารมณ์ตลาดจาก /market-insights/sentiment และการแยกแท็บ
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QBtn, QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketPulsePage from './MarketPulsePage.vue';
import { useAuthStore } from 'stores/AuthStore';
import { useAiStore } from 'stores/AiStore';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';
import type * as AiServiceModule from 'src/services/ai.service';

const getHeatmap = vi.fn();
const getSentiment = vi.fn();
const getGrowthRecommendations = vi.fn();
const getModels = vi.fn();

vi.mock('src/services/heatmap.service', () => ({
  heatmapService: {
    getHeatmap: (...args: unknown[]) => getHeatmap(...args),
  },
}));

vi.mock('src/services/sentiment.service', () => ({
  sentimentService: {
    getSentiment: (...args: unknown[]) => getSentiment(...args),
  },
}));

// AiStore import getAiErrorMessage/isAiCreditError จากโมดูลนี้ด้วย ถ้า mock ทับทั้งโมดูล
// สองตัวนั้นจะกลายเป็น undefined แล้ว handleError จะพังเงียบๆ (error ไม่ถูกตั้ง) —
// จึงต้องคง export ตัวจริงไว้ แล้วสลับเฉพาะ aiService
vi.mock('src/services/ai.service', async (importOriginal) => ({
  ...(await importOriginal<typeof AiServiceModule>()),
  aiService: {
    getGrowthRecommendations: (...args: unknown[]) => getGrowthRecommendations(...args),
    getModels: (...args: unknown[]) => getModels(...args),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/Market', query: {}, meta: {} }),
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

const ratio = (symbol: string, longPercent: number) => ({
  symbol,
  name: `${symbol} Inc.`,
  longPercent,
  shortPercent: 100 - longPercent,
});

const sentimentResponse = (overrides: Record<string, unknown> = {}) => ({
  market: 'GLOBAL',
  asOf: '2026-08-20T03:00:00.000Z',
  overall: { longPercent: 68, shortPercent: 32 },
  longShortRatios: [ratio('NVDA', 74)],
  mostBought: [],
  mostSold: [],
  frequentSetups: [],
  regions: [],
  ...overrides,
});

const recommendation = (symbol: string) => ({
  symbol,
  name: `${symbol} Corp.`,
  sector: 'Technology',
  reasoning: {
    growth: 'รายได้โต 30% ต่อปี',
    profit: 'อัตรากำไรขั้นต้นสูง',
    customerBase: 'ลูกค้าองค์กรกระจายตัวดี',
    liquidity: 'สภาพคล่องซื้อขายสูง',
  },
  aiSummary: `${symbol} มีแนวโน้มเติบโตต่อเนื่อง`,
});

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

/** ตั้งยอดเครดิตผ่าน AuthStore เพราะ AiStore.credits อ่านจาก user.ai_token_balance */
function setCredits(balance: number) {
  useAuthStore().user = {
    id: 1,
    username: 'qa',
    email: 'qa@wisenancial.test',
    ai_token_balance: balance,
  } as unknown as ReturnType<typeof useAuthStore>['user'];
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(MarketPulsePage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

/** q-tab-panels render เฉพาะแท็บที่เปิดอยู่ — ของฝั่ง AI Picks ต้องสลับแท็บก่อนถึงจะมีใน DOM */
async function openPicksTab(wrapper: VueWrapper) {
  await wrapper.find('[data-test="market-tab-picks"]').trigger('click');
  await nextTick();
  await nextTick();
}

describe('MarketPulsePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    getModels.mockResolvedValue({ models: [{ id: 'groq', label: 'Groq' }], minBalance: 10 });
    getHeatmap.mockResolvedValue(response([]));
    getSentiment.mockResolvedValue(sentimentResponse());
  });

  // ── ของใหม่: แถบอารมณ์ตลาด + การแยกแท็บ ─────────────────────────────────
  describe('แถบอารมณ์ตลาด (ของใหม่)', () => {
    it('ยิง /market-insights/sentiment ตอนเปิดหน้า แล้ววาดสัดส่วน long/short จริง', async () => {
      const wrapper = await mountPage();

      expect(getSentiment).toHaveBeenCalledTimes(1);
      expect(getSentiment).toHaveBeenCalledWith({ market: 'GLOBAL' });

      const strip = wrapper.find('[data-test="market-sentiment"]');

      expect(strip.exists()).toBe(true);
      expect(strip.text()).toContain('68%');
      expect(strip.text()).toContain('32%');
      // ความกว้างของแถบต้องมาจากตัวเลขจริง ไม่ใช่ค่าคงที่
      expect(wrapper.find('[data-test="sentiment-overall-long"]').attributes('style')).toContain(
        'width: 68%',
      );
    });

    it('วาด long/short รายตัว โดยเรียงตัวที่เอียงแรงสุดขึ้นก่อน', async () => {
      getSentiment.mockResolvedValue(
        sentimentResponse({
          longShortRatios: [ratio('MID', 55), ratio('SKEW', 88), ratio('EVEN', 50)],
        }),
      );

      const wrapper = await mountPage();
      const symbols = wrapper
        .findAll('[data-test^="sentiment-ratio-"]')
        .map((node) => node.attributes('data-test'));

      expect(symbols).toEqual([
        'sentiment-ratio-SKEW',
        'sentiment-ratio-MID',
        'sentiment-ratio-EVEN',
      ]);
    });

    it('สลับตลาดแล้วโหลดทั้ง heatmap และ sentiment ใหม่ด้วยตลาดเดียวกัน', async () => {
      const wrapper = await mountPage();

      const thaiButton = wrapper
        .findAllComponents(QBtn)
        .find((button) => button.text().includes('ไทย') || button.text().includes('Thai'));

      expect(thaiButton).toBeDefined();

      await thaiButton?.trigger('click');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();

      expect(getHeatmap).toHaveBeenLastCalledWith({ market: 'TH' });
      expect(getSentiment).toHaveBeenLastCalledWith({ market: 'TH' });
    });

    it('sentiment ล่มตัวเดียว -> แถบหายไปแต่ heatmap ยังอยู่ ไม่ล้มทั้งหน้า', async () => {
      getSentiment.mockRejectedValue(httpError(500));
      getHeatmap.mockResolvedValue(
        response([
          { sector: 'Technology', avgChangePercent: 1, totalWeight: 10, tiles: [tile('NVDA', 1)] },
        ]),
      );

      const wrapper = await mountPage();

      expect(wrapper.find('[data-test="market-sentiment"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="heatmap-grid"]').exists()).toBe(true);
    });
  });

  describe('การแยกแท็บ', () => {
    it('เปิดมาอยู่แท็บ heatmap ก่อน — ของฝั่ง AI Picks ยังไม่ render', async () => {
      const wrapper = await mountPage();

      expect(wrapper.find('[data-test="heatmap-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="discover-generate"]').exists()).toBe(false);
    });

    it('สลับไปแท็บ AI Picks แล้วเจอปุ่มสแกน ส่วน heatmap หายไป', async () => {
      setCredits(100);

      const wrapper = await mountPage();

      await openPicksTab(wrapper);

      expect(wrapper.find('[data-test="discover-generate"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="heatmap-empty"]').exists()).toBe(false);
    });
  });

  // ── ยกมาจาก HeatmapPage.spec.ts ──────────────────────────────────────────
  describe('แผนที่ความร้อน', () => {
    it('403 จาก PaidTierGuard -> ขึ้นการ์ดต้องอัปเกรด พร้อมลิงก์ไปหน้าแพ็กเกจ', async () => {
      getHeatmap.mockRejectedValue(httpError(403));
      getSentiment.mockRejectedValue(httpError(403));

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

    it('แพ็กฟรี -> การ์ดอัปเกรดต้องมีใบเดียว ไม่โผล่ซ้ำที่แถบอารมณ์ตลาดด้วย', async () => {
      getHeatmap.mockRejectedValue(httpError(403));
      getSentiment.mockRejectedValue(httpError(403));

      const wrapper = await mountPage();

      expect(wrapper.findAll('[data-test="heatmap-upgrade"]')).toHaveLength(1);
      expect(wrapper.find('[data-test="market-sentiment"]').exists()).toBe(false);
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

    it('ช่องบวกเป็นเขียว ช่องลบเป็นแดง — สีคือตัวสื่อความหมายหลักของส่วนนี้', async () => {
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

  // ── ยกมาจาก DiscoverPage.spec.ts ─────────────────────────────────────────
  describe('หุ้นที่ AI คัด', () => {
    it('เปิดหน้าเฉยๆ ต้องไม่ยิง endpoint ที่คิดเครดิต', async () => {
      setCredits(100);

      const wrapper = await mountPage();

      await openPicksTab(wrapper);

      expect(getGrowthRecommendations).not.toHaveBeenCalled();
      expect(wrapper.find('[data-test="discover-empty"]').exists()).toBe(true);
    });

    it('แค่สลับแท็บก็ต้องไม่ยิง endpoint ที่คิดเครดิตเช่นกัน', async () => {
      setCredits(100);

      const wrapper = await mountPage();

      await openPicksTab(wrapper);
      await openPicksTab(wrapper);

      expect(getGrowthRecommendations).not.toHaveBeenCalled();
    });

    it('กดปุ่มแล้วจึงยิง และวาดการ์ดครบทุกตัว', async () => {
      setCredits(100);
      getGrowthRecommendations.mockResolvedValue({
        data: [recommendation('NVDA'), recommendation('MSFT')],
        model: 'groq',
        creditsCharged: 5,
        creditsRemaining: 95,
      });

      const wrapper = await mountPage();

      await openPicksTab(wrapper);
      await wrapper.find('[data-test="discover-generate"]').trigger('click');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();

      expect(getGrowthRecommendations).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-test="discover-grid"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="discover-card-NVDA"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="discover-card-MSFT"]').exists()).toBe(true);
    });

    it('การ์ดต้องแสดงเหตุผลครบทั้ง 4 หมวด ไม่ใช่แค่บทสรุป', async () => {
      setCredits(100);
      getGrowthRecommendations.mockResolvedValue({
        data: [recommendation('NVDA')],
        model: 'groq',
        creditsCharged: 5,
        creditsRemaining: 95,
      });

      const wrapper = await mountPage();

      await openPicksTab(wrapper);
      await wrapper.find('[data-test="discover-generate"]').trigger('click');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();

      const card = wrapper.find('[data-test="discover-card-NVDA"]');

      expect(card.text()).toContain('รายได้โต 30% ต่อปี');
      expect(card.text()).toContain('อัตรากำไรขั้นต้นสูง');
      expect(card.text()).toContain('ลูกค้าองค์กรกระจายตัวดี');
      expect(card.text()).toContain('สภาพคล่องซื้อขายสูง');
      expect(card.text()).toContain('NVDA มีแนวโน้มเติบโตต่อเนื่อง');
    });

    it('เครดิตไม่พอ -> ปุ่มกดไม่ได้ และบอกเหตุผลว่าทำไม', async () => {
      setCredits(2);

      const wrapper = await mountPage();

      await openPicksTab(wrapper);

      expect(wrapper.find('[data-test="discover-generate"]').attributes('disabled')).toBeDefined();

      const hint = wrapper.find('[data-test="discover-hint"]');

      expect(hint.exists()).toBe(true);
      expect(hint.text()).toContain('เครดิต AI ไม่พอ');
    });

    it('ยิงแล้วโดนปฏิเสธเพราะเครดิตไม่พอ -> ขึ้นทางลัดไปเติมเครดิต', async () => {
      setCredits(100);

      const wrapper = await mountPage();

      await openPicksTab(wrapper);

      // จำลองผลลัพธ์ที่ AiStore.handleError ตั้งไว้เมื่อ backend ตอบว่าเครดิตไม่พอ
      useAiStore().insufficientCredits = true;
      await nextTick();

      expect(wrapper.find('[data-test="discover-credits-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="discover-grid"]').exists()).toBe(false);
    });

    it('error อื่น -> ขึ้นสถานะ error พร้อมปุ่มลองใหม่ ไม่ใช่หน้าว่าง', async () => {
      setCredits(100);
      getGrowthRecommendations.mockRejectedValue(new Error('boom'));

      const wrapper = await mountPage();

      await openPicksTab(wrapper);
      await wrapper.find('[data-test="discover-generate"]').trigger('click');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();

      expect(wrapper.find('[data-test="discover-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="discover-retry"]').exists()).toBe(true);
    });

    it('แพ็กฟรีที่โดน 403 ฝั่ง heatmap ยังใช้แท็บ AI Picks ได้ตามปกติ', async () => {
      setCredits(100);
      getHeatmap.mockRejectedValue(httpError(403));
      getSentiment.mockRejectedValue(httpError(403));

      const wrapper = await mountPage();

      await openPicksTab(wrapper);

      expect(wrapper.find('[data-test="discover-generate"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="heatmap-upgrade"]').exists()).toBe(false);
    });
  });
});

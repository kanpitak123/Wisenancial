/**
 * เป้าหมายหลัก: เปิดหน้า Discover ต้องไม่เสียเครดิต AI
 *
 * ของเดิมใน TradingJournal เรียก getStockRecommendations() ใน onMounted() ทันที ซึ่ง
 * ที่นี่ /ai/recommendations/growth คิดเครดิตจริง — แปลว่าแค่กดเมนูผิดก็เสียเครดิตแล้ว
 * เทสข้อแรกล็อกไว้ว่าต้องกดปุ่มเองเท่านั้น
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoverPage from './DiscoverPage.vue';
import { useAuthStore } from 'stores/AuthStore';
import { useAiStore } from 'stores/AiStore';
import type * as AiServiceModule from 'src/services/ai.service';

const getGrowthRecommendations = vi.fn();
const getModels = vi.fn();

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
  useRoute: () => ({ path: '/Discover', query: {}, meta: {} }),
}));

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
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(DiscoverPage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

describe('DiscoverPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    getModels.mockResolvedValue({ models: [{ id: 'groq', label: 'Groq' }], minBalance: 10 });
  });

  it('เปิดหน้าเฉยๆ ต้องไม่ยิง endpoint ที่คิดเครดิต', async () => {
    setCredits(100);

    const wrapper = await mountPage();

    expect(getGrowthRecommendations).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="discover-empty"]').exists()).toBe(true);
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

    expect(wrapper.find('[data-test="discover-generate"]').attributes('disabled')).toBeDefined();

    const hint = wrapper.find('[data-test="discover-hint"]');

    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain('เครดิต AI ไม่พอ');
  });

  it('ยิงแล้วโดนปฏิเสธเพราะเครดิตไม่พอ -> ขึ้นทางลัดไปเติมเครดิต', async () => {
    setCredits(100);

    const wrapper = await mountPage();

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

    await wrapper.find('[data-test="discover-generate"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(wrapper.find('[data-test="discover-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="discover-retry"]').exists()).toBe(true);
  });
});

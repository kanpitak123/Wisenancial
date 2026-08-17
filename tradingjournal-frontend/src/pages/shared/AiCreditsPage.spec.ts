import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiStore } from 'stores/AiStore';
import { useAuthStore } from 'stores/AuthStore';
import { useBillingStore } from 'stores/BillingStore';
import AiCreditsPage from './AiCreditsPage.vue';
import type { CreditPackage } from 'src/types/billing.types';

const PACKAGES: CreditPackage[] = [
  { id: 'STARTER', name: 'Starter', priceThb: 99, tokens: 500 },
  { id: 'PRO', name: 'Pro', priceThb: 249, tokens: 1500, popular: true },
  { id: 'MAX', name: 'Max', priceThb: 499, tokens: 3500 },
];

const getPackages = vi.fn();
const checkoutCredits = vi.fn();
const getCredits = vi.fn();

vi.mock('src/services/billing.service', () => ({
  billingService: {
    getPackages: (...args: unknown[]) => getPackages(...args),
    checkoutCredits: (...args: unknown[]) => checkoutCredits(...args),
  },
  getBillingErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/payments.service', () => ({
  paymentsService: { checkoutSubscription: vi.fn() },
}));

vi.mock('src/services/ai.service', () => ({
  aiService: {
    getCredits: (...args: unknown[]) => getCredits(...args),
    getModels: vi.fn(),
  },
  getAiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const replace = vi.fn();
let query: Record<string, string> = {};

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useRoute: () => ({ path: '/AiCredits', query }),
}));

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

async function mountPage() {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(AiCreditsPage)])]) },
    { attachTo: document.body },
  );

  // รอ onMounted ที่เป็น async (fetchPackages + refreshCredits + handleCheckoutReturn)
  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();

  return wrapper;
}

describe('AiCreditsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    query = {};
    getPackages.mockResolvedValue(PACKAGES);
    getCredits.mockResolvedValue({ balance: 137, minBalance: 5 });

    // AiStore.credits อ่านยอดจาก session ของ AuthStore — ไม่มี user ยอดจะเป็น 0 เสมอ
    useAuthStore().user = {
      id: 1,
      email: 'demo@wisenancial.app',
      username: 'demo',
      ai_token_balance: 0,
    } as never;
  });

  it('mount ได้และแสดงหัวข้อหน้า', async () => {
    const wrapper = await mountPage();

    expect(wrapper.exists()).toBe(true);
    expect(byTest(wrapper, 'credits-title').text()).toContain('เติมเครดิต AI');
  });

  it('แสดงยอดเครดิตคงเหลือจาก AiStore', async () => {
    const wrapper = await mountPage();

    expect(byTest(wrapper, 'credit-balance').text()).toContain('137');
  });

  it('แสดงแพ็กเกจครบทุกใบพร้อมราคาและจำนวนเครดิต', async () => {
    const wrapper = await mountPage();

    expect(byTest(wrapper, 'packages-grid').exists()).toBe(true);

    for (const pkg of PACKAGES) {
      const card = byTest(wrapper, `package-${pkg.id}`);

      expect(card.exists()).toBe(true);
      expect(card.text()).toContain(pkg.name);
      expect(card.text()).toContain(pkg.priceThb.toLocaleString());
      expect(card.text()).toContain(pkg.tokens.toLocaleString());
    }
  });

  it('ใช้ priceThb/tokens ตาม API ปัจจุบัน ไม่ใช่ price/credits ของโปรเจกต์เก่า', async () => {
    const wrapper = await mountPage();

    const pro = byTest(wrapper, 'package-PRO');

    expect(pro.text()).toContain('249');
    expect(pro.text()).toContain('1,500');
  });

  it('แพ็กที่ popular ได้ป้ายกำกับ', async () => {
    const wrapper = await mountPage();

    expect(byTest(wrapper, 'package-PRO').classes()).toContain('package-card--popular');
    expect(byTest(wrapper, 'package-STARTER').classes()).not.toContain('package-card--popular');
  });

  it('กดซื้อ -> เรียก checkout ด้วย packageId ที่ถูกต้อง', async () => {
    checkoutCredits.mockResolvedValue({ url: 'https://checkout.example.com/s' });

    const billingStore = useBillingStore();
    const openCheckout = vi.spyOn(billingStore, 'openCheckout').mockImplementation(() => {});

    const wrapper = await mountPage();

    await byTest(wrapper, 'buy-PRO').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(checkoutCredits).toHaveBeenCalledWith('PRO');
    expect(openCheckout).toHaveBeenCalledWith('https://checkout.example.com/s');
  });

  it('ไม่มีแพ็กเกจ -> แสดง empty state แทนตารางเปล่า', async () => {
    getPackages.mockResolvedValue([]);

    const wrapper = await mountPage();

    expect(byTest(wrapper, 'credits-empty').exists()).toBe(true);
    expect(byTest(wrapper, 'packages-grid').exists()).toBe(false);
  });

  it('โหลดแพ็กเกจไม่สำเร็จ -> ไม่ทำให้หน้าพัง', async () => {
    getPackages.mockRejectedValue(new Error('offline'));

    const wrapper = await mountPage();

    expect(wrapper.exists()).toBe(true);
    expect(byTest(wrapper, 'credits-empty').exists()).toBe(true);
  });

  it('กลับมาจาก Stripe แบบ success -> รีเฟรชเครดิตและล้าง query', async () => {
    query = { success: 'true' };

    await mountPage();

    // เรียกครั้งแรกตอน onMounted และอีกครั้งจาก handleCreditCheckoutReturn
    expect(getCredits.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(replace).toHaveBeenCalledWith({ path: '/AiCredits', query: {} });
  });

  it('กลับมาจาก Stripe แบบ canceled -> ล้าง query โดยไม่รีเฟรชเครดิตซ้ำ', async () => {
    query = { canceled: 'true' };

    await mountPage();

    expect(getCredits.mock.calls.length).toBe(1);
    expect(replace).toHaveBeenCalledWith({ path: '/AiCredits', query: {} });
  });

  it('เข้าหน้าปกติ (ไม่มี query) -> ไม่เรียก router.replace', async () => {
    await mountPage();

    expect(replace).not.toHaveBeenCalled();
  });

  it('BillingStore เก็บแพ็กเกจที่โหลดมาไว้จริง', async () => {
    await mountPage();

    const billingStore = useBillingStore();

    expect(billingStore.packages).toHaveLength(3);
    expect(billingStore.popularPackage?.id).toBe('PRO');
  });

  it('AiStore ได้ balance จาก endpoint', async () => {
    await mountPage();

    expect(useAiStore().credits).toBe(137);
  });
});

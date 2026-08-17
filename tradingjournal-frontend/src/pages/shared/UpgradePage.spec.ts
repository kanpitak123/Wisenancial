import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVAILABLE_SUBSCRIPTION_TIERS,
  FREE_TIER_MAX_PORTFOLIOS,
  TIER_MAX_PORTFOLIOS,
  TIER_PRICE_THB,
} from 'src/constants/billing.constants';
import { useBillingStore } from 'stores/BillingStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useUserStore } from 'stores/UserStore';
import UpgradePage from './UpgradePage.vue';
import type { SubscriptionTier } from 'src/types/billing.types';

const checkoutSubscription = vi.fn();
const getMe = vi.fn();
const getQuota = vi.fn();

vi.mock('src/services/payments.service', () => ({
  paymentsService: {
    checkoutSubscription: (...args: unknown[]) => checkoutSubscription(...args),
  },
}));

vi.mock('src/services/billing.service', () => ({
  billingService: { getPackages: vi.fn(), checkoutCredits: vi.fn() },
  getBillingErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/user.service', () => ({
  userService: {
    getMe: (...args: unknown[]) => getMe(...args),
    update: vi.fn(),
  },
  getUserErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(),
    getQuota: (...args: unknown[]) => getQuota(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const replace = vi.fn();
let query: Record<string, string> = {};

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useRoute: () => ({ path: '/Upgrade', query }),
}));

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

function profile(tier: SubscriptionTier | null) {
  return {
    id: 1,
    username: 'demo',
    full_name: 'Demo User',
    email: 'demo@wisenancial.app',
    role: 'USER',
    avatar_url: null,
    bio: null,
    subscription_tier: tier,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    points_balance: 0,
    ai_token_balance: 0,
    current_streak: 0,
    longest_streak: 0,
  };
}

async function mountPage(tier: SubscriptionTier | null, used = 1) {
  getMe.mockResolvedValue(profile(tier));

  const max = tier ? TIER_MAX_PORTFOLIOS[tier] : FREE_TIER_MAX_PORTFOLIOS;

  getQuota.mockResolvedValue({
    max,
    used,
    remaining: Math.max(0, max - used),
    byType: { TRADER: used, INVESTOR: 0 },
  });

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(UpgradePage)])]) },
    { attachTo: document.body },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();

  return wrapper;
}

describe('UpgradePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    query = {};
  });

  it('mount ได้และแสดงหัวข้อหน้า', async () => {
    const wrapper = await mountPage('PACK_279');

    expect(wrapper.exists()).toBe(true);
    expect(byTest(wrapper, 'upgrade-title').text()).toContain('เลือกแพ็กเกจ');
  });

  it('แสดง tier ปัจจุบันของผู้ใช้', async () => {
    const wrapper = await mountPage('PACK_279');

    expect(byTest(wrapper, 'current-tier').text()).toContain('PACK_279');
    expect(byTest(wrapper, 'current-tier').text()).toContain('Pro');
  });

  it('ผู้ใช้ free -> แสดงว่าเป็นแพ็กเกจฟรีพร้อมคำอธิบายโควต้า', async () => {
    const wrapper = await mountPage(null, 1);

    expect(byTest(wrapper, 'current-tier').text()).toContain('ฟรี');
    expect(byTest(wrapper, 'free-note').exists()).toBe(true);
    expect(byTest(wrapper, 'free-note').text()).toContain(String(FREE_TIER_MAX_PORTFOLIOS));
  });

  it('แสดงโควต้าที่ใช้อยู่เทียบเพดานของ tier ปัจจุบัน', async () => {
    const wrapper = await mountPage('PACK_399', 3);

    expect(byTest(wrapper, 'current-quota').text()).toContain('3');
    expect(byTest(wrapper, 'current-quota').text()).toContain(String(TIER_MAX_PORTFOLIOS.PACK_399));
  });

  it('แสดงเฉพาะแพ็กที่ยังเปิดขาย (ไม่มี PACK_159 ที่เป็น legacy)', async () => {
    const wrapper = await mountPage('PACK_279');

    for (const tier of AVAILABLE_SUBSCRIPTION_TIERS) {
      expect(byTest(wrapper, `plan-${tier}`).exists()).toBe(true);
    }

    expect(byTest(wrapper, 'plan-PACK_159').exists()).toBe(false);
  });

  it('โควต้าของแต่ละแพ็กดึงจาก TIER_MAX_PORTFOLIOS ไม่ hardcode', async () => {
    const wrapper = await mountPage('PACK_219');

    for (const tier of AVAILABLE_SUBSCRIPTION_TIERS) {
      const quotaText = byTest(wrapper, `quota-${tier}`).text();

      expect(quotaText).toContain(`สูงสุด ${TIER_MAX_PORTFOLIOS[tier]} พอร์ต`);
    }
  });

  it('ตารางเปรียบเทียบมีแถวฟรีและทุกแพ็ก พร้อมราคาตรงกับ constant', async () => {
    const wrapper = await mountPage('PACK_279');

    const table = byTest(wrapper, 'compare-table');

    expect(table.exists()).toBe(true);
    expect(byTest(wrapper, 'compare-row-FREE').text()).toContain(String(FREE_TIER_MAX_PORTFOLIOS));

    for (const tier of AVAILABLE_SUBSCRIPTION_TIERS) {
      const row = byTest(wrapper, `compare-row-${tier}`);

      expect(row.text()).toContain(TIER_PRICE_THB[tier].toLocaleString());
      expect(row.text()).toContain(String(TIER_MAX_PORTFOLIOS[tier]));
    }
  });

  it('แถวของแพ็กปัจจุบันถูกไฮไลต์ในตาราง', async () => {
    const wrapper = await mountPage('PACK_279');

    expect(byTest(wrapper, 'compare-row-PACK_279').classes()).toContain('is-current');
    expect(byTest(wrapper, 'compare-row-PACK_399').classes()).not.toContain('is-current');
  });

  it('แพ็กปัจจุบัน -> ปุ่ม disable และเขียนว่าแพ็กเกจปัจจุบัน', async () => {
    const wrapper = await mountPage('PACK_279');

    const cta = byTest(wrapper, 'cta-PACK_279');

    expect(cta.text()).toContain('แพ็กเกจปัจจุบัน');
    expect(cta.attributes('disabled')).toBeDefined();
  });

  it('แพ็กที่สูงกว่า -> ปุ่มเขียนว่าอัปเกรดและกดได้', async () => {
    const wrapper = await mountPage('PACK_219');

    const cta = byTest(wrapper, 'cta-PACK_399');

    expect(cta.text()).toContain('อัปเกรด');
    expect(cta.attributes('disabled')).toBeUndefined();
  });

  it('แพ็กที่ต่ำกว่า -> ปุ่มเขียนว่าเปลี่ยนเป็นแพ็กนี้', async () => {
    const wrapper = await mountPage('PACK_399');

    expect(byTest(wrapper, 'cta-PACK_219').text()).toContain('เปลี่ยนเป็นแพ็กนี้');
  });

  it('กดอัปเกรด -> เรียก checkout ด้วย planId ที่ถูกต้อง', async () => {
    checkoutSubscription.mockResolvedValue({ url: 'https://checkout.example.com/sub' });

    const billingStore = useBillingStore();
    const openCheckout = vi.spyOn(billingStore, 'openCheckout').mockImplementation(() => {});

    const wrapper = await mountPage('PACK_219');

    await byTest(wrapper, 'cta-PACK_399').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(checkoutSubscription).toHaveBeenCalledWith('PACK_399');
    expect(openCheckout).toHaveBeenCalledWith('https://checkout.example.com/sub');
  });

  it('กดแพ็กปัจจุบัน -> ไม่ยิง checkout', async () => {
    const wrapper = await mountPage('PACK_279');

    await byTest(wrapper, 'cta-PACK_279').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(checkoutSubscription).not.toHaveBeenCalled();
  });

  it('กลับมาจาก Stripe แบบ success -> โหลดโปรไฟล์และโควต้าใหม่ แล้วล้าง query', async () => {
    query = { success: 'true' };

    await mountPage('PACK_399');

    expect(getMe.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getQuota.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(replace).toHaveBeenCalledWith({ path: '/Upgrade', query: {} });
  });

  it('กลับมาจาก Stripe แบบ canceled -> ล้าง query โดยไม่โหลดโปรไฟล์ซ้ำ', async () => {
    query = { canceled: 'true' };

    await mountPage('PACK_279');

    expect(getMe.mock.calls.length).toBe(1);
    expect(replace).toHaveBeenCalledWith({ path: '/Upgrade', query: {} });
  });

  it('เข้าหน้าปกติ -> ไม่เรียก router.replace', async () => {
    await mountPage('PACK_279');

    expect(replace).not.toHaveBeenCalled();
  });

  it('store ได้ค่าที่ถูกต้องหลัง mount', async () => {
    await mountPage('PACK_279', 2);

    expect(useUserStore().profile?.subscription_tier).toBe('PACK_279');
    expect(usePortfolioStore().quotaUsed).toBe(2);
    expect(usePortfolioStore().quotaMax).toBe(TIER_MAX_PORTFOLIOS.PACK_279);
  });
});

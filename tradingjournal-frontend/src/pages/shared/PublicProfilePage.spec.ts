/**
 * PublicProfilePage — สามสถานะก่อนถึงเนื้อหาต้องแยกจากกันให้ชัด
 *
 * 404 (พิมพ์ชื่อผิด) กับ 403 (เจ้าตัวปิดไว้) ยุบรวมเป็น error ก้อนเดียวเมื่อไหร่
 * ผู้ใช้จะแยกไม่ออกว่าควรแก้ตัวสะกด หรือควรเลิกพยายาม
 *
 * อีกจุดที่พังเงียบได้: เจ้าของเปิดโปรไฟล์ตัวเองตอนยังตั้งเป็นส่วนตัวต้องเข้าได้
 * ไม่งั้นจะไปกดสวิตช์เปิดสาธารณะไม่ได้เลย (หลังบ้านปล่อยผ่านให้แล้ว หน้าต้องรับไม้ต่อ)
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicProfilePage from './PublicProfilePage.vue';
import type * as UserServiceModule from 'src/services/user.service';

const getPublicProfile = vi.fn();
const updateMe = vi.fn();

vi.mock('src/services/user.service', async (importOriginal) => ({
  ...(await importOriginal<typeof UserServiceModule>()),
  userService: {
    getPublicProfile: (...args: unknown[]) => getPublicProfile(...args),
    updateMe: (...args: unknown[]) => updateMe(...args),
    getMe: vi.fn().mockResolvedValue({ id: 1, username: 'trader01' }),
    removeAvatar: vi.fn(),
  },
}));

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/profile/trader01', params: { username: 'trader01' }, meta: {} }),
}));

const profile = (over: Record<string, unknown> = {}) => ({
  username: 'trader01',
  full_name: 'Trader One',
  avatar_url: null,
  bio: 'สาย DCA ระยะยาว',
  subscription_tier: 'PACK_279',
  is_public_profile: true,
  is_owner: false,
  current_streak: 4,
  member_since: '2026-01-01T00:00:00.000Z',
  held_stocks: ['AAPL', 'NVDA'],
  total_asset_value: 1500.5,
  total_pnl: 200,
  portfolio_count: 2,
  ...over,
});

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(PublicProfilePage)])]) },
    { attachTo: document.body },
  );

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return wrapper;
}

describe('PublicProfilePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('404 -> บอกว่าไม่พบผู้ใช้ ไม่ใช่บอกว่าเป็นส่วนตัว', async () => {
    getPublicProfile.mockRejectedValue(httpError(404));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="profile-not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-private"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="profile-hero"]').exists()).toBe(false);
  });

  it('403 -> บอกว่าเป็นส่วนตัว ไม่ใช่บอกว่าไม่มีคนนี้', async () => {
    getPublicProfile.mockRejectedValue(httpError(403));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="profile-private"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-not-found"]').exists()).toBe(false);
  });

  it('500 -> สถานะ error พร้อมปุ่มลองใหม่ ไม่ใช่ 404/403', async () => {
    getPublicProfile.mockRejectedValue(httpError(500));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="profile-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-not-found"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="profile-private"]').exists()).toBe(false);
  });

  it('โหลดสำเร็จ -> แสดงสถิติและหุ้นที่ถืออยู่', async () => {
    getPublicProfile.mockResolvedValue(profile());

    const wrapper = await mountPage();

    expect(getPublicProfile).toHaveBeenCalledWith('trader01');
    expect(wrapper.find('[data-test="profile-hero"]').text()).toContain('Trader One');
    expect(wrapper.find('[data-test="profile-stat-assets"]').text()).toContain('1,500.50');
    expect(wrapper.find('[data-test="profile-stat-pnl"]').text()).toContain('+$200.00');
    expect(wrapper.find('[data-test="profile-stat-portfolios"]').text()).toContain('2');
    expect(wrapper.find('[data-test="profile-holding-NVDA"]').exists()).toBe(true);
  });

  it('กำไรติดลบแสดงเครื่องหมายลบครั้งเดียว ไม่ใช่ -$-100', async () => {
    getPublicProfile.mockResolvedValue(profile({ total_pnl: -100 }));

    const wrapper = await mountPage();

    const pnl = wrapper.find('[data-test="profile-stat-pnl"]').text();

    expect(pnl).toContain('-$100.00');
    expect(pnl).not.toContain('$-100');
  });

  it('กดหุ้นที่ถืออยู่ -> ไปหน้าวิเคราะห์หุ้นตัวนั้น', async () => {
    getPublicProfile.mockResolvedValue(profile());

    const wrapper = await mountPage();

    await wrapper.find('[data-test="profile-holding-NVDA"]').trigger('click');

    expect(push).toHaveBeenCalledWith('/stock/NVDA');
  });

  it('ไม่มีหุ้นถืออยู่ -> ขึ้นข้อความบอก ไม่ใช่ช่องว่าง', async () => {
    getPublicProfile.mockResolvedValue(profile({ held_stocks: [] }));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="profile-holdings-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-holdings"]').exists()).toBe(false);
  });

  it('คนอื่นดู -> ไม่เห็นแบนเนอร์เจ้าของและการ์ดตั้งค่าความเป็นส่วนตัว', async () => {
    getPublicProfile.mockResolvedValue(profile({ is_owner: false }));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="profile-owner-banner"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="profile-privacy"]').exists()).toBe(false);
  });

  it('เจ้าของดูโปรไฟล์ตัวเองตอนตั้งเป็นส่วนตัว -> เข้าได้ และมีสวิตช์ให้เปิดสาธารณะ', async () => {
    getPublicProfile.mockResolvedValue(profile({ is_owner: true, is_public_profile: false }));

    const wrapper = await mountPage();

    expect(wrapper.find('[data-test="profile-private"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="profile-owner-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-privacy-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="profile-visibility"]').text()).toContain('ส่วนตัว');
  });

  it('กดสวิตช์ -> ยิง PATCH /users/me ด้วยค่าใหม่', async () => {
    getPublicProfile.mockResolvedValue(profile({ is_owner: true, is_public_profile: false }));
    updateMe.mockResolvedValue({ message: 'ok', user: {} });

    const wrapper = await mountPage();

    await wrapper.find('[data-test="profile-privacy-toggle"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(updateMe).toHaveBeenCalledWith({ is_public_profile: true });
  });
});

/**
 * หน้าลืมรหัสผ่าน / ตั้งรหัสใหม่ / ยืนยันอีเมล
 *
 * จุดที่ต้องล็อกไว้:
 *   - ลืมรหัสผ่านแสดงข้อความเดียวกันหลังส่ง (ไม่บอกว่าอีเมลนั้นมีบัญชีหรือไม่)
 *   - token ในลิงก์ถูกอ่านแล้วลบออกจาก URL ทันที
 *   - ตั้งรหัสใหม่กดไม่ได้จนกว่ารหัสผ่านตรงกฎ + ยืนยันตรงกัน, ส่ง token+รหัสใหม่ไปหลังบ้านตามเดิม
 *   - ลิงก์เสีย/หมดอายุ -> แสดงข้อความจากหลังบ้านพร้อมทางขอลิงก์ใหม่
 *   - ยืนยันอีเมลยิงเองตอนเปิดหน้า และโหลดโปรไฟล์ใหม่ถ้าล็อกอินอยู่
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage.vue';
import ResetPasswordPage from './ResetPasswordPage.vue';
import VerifyEmailPage from './VerifyEmailPage.vue';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';
import { useUserStore } from 'stores/UserStore';

const replace = vi.fn();
let query: Record<string, unknown> = {};

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useRoute: () => ({ path: '/ResetPassword', params: {}, meta: {}, query }),
}));

const RouterLinkStub = defineComponent({
  props: { to: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.());
  },
});

async function mountPage(page: object): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(page)])]) },
    { attachTo: document.body, global: { stubs: { 'router-link': RouterLinkStub } } },
  );

  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
  localStorage.clear();
  vi.clearAllMocks();
  query = {};
  useLanguageStore().setLanguage('en');
});

describe('ForgotPasswordPage', () => {
  it('ส่งอีเมลที่กรอก (ตัดช่องว่าง) แล้วแสดงข้อความยืนยันแบบไม่ยืนยันว่ามีบัญชี', async () => {
    const forgot = vi.spyOn(useAuthStore(), 'forgotPassword').mockResolvedValue({ message: 'x' });
    const wrapper = await mountPage(ForgotPasswordPage);

    await wrapper.find('input[data-test="forgot-email"]').setValue('  alice@example.com ');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(forgot).toHaveBeenCalledWith('alice@example.com');

    const sent = wrapper.find('[data-test="forgot-sent"]');
    expect(sent.exists()).toBe(true);
    expect(sent.text()).toContain('If an account exists');
    expect(sent.text()).not.toContain('alice@example.com');
  });

  it('ปุ่มส่งกดไม่ได้ตอนยังไม่กรอกอีเมล', async () => {
    const wrapper = await mountPage(ForgotPasswordPage);

    expect(wrapper.find('[data-test="forgot-submit"]').attributes('disabled')).toBeDefined();
  });

  it('เพดานคำขอ/เน็ตพัง -> แสดงข้อความผิดพลาด ไม่ขึ้นหน้าสำเร็จ', async () => {
    vi.spyOn(useAuthStore(), 'forgotPassword').mockRejectedValue(new Error('Too Many Requests'));
    const wrapper = await mountPage(ForgotPasswordPage);

    await wrapper.find('input[data-test="forgot-email"]').setValue('a@b.co');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-test="forgot-error"]').text()).toContain('Too Many Requests');
    expect(wrapper.find('[data-test="forgot-sent"]').exists()).toBe(false);
  });
});

describe('ResetPasswordPage', () => {
  const fill = async (wrapper: VueWrapper, password: string, confirm = password) => {
    await wrapper.find('input[data-test="reset-password"]').setValue(password);
    await wrapper.find('input[data-test="reset-confirm"]').setValue(confirm);
  };

  it('อ่าน token จาก query แล้วลบออกจาก URL ทันที', async () => {
    query = { token: 'T'.repeat(43) };

    await mountPage(ResetPasswordPage);

    expect(replace).toHaveBeenCalledWith({ path: '/ResetPassword', query: {} });
  });

  it('ไม่มี token -> บอกว่าลิงก์ไม่ถูกต้อง พร้อมทางขอลิงก์ใหม่ และไม่มีฟอร์ม', async () => {
    const wrapper = await mountPage(ResetPasswordPage);

    expect(wrapper.find('[data-test="reset-no-token"]').exists()).toBe(true);
    expect(wrapper.find('input[data-test="reset-password"]').exists()).toBe(false);
  });

  it('ปุ่มกดไม่ได้จนกว่ารหัสผ่านตรงกฎและยืนยันตรงกัน', async () => {
    query = { token: 'T'.repeat(43) };
    const wrapper = await mountPage(ResetPasswordPage);
    const disabled = () => wrapper.find('[data-test="reset-submit"]').attributes('disabled') !== undefined;

    expect(disabled()).toBe(true);

    await fill(wrapper, 'short1');
    expect(disabled()).toBe(true);

    await fill(wrapper, 'onlyletters');
    expect(disabled()).toBe(true);

    await fill(wrapper, 'NewPass123', 'NewPass124');
    expect(disabled()).toBe(true);

    await fill(wrapper, 'NewPass123');
    expect(disabled()).toBe(false);
  });

  it('ส่ง token + รหัสใหม่ -> แสดงหน้าสำเร็จ และล้าง token/รหัสจากหน่วยความจำ', async () => {
    query = { token: 'T'.repeat(43) };
    const reset = vi
      .spyOn(useAuthStore(), 'resetPassword')
      .mockResolvedValue({ message: 'ok', sessions_revoked: 2 });
    const wrapper = await mountPage(ResetPasswordPage);

    await fill(wrapper, 'NewPass123');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(reset).toHaveBeenCalledWith('T'.repeat(43), 'NewPass123');
    expect(wrapper.find('[data-test="reset-done"]').exists()).toBe(true);
    expect(wrapper.find('input[data-test="reset-password"]').exists()).toBe(false);
  });

  it('ลิงก์หมดอายุ/ใช้แล้ว (400) -> แสดงข้อความจากหลังบ้านและลิงก์ขอใหม่ ไม่ขึ้นสำเร็จ', async () => {
    query = { token: 'T'.repeat(43) };
    vi.spyOn(useAuthStore(), 'resetPassword').mockRejectedValue(
      new Error('ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่'),
    );
    const wrapper = await mountPage(ResetPasswordPage);

    await fill(wrapper, 'NewPass123');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-test="reset-error"]').text()).toContain('หมดอายุแล้ว');
    expect(wrapper.find('[data-test="reset-request-new"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="reset-done"]').exists()).toBe(false);
  });
});

describe('AuthStore.resetPassword', () => {
  it('สำเร็จแล้วล้าง session ของเครื่องนี้ (หลังบ้านไล่ทุกเครื่องออกแล้ว)', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'old';
    auth.user = { id: 1 } as never;
    localStorage.setItem('access_token', 'old');

    const { authApi } = await import('src/services/auth.api');
    vi.spyOn(authApi, 'resetPassword').mockResolvedValue({ message: 'ok', sessions_revoked: 1 });

    await auth.resetPassword('t', 'NewPass123');

    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('ล้มเหลวแล้วไม่แตะ session', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'keep';
    auth.user = { id: 1 } as never;

    const { authApi } = await import('src/services/auth.api');
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(new Error('bad link'));

    await expect(auth.resetPassword('t', 'NewPass123')).rejects.toThrow('bad link');

    expect(auth.accessToken).toBe('keep');
    expect(auth.error).toBe('bad link');
  });
});

describe('VerifyEmailPage', () => {
  it('ยิงยืนยันเองตอนเปิดหน้า แล้วลบ token ออกจาก URL', async () => {
    query = { token: 'V'.repeat(43) };
    const verify = vi.spyOn(useAuthStore(), 'verifyEmail').mockResolvedValue({ message: 'ok' });

    const wrapper = await mountPage(VerifyEmailPage);

    expect(verify).toHaveBeenCalledWith('V'.repeat(43));
    expect(replace).toHaveBeenCalledWith({ path: '/ResetPassword', query: {} });
    expect(wrapper.find('[data-test="verify-success"]').exists()).toBe(true);
  });

  it('ล็อกอินอยู่ในเครื่องนี้ -> โหลดโปรไฟล์ใหม่ให้แบนเนอร์หาย', async () => {
    query = { token: 'V'.repeat(43) };
    const auth = useAuthStore();
    auth.accessToken = 'jwt';
    auth.user = { id: 1 } as never;
    vi.spyOn(auth, 'verifyEmail').mockResolvedValue({ message: 'ok' });
    const fetchProfile = vi.spyOn(useUserStore(), 'fetchProfile').mockResolvedValue({} as never);

    await mountPage(VerifyEmailPage);

    expect(fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('ไม่ได้ล็อกอิน -> ไม่โหลดโปรไฟล์', async () => {
    query = { token: 'V'.repeat(43) };
    vi.spyOn(useAuthStore(), 'verifyEmail').mockResolvedValue({ message: 'ok' });
    const fetchProfile = vi.spyOn(useUserStore(), 'fetchProfile').mockResolvedValue({} as never);

    await mountPage(VerifyEmailPage);

    expect(fetchProfile).not.toHaveBeenCalled();
  });

  it('ลิงก์หมดอายุ/ใช้แล้ว -> แสดงข้อความจากหลังบ้าน', async () => {
    query = { token: 'V'.repeat(43) };
    vi.spyOn(useAuthStore(), 'verifyEmail').mockRejectedValue(new Error('ลิงก์หมดอายุ'));

    const wrapper = await mountPage(VerifyEmailPage);

    expect(wrapper.find('[data-test="verify-error"]').text()).toContain('ลิงก์หมดอายุ');
    expect(wrapper.find('[data-test="verify-success"]').exists()).toBe(false);
  });

  it('ไม่มี token -> ไม่ยิงหลังบ้าน แสดงว่าลิงก์ไม่ถูกต้อง', async () => {
    const verify = vi.spyOn(useAuthStore(), 'verifyEmail');

    const wrapper = await mountPage(VerifyEmailPage);

    expect(verify).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="verify-error"]').exists()).toBe(true);
  });
});

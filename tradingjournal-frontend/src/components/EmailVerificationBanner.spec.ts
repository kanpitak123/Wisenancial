/**
 * แถบเตือนอีเมลยังไม่ยืนยัน — แสดงเฉพาะเมื่อหลังบ้านบอก email_verified === false ชัด ๆ
 * (ไม่มีค่า = ไม่รู้ = ไม่เตือน) ปุ่มส่งซ้ำต้องแสดงเหตุผลจากหลังบ้านตอนโดนเพดาน
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailVerificationBanner from './EmailVerificationBanner.vue';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';
import { useUserStore } from 'stores/UserStore';
import type * as UserServiceModule from 'src/services/user.service';

const sendVerificationEmail = vi.fn();
const getMe = vi.fn();

vi.mock('src/services/user.service', async (importOriginal) => ({
  ...(await importOriginal<typeof UserServiceModule>()),
  userService: {
    sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
    getMe: (...args: unknown[]) => getMe(...args),
  },
}));

function login(emailVerified?: boolean) {
  const auth = useAuthStore();

  auth.accessToken = 'jwt';
  auth.user = {
    id: 1,
    email: 'a@b.co',
    ...(emailVerified === undefined ? {} : { email_verified: emailVerified }),
  } as never;
}

const mountBanner = () => mount(EmailVerificationBanner, { attachTo: document.body });

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
  localStorage.clear();
  vi.clearAllMocks();
  useLanguageStore().setLanguage('en');
});

describe('EmailVerificationBanner', () => {
  it('ยังไม่ยืนยัน (false) -> แสดงแถบ', () => {
    login(false);

    expect(mountBanner().find('[data-test="verify-banner"]').exists()).toBe(true);
  });

  it('ยืนยันแล้ว / ไม่มีค่า / ยังไม่ล็อกอิน -> ไม่แสดง', () => {
    login(true);
    expect(mountBanner().find('[data-test="verify-banner"]').exists()).toBe(false);

    setActivePinia(createPinia());
    login(undefined);
    expect(mountBanner().find('[data-test="verify-banner"]').exists()).toBe(false);

    setActivePinia(createPinia());
    expect(mountBanner().find('[data-test="verify-banner"]').exists()).toBe(false);
  });

  it('โปรไฟล์จาก /users/me (email_verified) มาก่อนค่าจาก session', () => {
    login(false);
    useUserStore().profile = { email_verified: true } as never;

    expect(mountBanner().find('[data-test="verify-banner"]').exists()).toBe(false);
  });

  it('กดส่งอีเมลยืนยัน -> เรียกหลังบ้านแล้วบอกให้ตรวจกล่องจดหมาย', async () => {
    login(false);
    sendVerificationEmail.mockResolvedValue({ message: 'ok', already_verified: false });
    const wrapper = mountBanner();

    await wrapper.find('[data-test="verify-banner-resend"]').trigger('click');
    await flushPromises();

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="verify-banner-text"]').text()).toContain('Verification email sent');
  });

  it('ติดเพดาน (429) -> แสดงข้อความจากหลังบ้าน ไม่ขึ้นว่าส่งแล้ว', async () => {
    login(false);
    sendVerificationEmail.mockRejectedValue(
      Object.assign(new Error('HTTP 429'), {
        response: { status: 429, data: { message: 'ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' } },
      }),
    );
    const wrapper = mountBanner();

    await wrapper.find('[data-test="verify-banner-resend"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-test="verify-banner-error"]').text()).toContain('ส่งอีเมลบ่อยเกินไป');
    expect(wrapper.find('[data-test="verify-banner-text"]').text()).not.toContain('Verification email sent');
  });

  it('หลังบ้านบอกว่ายืนยันแล้ว -> โหลดโปรไฟล์ใหม่ (แถบล้าสมัย)', async () => {
    login(false);
    sendVerificationEmail.mockResolvedValue({ message: 'ok', already_verified: true });
    getMe.mockResolvedValue({ id: 1, email_verified: true });
    const wrapper = mountBanner();

    await wrapper.find('[data-test="verify-banner-resend"]').trigger('click');
    await flushPromises();

    expect(getMe).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="verify-banner"]').exists()).toBe(false);
  });

  it('ปิดแถบได้ (เฉพาะรอบนี้)', async () => {
    login(false);
    const wrapper = mountBanner();

    await wrapper.find('[data-test="verify-banner-dismiss"]').trigger('click');

    expect(wrapper.find('[data-test="verify-banner"]').exists()).toBe(false);
  });
});

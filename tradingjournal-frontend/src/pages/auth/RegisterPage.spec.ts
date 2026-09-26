/**
 * RegisterPage — ต้องติ๊ก "ฉันยอมรับ Terms และ Privacy" เองก่อนสมัคร
 *
 * ที่ล็อกไว้: ช่องเริ่มต้นเป็น "ไม่ติ๊ก" (PDPA: ความยินยอมต้องเป็นการกระทำที่ชัดเจน),
 * ไม่ติ๊กแล้วสมัครไม่ได้ทั้งจากปุ่มและจาก Enter, ติ๊กแล้วส่งเวอร์ชันข้อกำหนดที่แสดงอยู่ไปให้หลังบ้านบันทึก,
 * และลิงก์เปิดแท็บใหม่เพื่อไม่ให้ข้อมูลในฟอร์มหาย
 */
import { flushPromises, mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils';
import { h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage.vue';
import type * as QuasarModule from 'quasar';
import { TERMS_VERSION } from 'src/constants/legal.constants';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';

const push = vi.fn();
const notifyMock = vi.fn();

vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof QuasarModule>();

  return {
    ...actual,
    useQuasar: () =>
      new Proxy(actual.useQuasar(), {
        get: (target, key, receiver) =>
          key === 'notify' ? notifyMock : (Reflect.get(target, key, receiver) as unknown),
      }),
  };
});

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/Register', params: {}, meta: {} }),
}));

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(RegisterPage)])]) },
    { attachTo: document.body, global: { stubs: { RouterLink: RouterLinkStub } } },
  );
  await flushPromises();

  return wrapper;
}

async function fillForm(wrapper: VueWrapper) {
  const inputs = wrapper.findAll('input:not([type="checkbox"])');

  await inputs[0]!.setValue('newuser');
  await inputs[1]!.setValue('New User');
  await inputs[2]!.setValue('new@example.com');
  await inputs[3]!.setValue('Password123');
}

const submitDisabled = (wrapper: VueWrapper) =>
  wrapper.get('[data-test="register-submit"]').attributes('disabled') !== undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
  localStorage.clear();
  vi.clearAllMocks();
  useLanguageStore().setLanguage('en');
});

describe('RegisterPage — terms consent', () => {
  it('ช่องยอมรับเริ่มต้นเป็นไม่ติ๊ก และปุ่มสมัครกดไม่ได้', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('[data-test="register-terms"]').attributes('aria-checked')).toBe('false');
    expect(submitDisabled(wrapper)).toBe(true);
  });

  it('ติ๊กแล้วปุ่มกดได้ เอาติ๊กออกแล้วกดไม่ได้อีก', async () => {
    const wrapper = await mountPage();

    await wrapper.get('[data-test="register-terms"]').trigger('click');
    expect(submitDisabled(wrapper)).toBe(false);

    await wrapper.get('[data-test="register-terms"]').trigger('click');
    expect(submitDisabled(wrapper)).toBe(true);
  });

  it('ไม่ติ๊กแล้วส่งฟอร์ม (เช่นกด Enter) -> ไม่เรียกหลังบ้าน แจ้งเตือนให้ยอมรับก่อน', async () => {
    const register = vi.spyOn(useAuthStore(), 'register').mockResolvedValue({} as never);
    const wrapper = await mountPage();

    await fillForm(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(register).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: 'Please accept the Terms and Privacy Policy to sign up.',
      }),
    );
  });

  it('ติ๊กแล้วสมัคร -> ส่งเวอร์ชันข้อกำหนดที่แสดงอยู่ไปพร้อมข้อมูลเดิมครบ', async () => {
    const register = vi.spyOn(useAuthStore(), 'register').mockResolvedValue({} as never);
    const wrapper = await mountPage();

    await fillForm(wrapper);
    await wrapper.get('[data-test="register-terms"]').trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(register).toHaveBeenCalledWith({
      username: 'newuser',
      full_name: 'New User',
      email: 'new@example.com',
      password: 'Password123',
      accepted_terms_version: TERMS_VERSION,
    });
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('ลิงก์ Terms / Privacy ชี้ถูกหน้าและเปิดแท็บใหม่ (ข้อมูลในฟอร์มไม่หาย)', async () => {
    const wrapper = await mountPage();

    const terms = wrapper.get('[data-test="register-terms-link"]');
    const privacy = wrapper.get('[data-test="register-privacy-link"]');
    const propsOf = (selector: string) =>
      (wrapper.getComponent(selector) as unknown as { props(name: string): unknown }).props('to');

    expect(propsOf('[data-test="register-terms-link"]')).toBe('/terms');
    expect(propsOf('[data-test="register-privacy-link"]')).toBe('/privacy');
    expect(terms.attributes('target')).toBe('_blank');
    expect(privacy.attributes('target')).toBe('_blank');
  });

  it('ข้อความยินยอมเป็นภาษาไทยเมื่อเลือกไทย', async () => {
    useLanguageStore().setLanguage('th');
    const wrapper = await mountPage();

    expect(wrapper.get('[data-test="register-terms-label"]').text()).toContain('ฉันยอมรับ');
    expect(wrapper.get('[data-test="register-terms-label"]').text()).toContain(
      'ข้อกำหนดการให้บริการ',
    );
  });

  it('หลังบ้านตอบว่าข้อกำหนดถูกอัปเดต -> แสดงข้อความนั้น ไม่พาไปหน้า login', async () => {
    const auth = useAuthStore();

    vi.spyOn(auth, 'register').mockImplementation(() => {
      auth.error = 'ข้อกำหนดการให้บริการมีการอัปเดต กรุณารีเฟรชหน้าแล้วอ่านและยอมรับอีกครั้ง';

      return Promise.reject(new Error('outdated'));
    });
    const wrapper = await mountPage();

    await fillForm(wrapper);
    await wrapper.get('[data-test="register-terms"]').trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(push).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'negative',
        message: expect.stringContaining('ข้อกำหนดการให้บริการมีการอัปเดต') as unknown,
      }),
    );
  });
});

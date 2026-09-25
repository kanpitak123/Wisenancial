/**
 * LoginPage — ล็อกอินระหว่างช่วงรอลบบัญชี (30 วัน) ต้องบอกผู้ใช้ให้ชัดว่าการลบถูกยกเลิกแล้ว
 *
 * หลังบ้านล้าง deletion_scheduled_at ตอนล็อกอินสำเร็จ และส่ง account_deletion_cancelled มา
 * ถ้าหน้านี้เงียบ ผู้ใช้จะไม่รู้ว่าบัญชีที่ตั้งใจลบไว้ยังอยู่ — เป็นการยกเลิกที่ผู้ใช้อาจไม่ได้ตั้งใจ
 * (เช่นแค่ล็อกอินเช็คอะไรบางอย่าง) จึงต้องเห็นชัดพอที่จะรีบกลับไปลบใหม่ได้
 */
import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage.vue';
import type * as QuasarModule from 'quasar';
import { useAuthStore } from 'stores/AuthStore';
import { useLanguageStore } from 'stores/LanguageStore';

const push = vi.fn();
const notifyMock = vi.fn();

// $q.notify ถูกผูกตอนติดตั้ง plugin เข้า instance ของ Quasar — สอดแนมตรง ๆ ไม่ได้
// จึงสวมทับ useQuasar() ให้คืนตัวปลอมที่จับได้ว่าหน้านี้เรียกแจ้งเตือนอะไรออกมา
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof QuasarModule>();

  return {
    ...actual,
    // ส่งต่อทุกอย่างของ $q จริง (หน้านี้อ่าน $q.dark ด้วย) เปลี่ยนเฉพาะ notify
    useQuasar: () =>
      new Proxy(actual.useQuasar(), {
        get: (target, key, receiver) =>
          key === 'notify' ? notifyMock : (Reflect.get(target, key, receiver) as unknown),
      }),
  };
});

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/Login', params: {}, meta: {} }),
}));

const USER = {
  id: 1,
  email: 'a@b.co',
  username: 'a',
  display_name: 'A',
  role: 'USER',
  avatar_url: null,
  bio: null,
  subscription_tier: null,
  points_balance: 0,
  ai_token_balance: 0,
  current_streak: 0,
  longest_streak: 0,
  created_at: null,
};

async function submitLogin(cancelled: boolean) {
  const auth = useAuthStore();

  vi.spyOn(auth, 'login').mockImplementation(() => {
    auth.accountDeletionCancelled = cancelled;

    return Promise.resolve(USER as never);
  });

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(LoginPage)])]) },
    { attachTo: document.body },
  );
  await flushPromises();

  const inputs = wrapper.findAll('input');
  await inputs[0]!.setValue('a@b.co');
  await inputs[1]!.setValue('Password123');
  await wrapper.find('form').trigger('submit');
  await flushPromises();

  return { wrapper, auth };
}

describe('LoginPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('ล็อกอินปกติ -> แจ้งสำเร็จธรรมดา ไม่มีประกาศยกเลิกการลบ', async () => {
    await submitLogin(false);

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'positive' }));
    expect(notifyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    expect(push).toHaveBeenCalledWith('/Dashboard');
  });

  it('ล็อกอินที่ยกเลิกการลบบัญชี -> ประกาศชัดเจน (ค้างนาน) เป็นภาษาไทย แล้วล้างธง', async () => {
    useLanguageStore().setLanguage('th');
    const { auth } = await submitLogin(true);

    const call = notifyMock.mock.calls
      .map((args) => args[0] as Record<string, unknown>)
      .find((opts) => opts.type === 'warning');

    expect(call, 'ต้องมี notify ประเภท warning').toBeDefined();
    expect(String(call!.message)).toContain('ยกเลิกการลบบัญชี');
    expect(Number(call!.timeout)).toBeGreaterThanOrEqual(10000);
    expect(auth.accountDeletionCancelled).toBe(false);
    expect(push).toHaveBeenCalledWith('/Dashboard');
  });

  it('ประกาศเป็นภาษาอังกฤษเมื่อตั้งภาษาเป็น EN', async () => {
    useLanguageStore().setLanguage('en');
    await submitLogin(true);

    const call = notifyMock.mock.calls
      .map((args) => args[0] as Record<string, unknown>)
      .find((opts) => opts.type === 'warning');

    expect(String(call!.message)).toContain('Account deletion cancelled');
  });
});

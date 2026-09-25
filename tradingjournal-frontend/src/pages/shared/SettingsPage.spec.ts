/**
 * SettingsPage — โปรไฟล์ / เปลี่ยนรหัสผ่าน / ส่งออกข้อมูล
 *
 * จุดที่ต้องล็อกไว้ด้วยเทสต์:
 *   - บันทึกโปรไฟล์ส่งเฉพาะฟิลด์ที่เปลี่ยน (ไม่ส่ง avatar_url ว่างไปให้หลังบ้านปฏิเสธ)
 *   - ปุ่มเปลี่ยนรหัสผ่านกดไม่ได้จนกว่ารหัสใหม่จะผ่านกฎเดียวกับหลังบ้าน + ยืนยันตรงกัน +
 *     ไม่ซ้ำรหัสเดิม — และ payload เป็น snake_case ตามที่ DTO รับ
 *   - ผลลัพธ์บอกจำนวนเครื่องอื่นที่ถูกไล่ออก / กรณีหลังบ้านระบุเครื่องนี้ไม่ได้
 *   - ส่งออกข้อมูลสร้างไฟล์ในเบราว์เซอร์ด้วยชื่อที่มีวันที่ ไม่ยิงไปที่อื่น
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage.vue';
import type * as UserServiceModule from 'src/services/user.service';
import type * as JsonExportModule from 'src/utils/json-export';

const getMe = vi.fn();
const updateMe = vi.fn();
const changePassword = vi.fn();
const exportMyData = vi.fn();
const removeAvatar = vi.fn();
const downloadJson = vi.fn();

vi.mock('src/services/user.service', async (importOriginal) => ({
  ...(await importOriginal<typeof UserServiceModule>()),
  userService: {
    getMe: (...args: unknown[]) => getMe(...args),
    updateMe: (...args: unknown[]) => updateMe(...args),
    changePassword: (...args: unknown[]) => changePassword(...args),
    exportMyData: (...args: unknown[]) => exportMyData(...args),
    removeAvatar: (...args: unknown[]) => removeAvatar(...args),
    getPublicProfile: vi.fn(),
  },
}));

vi.mock('src/utils/json-export', async (importOriginal) => ({
  ...(await importOriginal<typeof JsonExportModule>()),
  downloadJson: (...args: unknown[]) => downloadJson(...args),
}));

const profile = (over: Record<string, unknown> = {}) => ({
  id: 1,
  username: 'trader01',
  full_name: 'Trader One',
  email: 'trader@example.com',
  role: 'USER',
  avatar_url: null,
  bio: 'DCA',
  is_public_profile: false,
  subscription_tier: null,
  created_at: null,
  updated_at: null,
  points_balance: 0,
  ai_token_balance: 0,
  current_streak: 0,
  longest_streak: 0,
  plan: null,
  ...over,
});

const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(SettingsPage)])]) },
    { attachTo: document.body },
  );

  await flush();

  return wrapper;
}

const input = (wrapper: VueWrapper, test: string) =>
  wrapper.find<HTMLInputElement>(`input[data-test="${test}"], textarea[data-test="${test}"]`);

const button = (wrapper: VueWrapper, test: string) =>
  wrapper.find<HTMLButtonElement>(`[data-test="${test}"]`);

const isDisabled = (wrapper: VueWrapper, test: string) =>
  button(wrapper, test).attributes('disabled') !== undefined ||
  button(wrapper, test).classes().includes('disabled');

describe('SettingsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    vi.clearAllMocks();
    getMe.mockResolvedValue(profile());
  });

  describe('โปรไฟล์', () => {
    it('เติมฟอร์มจากโปรไฟล์จริง และปุ่มบันทึกกดไม่ได้ตอนยังไม่ได้แก้อะไร', async () => {
      const wrapper = await mountPage();

      expect(input(wrapper, 'profile-full-name').element.value).toBe('Trader One');
      expect(input(wrapper, 'profile-username').element.value).toBe('trader01');
      expect(input(wrapper, 'profile-bio').element.value).toBe('DCA');
      expect(input(wrapper, 'profile-email').element.value).toBe('trader@example.com');
      expect(isDisabled(wrapper, 'profile-save')).toBe(true);
    });

    it('แก้ชื่อแล้วบันทึก -> ส่งเฉพาะฟิลด์ที่เปลี่ยน', async () => {
      updateMe.mockResolvedValue({ message: 'ok', user: {} });

      const wrapper = await mountPage();

      await input(wrapper, 'profile-full-name').setValue('Trader Two');
      await nextTick();

      expect(isDisabled(wrapper, 'profile-save')).toBe(false);

      await wrapper.find('[data-test="settings-profile"] form').trigger('submit');
      await flush();

      expect(updateMe).toHaveBeenCalledTimes(1);
      expect(updateMe).toHaveBeenCalledWith({ full_name: 'Trader Two' });
    });

    it('สลับโปรไฟล์สาธารณะ -> ส่ง is_public_profile อย่างเดียว', async () => {
      updateMe.mockResolvedValue({ message: 'ok', user: {} });

      const wrapper = await mountPage();

      await wrapper.find('[data-test="profile-public-toggle"]').trigger('click');
      await nextTick();
      await wrapper.find('[data-test="settings-profile"] form').trigger('submit');
      await flush();

      expect(updateMe).toHaveBeenCalledWith({ is_public_profile: true });
    });

    it('username ผิดกฎ -> ปุ่มบันทึกกดไม่ได้ และไม่ยิง API', async () => {
      const wrapper = await mountPage();

      await input(wrapper, 'profile-username').setValue('bad name!');
      await nextTick();

      expect(isDisabled(wrapper, 'profile-save')).toBe(true);
      expect(updateMe).not.toHaveBeenCalled();
    });

    it('ไม่มีรูป -> ไม่มีปุ่มลบรูป / มีรูป -> กดลบแล้วยิง DELETE avatar', async () => {
      const without = await mountPage();

      expect(without.find('[data-test="profile-avatar-remove"]').exists()).toBe(false);
      without.unmount();

      getMe.mockResolvedValue(profile({ avatar_url: 'https://cdn.example.com/a.png' }));
      removeAvatar.mockResolvedValue({ message: 'ok', user: {} });

      const wrapper = await mountPage();

      await wrapper.find('[data-test="profile-avatar-remove"]').trigger('click');
      await flush();

      expect(removeAvatar).toHaveBeenCalledTimes(1);
    });
  });

  describe('เปลี่ยนรหัสผ่าน', () => {
    const fill = async (wrapper: VueWrapper, current: string, next: string, confirm: string) => {
      await input(wrapper, 'password-current').setValue(current);
      await input(wrapper, 'password-new').setValue(next);
      await input(wrapper, 'password-confirm').setValue(confirm);
      await nextTick();
    };

    it('ปุ่มกดไม่ได้ตอนฟอร์มว่าง', async () => {
      const wrapper = await mountPage();

      expect(isDisabled(wrapper, 'password-submit')).toBe(true);
    });

    it.each([
      ['รหัสใหม่สั้นเกินไป', 'OldPass123', 'Ab1', 'Ab1'],
      ['รหัสใหม่ไม่มีตัวเลข', 'OldPass123', 'OnlyLetters', 'OnlyLetters'],
      ['รหัสใหม่ไม่มีตัวอักษร', 'OldPass123', '12345678', '12345678'],
      ['ยืนยันไม่ตรงกัน', 'OldPass123', 'NewPass456', 'NewPass457'],
      ['รหัสใหม่ซ้ำรหัสเดิม', 'SamePass123', 'SamePass123', 'SamePass123'],
    ])('%s -> ปุ่มกดไม่ได้และไม่ยิง API', async (_label, current, next, confirm) => {
      const wrapper = await mountPage();

      await fill(wrapper, current, next, confirm);

      expect(isDisabled(wrapper, 'password-submit')).toBe(true);
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('กรอกถูกกฎ -> ยิงด้วย snake_case แล้วแจ้งจำนวนเครื่องอื่นที่ถูกไล่ออก และล้างช่อง', async () => {
      changePassword.mockResolvedValue({
        message: 'ok',
        other_sessions_revoked: 3,
        current_session_kept: true,
      });

      const wrapper = await mountPage();

      await fill(wrapper, 'OldPass123', 'NewPass456', 'NewPass456');

      expect(isDisabled(wrapper, 'password-submit')).toBe(false);

      await wrapper.find('[data-test="settings-password"] form').trigger('submit');
      await flush();

      expect(changePassword).toHaveBeenCalledWith({
        current_password: 'OldPass123',
        new_password: 'NewPass456',
      });

      const result = wrapper.find('[data-test="password-result"]');

      expect(result.exists()).toBe(true);
      expect(result.text()).toContain('3');
      expect(result.classes()).toContain('is-ok');
      expect(input(wrapper, 'password-current').element.value).toBe('');
      expect(input(wrapper, 'password-new').element.value).toBe('');
    });

    it('หลังบ้านระบุเครื่องนี้ไม่ได้ -> เตือนว่าอาจต้องล็อกอินใหม่', async () => {
      changePassword.mockResolvedValue({
        message: 'ok',
        other_sessions_revoked: 5,
        current_session_kept: false,
      });

      const wrapper = await mountPage();

      await fill(wrapper, 'OldPass123', 'NewPass456', 'NewPass456');
      await wrapper.find('[data-test="settings-password"] form').trigger('submit');
      await flush();

      expect(wrapper.find('[data-test="password-result"]').classes()).toContain('is-warn');
    });

    it('รหัสปัจจุบันผิด (400) -> ไม่ขึ้นผลสำเร็จ และช่องที่กรอกไว้ไม่ถูกล้าง', async () => {
      changePassword.mockRejectedValue(
        Object.assign(new Error('HTTP 400'), {
          response: { status: 400, data: { message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' } },
        }),
      );

      const wrapper = await mountPage();

      await fill(wrapper, 'WrongPass1', 'NewPass456', 'NewPass456');
      await wrapper.find('[data-test="settings-password"] form').trigger('submit');
      await flush();

      expect(changePassword).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-test="password-result"]').exists()).toBe(false);
      expect(input(wrapper, 'password-new').element.value).toBe('NewPass456');
    });
  });

  describe('ส่งออกข้อมูล', () => {
    it('กดปุ่ม -> ขอข้อมูลแล้วดาวน์โหลดเป็นไฟล์ที่มีวันที่ในชื่อ', async () => {
      const bundle = {
        format_version: 1,
        exported_at: '2026-09-26T03:00:00.000Z',
        user: { id: 1 },
        data: { trades: [] },
      };
      exportMyData.mockResolvedValue(bundle);

      const wrapper = await mountPage();

      await button(wrapper, 'export-button').trigger('click');
      await flush();

      expect(exportMyData).toHaveBeenCalledTimes(1);
      expect(downloadJson).toHaveBeenCalledWith('wisenancial-export-2026-09-26.json', bundle);
    });

    it('ขอส่งออกไม่สำเร็จ (429) -> ไม่ดาวน์โหลดอะไร', async () => {
      exportMyData.mockRejectedValue(
        Object.assign(new Error('HTTP 429'), { response: { status: 429 } }),
      );

      const wrapper = await mountPage();

      await button(wrapper, 'export-button').trigger('click');
      await flush();

      expect(downloadJson).not.toHaveBeenCalled();
    });
  });
});

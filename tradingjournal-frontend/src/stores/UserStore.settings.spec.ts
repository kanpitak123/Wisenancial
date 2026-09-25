/**
 * UserStore — action ของหน้า Settings (เปลี่ยนรหัสผ่าน / ส่งออกข้อมูล)
 *
 * เก็บ flag loading แยกจาก `updating` ของโปรไฟล์ ไม่งั้นการเปลี่ยนรหัสผ่านจะทำให้ปุ่ม
 * บันทึกโปรไฟล์หมุนตามไปด้วย และ flag ต้องกลับเป็น false ทั้งตอนสำเร็จและตอนพัง
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from './UserStore';
import type * as UserServiceModule from 'src/services/user.service';

const changePassword = vi.fn();
const exportMyData = vi.fn();
const requestAccountDeletion = vi.fn();

vi.mock('src/services/user.service', async (importOriginal) => ({
  ...(await importOriginal<typeof UserServiceModule>()),
  userService: {
    changePassword: (...args: unknown[]) => changePassword(...args),
    exportMyData: (...args: unknown[]) => exportMyData(...args),
    requestAccountDeletion: (...args: unknown[]) => requestAccountDeletion(...args),
  },
}));

describe('UserStore settings actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('changePassword ส่ง payload ต่อให้ service และคืนผลลัพธ์', async () => {
    const response = { message: 'ok', other_sessions_revoked: 2, current_session_kept: true };
    changePassword.mockResolvedValue(response);
    const store = useUserStore();

    const result = await store.changePassword({ current_password: 'a1', new_password: 'b2' });

    expect(changePassword).toHaveBeenCalledWith({ current_password: 'a1', new_password: 'b2' });
    expect(result).toEqual(response);
    expect(store.changingPassword).toBe(false);
    expect(store.updating).toBe(false);
  });

  it('changePassword พัง -> flag กลับเป็น false, เก็บข้อความจากหลังบ้าน และโยน error ต่อ', async () => {
    changePassword.mockRejectedValue(
      Object.assign(new Error('HTTP 400'), {
        response: { data: { message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' } },
      }),
    );
    const store = useUserStore();

    await expect(
      store.changePassword({ current_password: 'x', new_password: 'y' }),
    ).rejects.toThrow();

    expect(store.changingPassword).toBe(false);
    expect(store.error).toBe('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  });

  it('exportMyData คืนก้อนข้อมูลและปิด flag', async () => {
    const bundle = {
      format_version: 1,
      exported_at: '2026-09-26T00:00:00.000Z',
      user: {},
      data: {},
    };
    exportMyData.mockResolvedValue(bundle);
    const store = useUserStore();

    await expect(store.exportMyData()).resolves.toEqual(bundle);

    expect(store.exporting).toBe(false);
  });

  it('exportMyData พัง -> ปิด flag และเก็บ error', async () => {
    exportMyData.mockRejectedValue(new Error('network'));
    const store = useUserStore();

    await expect(store.exportMyData()).rejects.toThrow('network');

    expect(store.exporting).toBe(false);
    expect(store.error).toBe('network');
  });

  it('requestAccountDeletion ส่งรหัสผ่านต่อให้ service และปิด flag', async () => {
    const response = {
      message: 'ok',
      deletion_scheduled_at: '2026-10-26T00:00:00.000Z',
      grace_days: 30,
    };
    requestAccountDeletion.mockResolvedValue(response);
    const store = useUserStore();

    await expect(store.requestAccountDeletion('pw')).resolves.toEqual(response);

    expect(requestAccountDeletion).toHaveBeenCalledWith('pw');
    expect(store.requestingDeletion).toBe(false);
  });

  it('requestAccountDeletion พัง (409) -> เก็บข้อความ ปิด flag และโยน error ต่อให้หน้าแสดง', async () => {
    requestAccountDeletion.mockRejectedValue(
      Object.assign(new Error('HTTP 409'), {
        response: { data: { message: 'กรุณายกเลิกแพ็กเกจก่อน' } },
      }),
    );
    const store = useUserStore();

    await expect(store.requestAccountDeletion('pw')).rejects.toThrow();

    expect(store.requestingDeletion).toBe(false);
    expect(store.error).toBe('กรุณายกเลิกแพ็กเกจก่อน');
  });

  it('clear() ล้าง flag ใหม่ทุกตัวด้วย', () => {
    const store = useUserStore();
    store.changingPassword = true;
    store.exporting = true;
    store.requestingDeletion = true;

    store.clear();

    expect(store.changingPassword).toBe(false);
    expect(store.exporting).toBe(false);
    expect(store.requestingDeletion).toBe(false);
  });
});

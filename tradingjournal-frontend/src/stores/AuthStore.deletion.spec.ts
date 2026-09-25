/**
 * AuthStore.login — จำไว้ว่าการล็อกอินครั้งนี้ไปยกเลิกการลบบัญชีที่ตั้งไว้
 * (หลังบ้านส่ง account_deletion_cancelled มาเฉพาะกรณีนั้น) เพื่อให้หน้า Login แสดงประกาศ
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './AuthStore';

const login = vi.fn();

vi.mock('src/services/auth.api', () => ({
  authApi: {
    login: (...args: unknown[]) => login(...args),
    logout: vi.fn(),
    getMe: vi.fn(),
    refresh: vi.fn(),
    register: vi.fn(),
  },
}));

const USER = { id: 1, email: 'a@b.co', username: 'a' };

describe('AuthStore.login — account deletion cancelled', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('เริ่มต้นเป็น false', () => {
    expect(useAuthStore().accountDeletionCancelled).toBe(false);
  });

  it('หลังบ้านบอกว่ายกเลิกการลบ -> ตั้งธงเป็น true', async () => {
    login.mockResolvedValue({
      message: 'ok',
      access_token: 't',
      user: USER,
      account_deletion_cancelled: true,
    });
    const store = useAuthStore();

    await store.login('a@b.co', 'Password123');

    expect(store.accountDeletionCancelled).toBe(true);
  });

  it('ล็อกอินปกติ -> ธงเป็น false (และล้างค่าค้างจากรอบก่อน)', async () => {
    login.mockResolvedValue({ message: 'ok', access_token: 't', user: USER });
    const store = useAuthStore();
    store.accountDeletionCancelled = true;

    await store.login('a@b.co', 'Password123');

    expect(store.accountDeletionCancelled).toBe(false);
  });

  it('ล็อกอินไม่สำเร็จ -> ไม่แตะธง', async () => {
    login.mockRejectedValue(new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง'));
    const store = useAuthStore();

    await expect(store.login('a@b.co', 'bad')).rejects.toThrow();

    expect(store.accountDeletionCancelled).toBe(false);
  });
});

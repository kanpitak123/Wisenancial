/**
 * LegalStore / legalService — เลขเวอร์ชัน Terms มาจากหลังบ้านที่เดียว
 *
 * ที่ล็อกไว้: ค่าที่ store เก็บคือค่าที่หลังบ้านตอบมาตรง ๆ, โหลดไม่ได้ = null (ไม่เดา/ไม่ใช้ค่าสำรองที่ฝังไว้),
 * และ response ที่ผิดรูปถือว่าโหลดไม่สำเร็จ
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_TERMS_VERSION_PATH } from 'src/constants/legal.constants';
import { legalService } from 'src/services/legal.service';
import { useLegalStore } from './LegalStore';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('src/boot/axios', () => ({ api: { get } }));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('legalService.getTermsVersion', () => {
  it('เรียก GET /legal/terms-version และคืนเลขเวอร์ชันตามที่หลังบ้านตอบ', async () => {
    get.mockResolvedValue({ data: { terms_version: 'srv-9.9' } });

    await expect(legalService.getTermsVersion()).resolves.toBe('srv-9.9');
    expect(get).toHaveBeenCalledWith(LEGAL_TERMS_VERSION_PATH);
    expect(LEGAL_TERMS_VERSION_PATH).toBe('/legal/terms-version');
  });

  it.each([[{}], [{ terms_version: '' }], [{ terms_version: 3 }], [{ terms_version: null }]])(
    'response ผิดรูป %j -> โยน error (ไม่คืนค่าเดา)',
    async (data) => {
      get.mockResolvedValue({ data });

      await expect(legalService.getTermsVersion()).rejects.toThrow('Invalid terms version');
    },
  );
});

describe('LegalStore', () => {
  it('เริ่มต้นเป็น null — ไม่มีเลขเวอร์ชันฝังไว้', () => {
    const store = useLegalStore();

    expect(store.termsVersion).toBeNull();
    expect(store.error).toBeNull();
  });

  it('โหลดสำเร็จ -> เก็บค่าที่หลังบ้านตอบ', async () => {
    get.mockResolvedValue({ data: { terms_version: 'srv-1' } });
    const store = useLegalStore();

    await store.loadTermsVersion();

    expect(store.termsVersion).toBe('srv-1');
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('โหลดไม่สำเร็จ -> null + error (ไม่โยน) และลองใหม่แล้วหายได้', async () => {
    get.mockRejectedValueOnce(new Error('Network Error'));
    const store = useLegalStore();

    await expect(store.loadTermsVersion()).resolves.toBeUndefined();
    expect(store.termsVersion).toBeNull();
    expect(store.error).toBe('Network Error');

    get.mockResolvedValue({ data: { terms_version: 'srv-2' } });
    await store.loadTermsVersion();

    expect(store.termsVersion).toBe('srv-2');
    expect(store.error).toBeNull();
  });

  it('กำลังโหลดอยู่ -> ไม่ยิงซ้ำ', async () => {
    let release: (value: unknown) => void = () => undefined;

    get.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const store = useLegalStore();

    const first = store.loadTermsVersion();
    await store.loadTermsVersion();

    expect(get).toHaveBeenCalledTimes(1);

    release({ data: { terms_version: 'srv-3' } });
    await first;

    expect(store.termsVersion).toBe('srv-3');
  });
});

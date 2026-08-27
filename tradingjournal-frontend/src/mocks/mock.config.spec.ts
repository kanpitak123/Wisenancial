/**
 * Mock mode ต้องปิดตายบน production build
 *
 * ของเดิม `isMockEnabled()` อ่าน localStorage ก่อนเสมอ และ `MockModeToggle` ถูก
 * เรนเดอร์บน header โดยไม่มีเงื่อนไข → ผู้ใช้จริงกดปุ่มครั้งเดียวก็เห็นข้อมูลปลอม
 * ทั้งแอปค้างไปเรื่อย ๆ และ `VITE_MOCK_MODE=false` ช่วยอะไรไม่ได้เลยเพราะค่าที่
 * ค้างในเครื่องมาก่อนค่า env
 *
 * ชุดนี้ล็อกไว้ว่า "ค้างอยู่ใน localStorage ก็ต้องไม่มีผล" ไม่ใช่แค่ค่าเริ่มต้นถูก
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_STORAGE_KEY,
  isMockAvailable,
  isMockEnabled,
  setMockEnabled,
} from './mock.config';

/** จำลอง build จริง: DEV=false และไม่ได้ opt-in */
function asProductionBuild() {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_ENABLE_MOCK_MODE', '');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('isMockAvailable', () => {
  it('dev build -> ใช้ได้', () => {
    vi.stubEnv('DEV', true);

    expect(isMockAvailable()).toBe(true);
  });

  it('production build ที่ไม่ได้ opt-in -> ใช้ไม่ได้', () => {
    asProductionBuild();

    expect(isMockAvailable()).toBe(false);
  });

  it('staging ที่ตั้ง VITE_ENABLE_MOCK_MODE=true -> ใช้ได้', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ENABLE_MOCK_MODE', 'true');

    expect(isMockAvailable()).toBe(true);
  });

  it('ค่าที่ไม่ใช่ true ชัดเจน -> ไม่นับว่า opt-in', () => {
    vi.stubEnv('DEV', false);

    for (const value of ['false', 'yes', 'TRUE ', '0', 'undefined']) {
      vi.stubEnv('VITE_ENABLE_MOCK_MODE', value);
      // 'TRUE ' ผ่านเพราะ trim+lowercase แล้วเป็น true — ตัวอื่นต้องไม่ผ่าน
      expect(isMockAvailable()).toBe(value === 'TRUE ');
    }
  });
});

describe('isMockEnabled บน production build', () => {
  /** นี่คือบั๊กตัวจริง: ผู้ใช้เคยกดปุ่มไว้ตอนที่ปุ่มยังติดมากับ production */
  it('localStorage ค้างว่า true -> ยังคงปิด ไม่สนใจค่าที่ค้าง', () => {
    localStorage.setItem(MOCK_STORAGE_KEY, 'true');
    asProductionBuild();

    expect(isMockEnabled()).toBe(false);
  });

  it('VITE_MOCK_MODE=true ก็ยังเปิดไม่ได้ ถ้า build ไม่อนุญาต', () => {
    asProductionBuild();
    vi.stubEnv('VITE_MOCK_MODE', 'true');

    expect(isMockEnabled()).toBe(false);
  });

  it('setMockEnabled(true) ไม่มีผล และไม่เขียนอะไรลง localStorage', () => {
    asProductionBuild();

    setMockEnabled(true);

    expect(localStorage.getItem(MOCK_STORAGE_KEY)).toBeNull();
    expect(isMockEnabled()).toBe(false);
  });
});

describe('isMockEnabled บน build ที่อนุญาต', () => {
  it('localStorage ชนะค่า env เหมือนเดิม', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_MOCK_MODE', 'false');
    localStorage.setItem(MOCK_STORAGE_KEY, 'true');

    expect(isMockEnabled()).toBe(true);
  });

  it('ไม่มีค่าค้าง -> ใช้ค่าจาก env', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_MOCK_MODE', 'true');

    expect(isMockEnabled()).toBe(true);
  });

  it('ไม่มีทั้งค่าค้างและ env -> ปิดไว้ก่อน', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_MOCK_MODE', '');

    expect(isMockEnabled()).toBe(false);
  });
});

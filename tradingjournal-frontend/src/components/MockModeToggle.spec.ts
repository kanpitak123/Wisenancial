/**
 * ปุ่มสลับ mock ต้องไม่ถูกเรนเดอร์บน production build
 *
 * ด่านจริงอยู่ที่ `isMockAvailable()` (ดู mocks/mock.config.spec.ts) แต่ปุ่มก็ต้อง
 * หายไปด้วย ไม่งั้นผู้ใช้เห็นปุ่มที่กดแล้วไม่เกิดอะไรขึ้น ซึ่งดูเหมือนแอปพัง
 *
 * เช็ค `v-if` ที่ตัวปุ่มเอง ไม่ใช่ที่ MainLayout — call site ใหม่ในอนาคตจะได้
 * ปลอดภัยตามไปด้วยโดยไม่ต้องจำว่าต้องครอบทุกครั้ง
 */
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MockModeToggle from './MockModeToggle.vue';

afterEach(() => {
  vi.unstubAllEnvs();
});

function mountToggle() {
  return mount(MockModeToggle);
}

describe('MockModeToggle', () => {
  it('dev build -> เรนเดอร์ปุ่มตามปกติ', () => {
    vi.stubEnv('DEV', true);

    expect(mountToggle().find('[data-test="mock-toggle"]').exists()).toBe(true);
  });

  it('production build -> ไม่เรนเดอร์อะไรเลย', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ENABLE_MOCK_MODE', '');

    expect(mountToggle().find('[data-test="mock-toggle"]').exists()).toBe(false);
  });

  it('staging ที่ opt-in ไว้ -> เรนเดอร์ปุ่ม', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ENABLE_MOCK_MODE', 'true');

    expect(mountToggle().find('[data-test="mock-toggle"]').exists()).toBe(true);
  });
});

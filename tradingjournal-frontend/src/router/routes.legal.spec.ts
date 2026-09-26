/**
 * /terms และ /privacy ต้องเปิดได้โดยไม่ล็อกอิน (ลิงก์จากหน้า Register / Login / ฟุตเตอร์ / การ์ด AI)
 * และเป็นหน้าเดียวกันที่ส่ง prop doc ต่างกัน
 */
import { describe, expect, it } from 'vitest';
import routes from './routes';

describe('legal routes', () => {
  it.each([
    ['/terms', 'terms'],
    ['/privacy', 'privacy'],
  ] as const)('%s เป็นหน้าสาธารณะ ส่ง doc=%s', (path, doc) => {
    const route = routes.find((r) => r.path === path);

    expect(route, `ไม่พบ route ${path}`).toBeDefined();
    expect(route?.props).toEqual({ doc });
    expect(route?.meta?.requiresAuth).toBeFalsy();
    expect(route?.children).toBeUndefined();
  });
});

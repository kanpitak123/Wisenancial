/**
 * เส้นทางของหน้าที่พอร์ตมาใน Phase 4
 *
 * จุดที่พังเงียบที่สุดของการเพิ่มหน้าใหม่คือ "เมนูมี แต่ route ไม่มี" (กดแล้วตก 404)
 * หรือ meta.workspace ไม่ตรงกับเมนู (กดจากเมนูแล้วโดน guard เตะออกทันที) เทสชุดนี้
 * จับคู่ทั้งสองฝั่งเข้าหากันโดยไม่ต้อง mount หน้าจริง
 */
import { describe, expect, it } from 'vitest';

import routes from './routes';
import { WORKSPACE_NAV_LINKS } from 'src/constants/workspace.constants';
import type { RouteRecordRaw } from 'vue-router';

/** children ของ MainLayout — ทุกหน้าที่ต้องล็อกอิน */
const appRoutes: RouteRecordRaw[] =
  routes.find((route) => route.meta?.requiresAuth === true)?.children ?? [];

const findRoute = (path: string) => appRoutes.find((route) => route.path === path);

const navLinks = (workspace: 'TRADER' | 'INVESTOR') =>
  WORKSPACE_NAV_LINKS[workspace].map((link) => link.link);

describe('Phase 4 routes', () => {
  it.each([['Market', 'INVESTOR']])(
    '/%s ถูกลงทะเบียนและล็อกไว้ที่โหมด %s',
    (path, workspace) => {
      const route = findRoute(path);

      expect(route, `route /${path} หายไป`).toBeDefined();
      expect(route?.meta?.workspace).toBe(workspace);
    },
  );

  it('/Leaderboard เป็นหน้า shared จึงต้องไม่มี meta.workspace ล็อกไว้', () => {
    const route = findRoute('Leaderboard');

    expect(route).toBeDefined();
    expect(route?.meta?.workspace).toBeUndefined();
  });

  it('เมนู Stock มี Market Pulse และชี้ไป route ที่มีจริง', () => {
    const links = navLinks('INVESTOR');

    expect(links).toContain('/Market');
    // Heatmap/Discover ถูกยุบรวมเข้า /Market แล้ว ต้องไม่เหลือเป็นเมนูซ้ำ
    expect(links).not.toContain('/Heatmap');
    expect(links).not.toContain('/Discover');
  });

  it('ลิงก์เก่า /Heatmap กับ /Discover ยัง redirect เข้า /Market ไม่ตก 404', () => {
    for (const path of ['Heatmap', 'Discover']) {
      const route = findRoute(path);

      expect(route, `route /${path} หายไป`).toBeDefined();
      expect(route?.redirect).toBe('/Market');
    }
  });

  it('Leaderboard อยู่ในเมนูทั้งสองโหมด เพราะภารกิจ/แต้มใช้ร่วมกัน', () => {
    expect(navLinks('TRADER')).toContain('/Leaderboard');
    expect(navLinks('INVESTOR')).toContain('/Leaderboard');
  });

  it('Market Pulse ต้องไม่โผล่ในเมนูโหมด Forex — endpoint เป็นข้อมูลหุ้นล้วน', () => {
    const links = navLinks('TRADER');

    expect(links).not.toContain('/Market');
  });

  it('ทุกลิงก์ในเมนูทั้งสองโหมดต้องมี route รองรับจริง ไม่มีเมนูตาย', () => {
    const registered = new Set(appRoutes.map((route) => `/${String(route.path)}`));

    for (const workspace of ['TRADER', 'INVESTOR'] as const) {
      for (const link of navLinks(workspace)) {
        expect(registered.has(link), `${workspace}: ${link} ไม่มี route รองรับ`).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { WORKSPACE_NAV_LINKS } from './workspace.constants';

/**
 * ล็อกไว้ว่า WorkspaceNavLink.paid ต้องตรงกับที่ backend ล็อกจริงด้วย PaidTierGuard
 * เท่านั้น (ดูเหตุผลเต็มในคอมเมนต์ของไฟล์นี้) — กัน regression ถ้ามีใครติด/ถอดธงผิด
 * โดยไม่รู้ว่ามันผูกกับ PaidTierGuard บน controller ไหนบ้าง:
 *   - Coach Room -> coach.controller.ts (@UseGuards(JwtAuthGuard, PaidTierGuard) ทั้ง class)
 *   - Market Pulse -> market-insights.controller.ts (เหมือนกัน, เป็นแหล่งข้อมูลเดียวของหน้านี้)
 *   - Analytics ต้อง "ไม่" ติดธงนี้ — analytics.controller.ts เลิกล็อกทั้ง controller แล้ว
 *     (มีคอมเมนต์อธิบายไว้ในไฟล์นั้นเอง) เหลือแค่บาง endpoint เท่านั้น หน้ายังใช้ได้ฟรี
 */
describe('WORKSPACE_NAV_LINKS — paid flag matches actual PaidTierGuard-gated controllers', () => {
  function paidTitles(workspace: 'TRADER' | 'INVESTOR'): string[] {
    return WORKSPACE_NAV_LINKS[workspace]
      .filter((link) => link.paid)
      .map((link) => link.title);
  }

  it('TRADER: เฉพาะ Coach Room เท่านั้นที่ล็อก', () => {
    expect(paidTitles('TRADER')).toEqual(['Coach Room']);
  });

  it('INVESTOR: เฉพาะ Market Pulse กับ Coach Room เท่านั้นที่ล็อก', () => {
    expect(paidTitles('INVESTOR')).toEqual(['Market Pulse', 'Coach Room']);
  });

  it('Analytics ไม่ติดธง paid ในทั้งสองโหมด — หน้ายังเข้าได้ฟรี มีแค่บาง endpoint ที่ล็อก', () => {
    for (const workspace of ['TRADER', 'INVESTOR'] as const) {
      const analytics = WORKSPACE_NAV_LINKS[workspace].find((link) => link.title === 'Analytics');
      expect(analytics?.paid).toBeFalsy();
    }
  });
});

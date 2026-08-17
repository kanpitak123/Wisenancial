import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaidTierGuard } from '../auth/paid-tier.guard';

/**
 * เดิม PaidTierGuard ครอบทั้ง AnalyticsController ทำให้ผู้ใช้ free tier โดน 403
 * แม้แต่ตอนขอดูสรุปพอร์ตของตัวเอง — หน้า Analytics/Dashboard เลยว่างเปล่าเงียบๆ
 *
 * ไฟล์นี้ล็อกสัญญาไว้ 2 ชั้น:
 *   1. เส้นไหน "ควรฟรี" ต้องไม่มี PaidTierGuard และเส้นไหน "ควรจ่าย" ต้องมี
 *   2. ตัว PaidTierGuard เองต้องผ่าน/ไม่ผ่านตามสถานะสมาชิกจริง
 */

/** ดูข้อมูลพอร์ตของตัวเอง คำนวณจาก record ที่ผู้ใช้กรอกเอง -> ไม่ควรเก็บเงิน */
const FREE_HANDLERS = [
  'overview',
  'performance',
  'dailyPnl',
  'monthlyGrowth',
  'winRate',
  'timeline',
  'allocation',
  // legacy alias — ห่อ service ตัวเดียวกับกลุ่มฟรี ต้องอยู่ฝั่งเดียวกัน
  'legacyDashboard',
  'legacyPerformanceChart',
  'legacyWinRate',
] as const;

/** ต้องใช้ข้อมูลตลาดภายนอก หรือเป็นการวิเคราะห์เชิงลึกที่เป็นจุดขาย */
const PAID_HANDLERS = [
  'behavioral',
  'returnVsBenchmark',
  'timeWeightedReturn',
  'monthlyHeatmap',
  'performers',
  'holdingPeriod',
  'cashFlow',
  'simulateDca',
] as const;

type HandlerName = (typeof FREE_HANDLERS)[number] | (typeof PAID_HANDLERS)[number];

/** guard ที่มีผลจริงกับ handler = ของระดับ method + ของระดับ class รวมกัน */
function effectiveGuards(handler: HandlerName): unknown[] {
  const reflector = new Reflector();

  return reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, [
    AnalyticsController.prototype[handler],
    AnalyticsController,
  ]);
}

function contextForUser(userId: number | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => (userId === undefined ? {} : { user: { userId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AnalyticsController', () => {
  it('is defined with mocked service', () => {
    const controller = new AnalyticsController({} as never);

    expect(controller).toBeDefined();
  });

  describe('การแบ่งชั้นสิทธิ์', () => {
    it('ทุกเส้นยังต้องผ่าน JwtAuthGuard', () => {
      for (const handler of [...FREE_HANDLERS, ...PAID_HANDLERS]) {
        expect(effectiveGuards(handler)).toContain(JwtAuthGuard);
      }
    });

    it.each(FREE_HANDLERS)('%s เป็นของฟรี ไม่มี PaidTierGuard', (handler) => {
      expect(effectiveGuards(handler)).not.toContain(PaidTierGuard);
    });

    it.each(PAID_HANDLERS)('%s ยัง gate ด้วย PaidTierGuard', (handler) => {
      expect(effectiveGuards(handler)).toContain(PaidTierGuard);
    });

    // ถ้ามีคนเผลอเอา PaidTierGuard กลับไปใส่ระดับ controller เทสข้างบนจะจับได้ทั้งหมด
    // ตัวนี้ระบุสาเหตุให้ชัดว่าพังเพราะอะไร
    it('ระดับ controller ต้องไม่มี PaidTierGuard', () => {
      const classGuards =
        (Reflect.getMetadata(GUARDS_METADATA, AnalyticsController) as unknown[]) ?? [];

      expect(classGuards).toContain(JwtAuthGuard);
      expect(classGuards).not.toContain(PaidTierGuard);
    });
  });

  describe('PaidTierGuard', () => {
    const makeGuard = (user: unknown) =>
      new PaidTierGuard({
        users: { findUnique: jest.fn().mockResolvedValue(user) },
      } as never);

    it('มี subscription_tier -> ผ่าน', async () => {
      const guard = makeGuard({ subscription_tier: 'PACK_279', subscriptions: [] });

      await expect(guard.canActivate(contextForUser(6))).resolves.toBe(true);
    });

    it('ไม่มี tier แต่มี subscription ที่ยัง ACTIVE -> ผ่าน', async () => {
      const guard = makeGuard({ subscription_tier: null, subscriptions: [{ id: 1 }] });

      await expect(guard.canActivate(contextForUser(6))).resolves.toBe(true);
    });

    it('free tier -> 403', async () => {
      const guard = makeGuard({ subscription_tier: null, subscriptions: [] });

      await expect(guard.canActivate(contextForUser(6))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('ไม่มี user ใน request -> 403', async () => {
      const guard = makeGuard(null);

      await expect(guard.canActivate(contextForUser(undefined))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});

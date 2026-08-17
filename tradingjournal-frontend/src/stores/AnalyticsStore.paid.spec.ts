/**
 * PaidTierGuard ถูกย้ายจากระดับ controller ไปเป็นราย method แล้ว — ในชุด loadDetails()
 * ฝั่ง TRADER เหลือ behavioral ตัวเดียวที่ยังเสียเงิน
 *
 * ของเดิมใช้ Promise.all ถ้า behavioral ตอบ 403 จะลาก monthlyGrowth กับ winRate
 * ที่เป็นของฟรีร่วงไปด้วย ผู้ใช้แพ็กฟรีจึงเห็นแท็บ Monthly Growth / Win Rate ว่างทั้งที่ควรเห็น
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalyticsStore } from './AnalyticsStore';
import type * as PaidTierModule from '../utils/paid-tier';

const getMonthlyGrowth = vi.fn();
const getBehavioral = vi.fn();
const getWinRate = vi.fn();
const getTimeline = vi.fn();
const getAllocation = vi.fn();

vi.mock('../services/analytics.service', async () => {
  const { isPaidTierError } = await vi.importActual<typeof PaidTierModule>('../utils/paid-tier');

  return {
    analyticsService: {
      getMonthlyGrowth: (...args: unknown[]) => getMonthlyGrowth(...args),
      getBehavioral: (...args: unknown[]) => getBehavioral(...args),
      getWinRate: (...args: unknown[]) => getWinRate(...args),
      getTimeline: (...args: unknown[]) => getTimeline(...args),
      getAllocation: (...args: unknown[]) => getAllocation(...args),
    },
    getAnalyticsErrorMessage: (_error: unknown, fallback: string) => fallback,
    isAnalyticsPaidTierError: isPaidTierError,
  };
});

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: { getAll: vi.fn().mockResolvedValue([]), getQuota: vi.fn() },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const forbidden = () => Object.assign(new Error('Forbidden'), { response: { status: 403 } });

const growthRows = [{ label: '2026-07', pnl: 120 }];
const winRateRows = { by_position: [], by_day: [], by_month: [] };

describe('AnalyticsStore.loadDetails — TRADER', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    getMonthlyGrowth.mockResolvedValue(growthRows);
    getWinRate.mockResolvedValue(winRateRows);
    getBehavioral.mockResolvedValue({ strategy: [{ label: 'value' }] });
  });

  const traderStore = () => {
    const store = useAnalyticsStore();

    store.portfolioId = 6;
    store.portfolioType = 'TRADER';

    return store;
  };

  it('ทุกตัวสำเร็จ -> เก็บครบ ไม่ตั้งธง denied', async () => {
    const store = traderStore();

    await store.loadDetails();

    expect(store.monthlyGrowth).toEqual(growthRows);
    expect(store.winRate).toEqual(winRateRows);
    expect(store.behavioral).not.toBeNull();
    expect(store.behavioralAccessDenied).toBe(false);
  });

  it('behavioral 403 -> monthlyGrowth/winRate ยังเข้า store และไม่ throw', async () => {
    const store = traderStore();

    getBehavioral.mockRejectedValue(forbidden());

    await expect(store.loadDetails()).resolves.toBeDefined();

    expect(store.monthlyGrowth, 'ของฟรีต้องไม่ร่วงตาม').toEqual(growthRows);
    expect(store.winRate, 'ของฟรีต้องไม่ร่วงตาม').toEqual(winRateRows);
    expect(store.behavioral).toBeNull();
    expect(store.behavioralAccessDenied).toBe(true);
  });

  it('behavioral ล้มด้วยเหตุอื่น (500) -> ยัง throw ตามเดิม ไม่กลืน error', async () => {
    const store = traderStore();

    getBehavioral.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );

    await expect(store.loadDetails()).rejects.toBeDefined();
    expect(store.behavioralAccessDenied).toBe(false);
  });

  it('monthlyGrowth ซึ่งเป็นของฟรีล้ม -> ต้อง throw ไม่กลืนเงียบ', async () => {
    const store = traderStore();

    getMonthlyGrowth.mockRejectedValue(new Error('network'));

    await expect(store.loadDetails()).rejects.toBeDefined();
  });

  it('clearDetails ล้างธง denied ด้วย', async () => {
    const store = traderStore();

    getBehavioral.mockRejectedValue(forbidden());
    await store.loadDetails();
    expect(store.behavioralAccessDenied).toBe(true);

    store.clearDetails();

    expect(store.behavioralAccessDenied).toBe(false);
  });
});

describe('AnalyticsStore.loadDetails — INVESTOR', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    getTimeline.mockResolvedValue([{ id: 1 }]);
    getAllocation.mockResolvedValue([{ symbol: 'PTT.BK', value: 100, weight: 100 }]);
  });

  it('timeline/allocation เป็นของฟรีแล้ว -> โหลดได้ ไม่ต้องมี tier', async () => {
    const store = useAnalyticsStore();

    store.portfolioId = 6;
    store.portfolioType = 'INVESTOR';

    await store.loadDetails();

    expect(store.timeline).toHaveLength(1);
    expect(store.allocation).toHaveLength(1);
    expect(store.paidAccessDenied).toBe(false);
  });
});

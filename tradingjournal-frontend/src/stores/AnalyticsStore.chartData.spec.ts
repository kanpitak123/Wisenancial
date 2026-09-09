/**
 * §3 QA bug: Portfolio/Account Growth chart's x-axis showed a raw ISO-8601 timestamp
 * (e.g. "2026-08-09T07:00:32.187Z") whenever the performance series had only one point —
 * a brand-new portfolio with no trade/record history yet gets exactly one "START" point
 * from trader-analytics.service.ts / investor-analytics.service.ts, and its `date` is
 * always a raw ISO string over the wire (JSON has no Date type). chartData.categories
 * never formatted `date` at all, for any point count — it just showed up more once a
 * single raw label was the entire x-axis instead of getting lost among many.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticsStore } from './AnalyticsStore';
import type { PerformancePoint } from '../types/analytics.types';

describe('AnalyticsStore.chartData — x-axis date labels (§3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // เวลาเที่ยงคืน UTC โดยตั้งใจ — กัน test flaky ข้ามวันตาม timezone ของเครื่องที่รัน
  // (toLocaleDateString ใช้ local timezone เหมือนจุดเรียกอื่นๆ ทั้งหมดในแอป ไม่ fix เป็น UTC)
  it('พอร์ตใหม่ (จุดเดียวคือ START) -> ป้ายเป็นวันที่อ่านง่าย ไม่ใช่ ISO-8601 ดิบ', () => {
    const store = useAnalyticsStore();
    store.performance = [
      { date: '2026-08-09T12:00:32.187Z', value: 10000, event: 'START' },
    ] as PerformancePoint[];

    const [label] = store.chartData.categories;

    expect(label).toBe('Aug 9');
    expect(label).not.toContain('T');
    expect(label).not.toContain('Z');
  });

  it('พอร์ตที่มีประวัติหลายจุด -> ทุกป้ายถูก format เหมือนกันหมด ไม่ใช่แค่จุดแรก', () => {
    const store = useAnalyticsStore();
    store.performance = [
      { date: '2026-07-01T12:00:00.000Z', value: 10000, event: 'START' },
      { date: '2026-07-15T12:32:00.000Z', value: 10200, event: 'TRADE_PNL', amount: 200 },
      { date: '2026-08-09T12:00:32.187Z', value: 10500, event: 'TRADE_PNL', amount: 300 },
    ] as PerformancePoint[];

    expect(store.chartData.categories).toEqual(['Jul 1', 'Jul 15', 'Aug 9']);
  });

  it('timeframe ALL ที่ไม่มี start -> จุดตั้งต้นเป็น "START" (ไม่ใช่วันที่) -> แสดงเป็น "START" ตรงๆ ไม่พัง', () => {
    const store = useAnalyticsStore();
    store.performance = [{ date: 'START', value: 10000, event: 'START' }] as PerformancePoint[];

    expect(store.chartData.categories).toEqual(['START']);
  });

  it('ไม่มีจุดเลย -> categories เป็น array ว่าง', () => {
    const store = useAnalyticsStore();
    store.performance = [];

    expect(store.chartData.categories).toEqual([]);
  });
});

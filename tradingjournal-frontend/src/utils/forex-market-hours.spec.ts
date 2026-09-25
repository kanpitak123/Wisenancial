import { describe, expect, it } from 'vitest';
import { isForexMarketOpen } from './forex-market-hours';

describe('isForexMarketOpen', () => {
  it('ปิดตลอดวันเสาร์', () => {
    expect(isForexMarketOpen(new Date('2026-09-26T00:00:00.000Z'))).toBe(false);
    expect(isForexMarketOpen(new Date('2026-09-26T23:59:00.000Z'))).toBe(false);
  });

  it('อาทิตย์ปิดจนถึง 22:00 UTC แล้วเปิด', () => {
    expect(isForexMarketOpen(new Date('2026-09-27T21:59:00.000Z'))).toBe(false);
    expect(isForexMarketOpen(new Date('2026-09-27T22:00:00.000Z'))).toBe(true);
  });

  it('จันทร์-พฤหัส เปิดตลอด 24 ชม.', () => {
    expect(isForexMarketOpen(new Date('2026-09-28T00:00:00.000Z'))).toBe(true);
    expect(isForexMarketOpen(new Date('2026-10-01T13:00:00.000Z'))).toBe(true);
  });

  it('ศุกร์เปิดจนถึง 22:00 UTC แล้วปิด', () => {
    expect(isForexMarketOpen(new Date('2026-10-02T21:59:00.000Z'))).toBe(true);
    expect(isForexMarketOpen(new Date('2026-10-02T22:00:00.000Z'))).toBe(false);
  });
});

/**
 * MarketDataService.getHistoricalData — เพจก่อนหน้าตอนกราฟ Stock Terminal ถูกเลื่อน
 * ย้อนหลังเกินขอบเขตที่โหลดไว้แรก (ดู qa-bug-report-2026-09-09.md §1 ฉบับแก้)
 *
 * ของเดิม period2 ยึด "ตอนนี้" เสมอ ไม่มีทางขอ "ประวัติก่อนหน้าจุดที่มีอยู่แล้ว" ได้เลย —
 * ผู้ใช้ pan กราฟย้อนหลังพ้นขอบของ range ที่โหลดมาแรกจึงเจอทางตันเสมอ ไม่ใช่บั๊ก
 * pan/zoom ของตัวไลบรารีเอง
 */
const chart = jest.fn();

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chart: (...args: unknown[]) => chart(...args),
  })),
}));

import { MarketDataService } from './market-data.service';

function quote(dateIso: string, close: number) {
  return {
    date: new Date(dateIso),
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1_000,
  };
}

describe('MarketDataService.getHistoricalData — before cursor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ไม่ส่ง before -> period2 ยังยึด "ตอนนี้" เหมือนพฤติกรรมเดิม', async () => {
    chart.mockResolvedValue({ quotes: [quote('2026-09-01', 100)] });
    const service = new MarketDataService();

    const beforeCall = Date.now();
    await service.getHistoricalData('AAPL', { range: '1mo' });
    const afterCall = Date.now();

    const [, options] = chart.mock.calls[0] as [string, { period2: Date }];
    expect(options.period2.getTime()).toBeGreaterThanOrEqual(beforeCall);
    expect(options.period2.getTime()).toBeLessThanOrEqual(afterCall);
  });

  it('ส่ง before -> period2 ยึดจุดนั้น ไม่ใช่ตอนนี้ (ไม่งั้นทุกเพจได้ช่วงเวลาเดิมซ้ำ)', async () => {
    chart.mockResolvedValue({ quotes: [quote('2026-07-01', 90)] });
    const service = new MarketDataService();
    const before = new Date('2026-08-01T00:00:00.000Z');

    await service.getHistoricalData('AAPL', { range: '1mo', before });

    const [, options] = chart.mock.calls[0] as [
      string,
      { period1: Date; period2: Date },
    ];

    expect(options.period2).toEqual(before);

    // period1 ต้องเป็น "before ย้อนไป windowDays วัน" ด้วยกลไกเดียวกับโค้ดจริง (setDate) —
    // ไม่เทียบ ms ตรงๆ เพราะ setDate อิง local timezone ไม่ใช่ UTC เป๊ะ
    const expectedPeriod1 = new Date(before);
    expectedPeriod1.setDate(expectedPeriod1.getDate() - 30);
    expect(options.period1).toEqual(expectedPeriod1);
  });

  it('ส่ง before แล้ว Yahoo ไม่มีข้อมูลเลย -> คืน [] ไม่ throw (เจอขอบเขตประวัติเก่าสุด เช่นวัน IPO)', async () => {
    chart.mockResolvedValue({ quotes: [] });
    const service = new MarketDataService();

    await expect(
      service.getHistoricalData('AAPL', {
        range: '1mo',
        before: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).resolves.toEqual([]);
  });

  it('ไม่ส่ง before แล้วไม่มีข้อมูลเลย -> ยัง throw เหมือนเดิม (พฤติกรรม default ต้องไม่เปลี่ยน)', async () => {
    chart.mockResolvedValue({ quotes: [] });
    const service = new MarketDataService();

    await expect(
      service.getHistoricalData('AAPL', { range: '1mo' }),
    ).rejects.toThrow();
  });

  it('ส่ง before -> ข้อมูลที่คืนมายังถูกแปลงร่างตามปกติ', async () => {
    chart.mockResolvedValue({
      quotes: [quote('2026-06-01', 80), quote('2026-06-02', 82)],
    });
    const service = new MarketDataService();

    const result = await service.getHistoricalData('AAPL', {
      range: '1mo',
      before: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ open: 79, close: 80 });
  });
});

/**
 * AssetsService.getChartData — before cursor (Forex/Trader chart lazy-load parity
 * with Stock's MarketDataService.getHistoricalData — see
 * forex-chart-parity-investigation.md §4/§5).
 *
 * Same intent as market-data.service.spec.ts's "before cursor" suite: period1 used to
 * be a hardcoded constant, so panning the Forex chart back past the initially-loaded
 * range always re-fetched the identical window instead of walking further back.
 */
const chart = jest.fn();

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chart: (...args: unknown[]) => chart(...args),
  })),
}));

import { PortfolioType } from '@prisma/client';
import { AssetsService } from './assets.service';

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

function makeService() {
  const prismaMock = {
    portfolios: {
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        portfolio_type: PortfolioType.TRADER,
      }),
    },
    assets: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, symbol: 'EUR/USD' }),
    },
    stocks: { findFirst: jest.fn() },
  };

  return new AssetsService(prismaMock as never);
}

describe('AssetsService.getChartData — before cursor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ไม่ส่ง before -> period1 ยังคงที่ 2023-01-01 เหมือนพฤติกรรมเดิม (ไม่ regress การโหลดครั้งแรก)', async () => {
    chart.mockResolvedValue({ quotes: [quote('2026-09-01', 1.1)] });
    const service = makeService();

    await service.getChartData(7, 1, 'EUR/USD', '1d');

    const [symbol, options] = chart.mock.calls[0] as [
      string,
      { period1: string; period2?: Date },
    ];
    expect(symbol).toBe('EURUSD=X');
    expect(options.period1).toBe('2023-01-01');
    expect(options.period2).toBeUndefined();
  });

  it('ส่ง before -> period2 ยึดจุดนั้น และ period1 เลื่อนถอยหลัง CHART_WINDOW_DAYS วัน (ไม่ใช่ช่วงเดิมซ้ำ)', async () => {
    chart.mockResolvedValue({ quotes: [quote('2022-07-01', 1.05)] });
    const service = makeService();
    const before = new Date('2022-08-01T00:00:00.000Z');

    await service.getChartData(7, 1, 'EUR/USD', '1d', before);

    const [, options] = chart.mock.calls[0] as [
      string,
      { period1: Date; period2: Date },
    ];

    expect(options.period2).toEqual(before);

    const expectedPeriod1 = new Date(before.getTime() - 365 * 24 * 60 * 60 * 1000);
    expect(options.period1).toEqual(expectedPeriod1);
  });

  it('ส่ง before แล้ว Yahoo ไม่มีข้อมูลเลย -> คืน [] (เจอขอบเขตประวัติเก่าสุด) ไม่ throw', async () => {
    chart.mockResolvedValue({ quotes: [] });
    const service = makeService();

    await expect(
      service.getChartData(
        7,
        1,
        'EUR/USD',
        '1d',
        new Date('2015-01-01T00:00:00.000Z'),
      ),
    ).resolves.toEqual([]);
  });

  it('มี before แต่เป็นพอร์ต Investor (ไม่ใช่ Trader) -> ไม่แปลง symbol เป็น Yahoo ticker (พฤติกรรมเดิม)', async () => {
    chart.mockResolvedValue({ quotes: [quote('2026-06-01', 150)] });
    const prismaMock = {
      portfolios: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 1, portfolio_type: PortfolioType.INVESTOR }),
      },
      assets: { findFirst: jest.fn() },
      stocks: { findFirst: jest.fn().mockResolvedValue({ id: 1, symbol: 'AAPL' }) },
    };
    const service = new AssetsService(prismaMock as never);

    await service.getChartData(
      7,
      1,
      'AAPL',
      '1d',
      new Date('2026-07-01T00:00:00.000Z'),
    );

    const [symbol] = chart.mock.calls[0] as [string];
    expect(symbol).toBe('AAPL');
  });
});

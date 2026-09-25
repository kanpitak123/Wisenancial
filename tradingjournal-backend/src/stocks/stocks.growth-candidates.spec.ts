/**
 * StocksService.getGrowthCandidates — รายชื่อหุ้นพร้อมตัวเลขจริงที่ป้อนให้ AI Picks
 *
 * คุมบั๊ก P1 จาก ai-prompt-audit.md: เดิม AI Picks ไม่มีข้อมูลจริงประกอบเลยแม้แต่
 * ตัวเดียว โมเดลนึกชื่อหุ้นจากความจำตอนเทรนล้วน ๆ
 *
 * โครงสร้างที่เทสชุดนี้ล็อกไว้คือ "สองขั้น" ซึ่งมีเหตุผลทางเทคนิคบังคับ:
 *   ขั้น 1 quote() ยิงเป็น batch ได้ → คัดทั้ง universe ได้ในราคาถูก
 *   ขั้น 2 quoteSummary() ยิงทีละตัวเท่านั้น (ยืนยันแล้วว่าส่ง array ไม่ได้)
 *          → ต้องคัดให้เหลือน้อยก่อนถึงจะยิงได้
 * ถ้าใครสลับลำดับสองขั้นนี้ = ยิง Yahoo ทีละตัวทั้ง universe
 */
import { Test } from '@nestjs/testing';
import { StocksService } from './stocks.service';
import {
  MarketDataService,
  type GrowthFundamental,
  type ListingMetric,
} from './market-data.service';
import { PrismaService } from '../prisma/prisma.service';

const findMany = jest.fn();
const getListingMetrics = jest.fn();
const getGrowthFundamentals = jest.fn();

function dbRow(symbol: string, exchange: string) {
  return { symbol, name: `${symbol} Co`, sector: 'Technology', exchange };
}

function metric(overrides: Partial<ListingMetric> = {}): ListingMetric {
  return {
    price: 100,
    changePercent: 1,
    marketCap: 1_000_000_000,
    peRatio: 20,
    dividendYield: null,
    volume: 500_000,
    avgDailyVolume3M: 1_000_000,
    ...overrides,
  };
}

function fundamental(
  overrides: Partial<GrowthFundamental> = {},
): GrowthFundamental {
  return {
    revenueGrowthYoY: 0.32,
    netMargin: 0.18,
    asOf: '2026-06-30',
    ...overrides,
  };
}

async function buildService() {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StocksService,
      { provide: PrismaService, useValue: { stocks: { findMany } } },
      {
        provide: MarketDataService,
        useValue: { getListingMetrics, getGrowthFundamentals },
      },
    ],
  }).compile();

  return moduleRef.get(StocksService);
}

/** ให้ทุก symbol ที่ถูกขอมามีค่าเริ่มต้นเหมือนกันหมด เว้นที่ระบุทับ */
function respondWith(
  metrics: Record<string, ListingMetric | undefined>,
  fundamentals?: Record<string, GrowthFundamental | undefined>,
) {
  getListingMetrics.mockImplementation((symbols: string[]) => {
    const out = new Map<string, ListingMetric>();
    for (const symbol of symbols) {
      const value = metrics[symbol];
      if (value) out.set(symbol, value);
    }
    return Promise.resolve(out);
  });

  getGrowthFundamentals.mockImplementation((symbols: string[]) => {
    const out = new Map<string, GrowthFundamental>();
    for (const symbol of symbols) {
      const value = fundamentals ? fundamentals[symbol] : fundamental();
      if (value) out.set(symbol, value);
    }
    return Promise.resolve(out);
  });
}

describe('StocksService.getGrowthCandidates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ขั้น 1 คัดจากทั้ง universe แต่ขั้น 2 ยิงเฉพาะตัวที่คัดแล้ว', async () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      dbRow(`S${i}`, i % 2 === 0 ? 'SET' : 'NASDAQ'),
    );
    findMany.mockResolvedValue(rows);
    respondWith(Object.fromEntries(rows.map((r) => [r.symbol, metric()])));

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    // ขั้น 1 เห็นทั้ง 40 ตัว — ไม่ได้ตัดโควตาก่อนเหมือน radar
    expect(getListingMetrics.mock.calls[0][0]).toHaveLength(40);
    // ขั้น 2 ซึ่งแพงกว่ามาก เห็นแค่ 12
    expect(getGrowthFundamentals.mock.calls[0][0]).toHaveLength(12);
    expect(result).toHaveLength(12);
  });

  it('แบ่งโควตาไทย/global เท่ากัน ฝั่งที่หุ้นเยอะกว่าไม่กินโควตาหมด', async () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => dbRow(`G${i}`, 'NASDAQ')),
      ...Array.from({ length: 8 }, (_, i) => dbRow(`T${i}.BK`, 'SET')),
    ];
    findMany.mockResolvedValue(rows);
    respondWith(Object.fromEntries(rows.map((r) => [r.symbol, metric()])));

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    const thai = result.filter((c) => c.exchange === 'SET');
    expect(thai).toHaveLength(6);
    expect(result).toHaveLength(12);
  });

  it('ฝั่งไทยมีไม่พอ -> global มาเติมจนเต็มลิสต์ ไม่ปล่อยให้ candidate บาง', async () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => dbRow(`G${i}`, 'NASDAQ')),
      dbRow('ONE.BK', 'SET'),
    ];
    findMany.mockResolvedValue(rows);
    respondWith(Object.fromEntries(rows.map((r) => [r.symbol, metric()])));

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    expect(result).toHaveLength(12);
    expect(result.filter((c) => c.exchange === 'SET')).toHaveLength(1);
  });

  it('เรียงตามสภาพคล่องจริง ไม่ใช่ตามลำดับตัวอักษรใน DB', async () => {
    const rows = [
      dbRow('QUIET', 'NASDAQ'),
      dbRow('BUSY', 'NASDAQ'),
      dbRow('MID', 'NASDAQ'),
    ];
    findMany.mockResolvedValue(rows);
    respondWith({
      QUIET: metric({ avgDailyVolume3M: 1_000 }),
      BUSY: metric({ avgDailyVolume3M: 90_000_000 }),
      MID: metric({ avgDailyVolume3M: 500_000 }),
    });

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    expect(result.map((c) => c.symbol)).toEqual(['BUSY', 'MID', 'QUIET']);
  });

  /**
   * ไม่มีราคา = Yahoo quote ตัวนั้นไม่ได้ ซื้อขายจริงไม่ได้ ไม่ควรไปโผล่ในรายการ
   * ที่ผู้ใช้เห็นว่า "AI แนะนำ"
   */
  it('หุ้นที่ Yahoo ไม่มีราคาให้ -> ตัดออกตั้งแต่ขั้น 1 ไม่เสีย request ขั้น 2', async () => {
    findMany.mockResolvedValue([
      dbRow('GOOD', 'NASDAQ'),
      dbRow('DEAD', 'NASDAQ'),
      dbRow('UNKNOWN', 'NASDAQ'),
    ]);
    respondWith({
      GOOD: metric(),
      DEAD: metric({ price: 0 }),
      // UNKNOWN ไม่อยู่ใน map เลย = Yahoo quote ไม่ได้
    });

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    expect(result.map((c) => c.symbol)).toEqual(['GOOD']);
    expect(getGrowthFundamentals).toHaveBeenCalledWith(['GOOD']);
  });

  it('หา fundamentals ไม่เจอ -> ค่าเป็น null ไม่ crash และไม่แต่งตัวเลขขึ้นมา', async () => {
    findMany.mockResolvedValue([
      dbRow('HASDATA', 'NASDAQ'),
      dbRow('NODATA', 'NASDAQ'),
    ]);
    respondWith(
      { HASDATA: metric(), NODATA: metric() },
      { HASDATA: fundamental() },
    );

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    const noData = result.find((c) => c.symbol === 'NODATA');
    expect(noData?.metrics.revenueGrowthYoY).toBeNull();
    expect(noData?.metrics.netMargin).toBeNull();
    expect(noData?.asOf).toBeNull();
    // ราคา/P-E มาจากขั้น 1 จึงยังมีอยู่
    expect(noData?.metrics.currentPrice).toBe(100);
  });

  it('ต่อ DB ไม่ได้ -> ใช้ seed list แทน ไม่คืนลิสต์ว่าง', async () => {
    findMany.mockRejectedValue(new Error('db down'));
    getListingMetrics.mockImplementation((symbols: string[]) =>
      Promise.resolve(new Map(symbols.map((symbol) => [symbol, metric()]))),
    );
    getGrowthFundamentals.mockImplementation((symbols: string[]) =>
      Promise.resolve(
        new Map(symbols.map((symbol) => [symbol, fundamental()])),
      ),
    );

    const service = await buildService();
    const result = await service.getGrowthCandidates(12);

    expect(result.length).toBeGreaterThan(0);
  });
});

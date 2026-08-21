/**
 * StocksService.getRadar — เลือกหุ้นจากตาราง stocks ไม่ใช่ลิสต์ตายตัวในโค้ด
 *
 * เดิม getRadar() วนบน LISTING_SEED (27 ตัว, ไทย 8) ตายตัว หุ้นที่ seed เพิ่มเข้า DB
 * จึงไม่เคยโผล่ในฟีดเลย เทสนี้ล็อกพฤติกรรมใหม่ไว้สามข้อ:
 *   1) อ่านจาก DB จริง
 *   2) จำกัดจำนวนต่อฝั่งตลาด (ยิง Yahoo หนึ่งครั้ง/หุ้น และไม่มีแคช)
 *   3) แบ่งโควตาสองฝั่งเท่ากัน ฝั่งที่หุ้นเยอะกว่าต้องไม่กินโควตาไปหมด
 */
import { Test } from '@nestjs/testing';
import { StocksService } from './stocks.service';
import { MarketDataService } from './market-data.service';
import { PrismaService } from '../prisma/prisma.service';

const findMany = jest.fn();
const getHistoricalData = jest.fn();

/** ราคาย้อนหลังปลอมที่พอให้ buildRadarEntry คำนวณผ่าน (ต้องมีอย่างน้อย 2 จุด) */
function history() {
  return [
    { date: '2026-07-21', close: 100 },
    { date: '2026-08-01', close: 104 },
    { date: '2026-08-20', close: 112 },
  ];
}

function dbRow(symbol: string, exchange: string) {
  return { symbol, name: `${symbol} Co`, sector: 'Technology', exchange };
}

async function buildService() {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StocksService,
      { provide: PrismaService, useValue: { stocks: { findMany } } },
      { provide: MarketDataService, useValue: { getHistoricalData } },
    ],
  }).compile();

  return moduleRef.get(StocksService);
}

describe('StocksService.getRadar — universe selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getHistoricalData.mockResolvedValue(history());
  });

  it('ดึงหุ้นจาก DB ไม่ใช่ลิสต์ตายตัวในโค้ด', async () => {
    findMany.mockResolvedValue([dbRow('SEEDED.BK', 'SET'), dbRow('ONLYDB', 'NASDAQ')]);

    const service = await buildService();
    const result = await service.getRadar();

    expect(findMany).toHaveBeenCalled();
    expect(result.map((r) => r.symbol).sort()).toEqual(['ONLYDB', 'SEEDED.BK']);
  });

  it('หุ้นไทยที่เพิ่ง seed เข้ามาต้องมีสิทธิ์โผล่ในฟีด', async () => {
    // TIDLOR/COM7 เป็นตัวที่เพิ่งเติมเข้า seed-stocks.ts รอบนี้
    findMany.mockResolvedValue([
      dbRow('TIDLOR.BK', 'SET'),
      dbRow('COM7.BK', 'SET'),
      dbRow('AAPL', 'NASDAQ'),
    ]);

    const service = await buildService();
    const symbols = (await service.getRadar()).map((r) => r.symbol);

    expect(symbols).toContain('TIDLOR.BK');
    expect(symbols).toContain('COM7.BK');
  });

  it('จำกัดจำนวนต่อฝั่งตลาด ไม่ยิง Yahoo ครบทั้ง universe', async () => {
    // 120 ไทย + 120 เทศ = 240 ตัวใน DB
    findMany.mockResolvedValue([
      ...Array.from({ length: 120 }, (_, i) => dbRow(`TH${i}.BK`, 'SET')),
      ...Array.from({ length: 120 }, (_, i) => dbRow(`US${i}`, 'NASDAQ')),
    ]);

    const service = await buildService();
    const result = await service.getRadar();

    expect(result.length).toBeLessThanOrEqual(40);
    expect(getHistoricalData).toHaveBeenCalledTimes(result.length);
    expect(getHistoricalData.mock.calls.length).toBeLessThan(240);
  });

  it('แบ่งโควตาเท่ากันสองฝั่ง แม้ฝั่งหนึ่งจะมีหุ้นมากกว่ามาก', async () => {
    findMany.mockResolvedValue([
      ...Array.from({ length: 5 }, (_, i) => dbRow(`TH${i}.BK`, 'SET')),
      ...Array.from({ length: 200 }, (_, i) => dbRow(`US${i}`, 'NASDAQ')),
    ]);

    const service = await buildService();
    const symbols = (await service.getRadar()).map((r) => r.symbol);
    const thai = symbols.filter((s) => s.endsWith('.BK'));

    // ไทยมีแค่ 5 ตัวก็ต้องได้ครบ 5 — ไม่ถูกฝั่งเทศ 200 ตัวเบียดหายไป
    expect(thai).toHaveLength(5);
    expect(symbols.length - thai.length).toBeGreaterThan(0);
  });

  it('เลือกแบบกระจายทั้งลิสต์ ไม่ใช่ตัดหัวมาเรียงตามตัวอักษร', async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => dbRow(`US${String(i).padStart(3, '0')}`, 'NASDAQ')),
    );

    const service = await buildService();
    const symbols = (await service.getRadar()).map((r) => r.symbol);

    // ถ้าเป็น slice(0, n) จะได้ US000..US017 ติดกันหมด
    expect(symbols).toContain('US000');
    expect(symbols.some((s) => Number(s.replace('US', '')) > 80)).toBe(true);
  });

  it('DB ว่าง -> ถอยไปใช้ลิสต์ในโค้ด ไม่ใช่คืนฟีดเปล่า', async () => {
    findMany.mockResolvedValue([]);

    const service = await buildService();
    const result = await service.getRadar();

    expect(result.length).toBeGreaterThan(0);
  });

  it('DB ล้ม -> ยังไม่ throw ออกไปหาหน้าเว็บ', async () => {
    findMany.mockRejectedValue(new Error('connection refused'));

    const service = await buildService();

    await expect(service.getRadar()).resolves.toEqual(expect.any(Array));
  });
});

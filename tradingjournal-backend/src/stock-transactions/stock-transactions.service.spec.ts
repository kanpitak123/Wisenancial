import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { StockTransactionsService } from './stock-transactions.service';

const prismaMock = {
  portfolios: { findFirst: jest.fn() },
  stock_purchases: { findMany: jest.fn() },
};

const recordsMock = { createSystem: jest.fn() };

function lot(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    remaining_shares: new Prisma.Decimal(10),
    purchase_price: new Prisma.Decimal(100),
    fees: new Prisma.Decimal(0),
    shares_count: new Prisma.Decimal(10),
    purchase_date: new Date('2026-01-01'),
    currency: 'USD',
    ...overrides,
  };
}

describe('StockTransactionsService.previewSell', () => {
  let service: StockTransactionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTransactionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RecordsService, useValue: recordsMock },
      ],
    }).compile();

    service = module.get<StockTransactionsService>(StockTransactionsService);
  });

  it('ปฏิเสธถ้า portfolio ไม่ใช่ของ user นี้ หรือไม่ใช่ INVESTOR', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue(null);

    await expect(
      service.previewSell(1, 999, { stock_symbol: 'AAPL', shares_count: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('FIFO: การขายที่ครอบคลุมหลาย lot ต้องดึงจาก lot เก่าสุดก่อน จนกว่าจะครบ ไม่ใช่แค่ lot ที่ผู้ใช้กด sell', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      currency: 'USD',
      investor_cost_method: 'FIFO',
    });
    // ผู้ใช้อาจกด "sell" จาก lot #2 (ซื้อทีหลัง) แต่ FIFO ต้องตัด lot #1 (เก่าสุด) ก่อนเสมอ
    const lots = [
      lot({
        id: 1,
        purchase_date: new Date('2026-01-01'),
        remaining_shares: new Prisma.Decimal(5),
      }),
      lot({
        id: 2,
        purchase_date: new Date('2026-02-01'),
        remaining_shares: new Prisma.Decimal(10),
      }),
    ];
    prismaMock.stock_purchases.findMany.mockResolvedValue(lots);

    const result = await service.previewSell(1, 1, {
      stock_symbol: 'aapl',
      shares_count: 8,
    });

    expect(result.cost_method).toBe('FIFO');
    expect(result.available_shares).toBe(15);
    expect(result.insufficient).toBe(false);
    // ต้องกิน lot #1 จนหมด (5 หุ้น) ก่อน แล้วค่อยไปกิน lot #2 อีก 3 หุ้น — ครอบคลุม 2 lots ไม่ใช่ lot เดียว
    expect(result.allocations).toEqual([
      expect.objectContaining({
        purchase_id: 1,
        shares: 5,
        fully_closes_lot: true,
      }),
      expect.objectContaining({
        purchase_id: 2,
        shares: 3,
        fully_closes_lot: false,
      }),
    ]);
  });

  it('LIFO: ต้องดึงจาก lot ใหม่สุดก่อน (order กลับกับ FIFO)', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      currency: 'USD',
      investor_cost_method: 'FIFO',
    });
    const lots = [
      lot({
        id: 2,
        purchase_date: new Date('2026-02-01'),
        remaining_shares: new Prisma.Decimal(10),
      }),
      lot({
        id: 1,
        purchase_date: new Date('2026-01-01'),
        remaining_shares: new Prisma.Decimal(5),
      }),
    ];
    prismaMock.stock_purchases.findMany.mockResolvedValue(lots);

    const result = await service.previewSell(1, 1, {
      stock_symbol: 'AAPL',
      shares_count: 8,
      cost_method: 'LIFO',
    });

    expect(result.cost_method).toBe('LIFO');
    expect(result.allocations).toEqual([
      expect.objectContaining({
        purchase_id: 2,
        shares: 8,
        fully_closes_lot: false,
      }),
    ]);
    expect(prismaMock.stock_purchases.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ purchase_date: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('AVERAGE: กระจายสัดส่วนตาม remaining_shares ของแต่ละ lot', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      currency: 'USD',
      investor_cost_method: 'FIFO',
    });
    const lots = [
      lot({ id: 1, remaining_shares: new Prisma.Decimal(10) }),
      lot({ id: 2, remaining_shares: new Prisma.Decimal(30) }),
    ];
    prismaMock.stock_purchases.findMany.mockResolvedValue(lots);

    const result = await service.previewSell(1, 1, {
      stock_symbol: 'AAPL',
      shares_count: 8,
      cost_method: 'AVERAGE',
    });

    expect(result.allocations).toHaveLength(2);
    // สัดส่วน 10:30 ของ 8 หุ้น -> ~2 กับ ~6 (lot สุดท้ายรับส่วนที่เหลือพอดีกันปัดเศษ)
    const total = result.allocations.reduce((sum, a) => sum + a.shares, 0);
    expect(total).toBeCloseTo(8, 6);
  });

  it('ถ้าจำนวนที่ขอเกินกว่าที่มี ต้อง flag insufficient=true และ cap allocation ไว้ที่ available (ไม่ throw เพราะเป็น preview)', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      currency: 'USD',
      investor_cost_method: 'FIFO',
    });
    prismaMock.stock_purchases.findMany.mockResolvedValue([
      lot({ id: 1, remaining_shares: new Prisma.Decimal(3) }),
    ]);

    const result = await service.previewSell(1, 1, {
      stock_symbol: 'AAPL',
      shares_count: 100,
    });

    expect(result.insufficient).toBe(true);
    expect(result.available_shares).toBe(3);
    expect(result.requested_shares).toBe(100);
    expect(result.allocations).toEqual([
      expect.objectContaining({ purchase_id: 1, shares: 3 }),
    ]);
  });

  it('ไม่มี lot เปิดอยู่เลยสำหรับ symbol นี้ -> allocations ว่าง ไม่ throw', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      currency: 'USD',
      investor_cost_method: 'FIFO',
    });
    prismaMock.stock_purchases.findMany.mockResolvedValue([]);

    const result = await service.previewSell(1, 1, {
      stock_symbol: 'AAPL',
      shares_count: 5,
    });

    expect(result.allocations).toEqual([]);
    expect(result.available_shares).toBe(0);
    expect(result.insufficient).toBe(true);
  });
});

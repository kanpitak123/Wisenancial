import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MarketService } from '../market/market.service';
import { StockPurchasesService } from './stock-purchases.service';

const prismaMock = {
  portfolios: { findFirst: jest.fn() },
  stock_purchases: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

// เดิม spec นี้ไม่ได้ provide MarketService ทั้งที่ service ฉีดเข้ามาใน constructor
// -> DI พังตั้งแต่ compile() ทำให้ทั้งไฟล์ fail มาตลอด
const marketMock = {
  getQuotes: jest.fn().mockResolvedValue({}),
};

const lot = (over: Record<string, unknown> = {}) => ({
  id: 1,
  portfolio_id: 10,
  stock_symbol: 'NVDA',
  shares_count: '100',
  remaining_shares: '100',
  purchase_price: '120.5',
  ...over,
});

describe('StockPurchasesService', () => {
  let service: StockPurchasesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockPurchasesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MarketService, useValue: marketMock },
      ],
    }).compile();

    service = module.get<StockPurchasesService>(StockPurchasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject non-owned investor portfolio', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue(null);

    await expect(service.findAll(1, 99)).rejects.toThrow(
      'ไม่พบ Investor portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
    );
  });

  // ── PATCH /stock-purchases/:id ─────────────────────────────────────────────
  describe('update', () => {
    it('lot ของคนอื่น -> 404 ไม่ให้แก้ข้ามบัญชี', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(null);

      await expect(
        service.update(1, 99, { notes: 'hack' }),
      ).rejects.toThrow('ไม่พบรายการซื้อหุ้น หรือคุณไม่มีสิทธิ์เข้าถึง');

      expect(prismaMock.stock_purchases.update).not.toHaveBeenCalled();
    });

    it('แก้เฉพาะฟิลด์ที่ส่งมา ไม่ไปแตะฟิลด์อื่น', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(lot());
      prismaMock.stock_purchases.update.mockResolvedValue(lot());

      await service.update(1, 7, { notes: 'ถือยาว', strategy: 'DCA' });

      expect(prismaMock.stock_purchases.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { notes: 'ถือยาว', strategy: 'DCA' },
      });
    });

    it('ส่ง null มาเพื่อล้าง TP/SL ได้ (ใช้ตอนปิดสวิตช์แจ้งเตือนราคา)', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(lot());
      prismaMock.stock_purchases.update.mockResolvedValue(lot());

      await service.update(1, 7, {
        target_price: undefined,
        stop_loss: undefined,
      });

      expect(prismaMock.stock_purchases.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { target_price: null, stop_loss: null },
      });
    });

    it('ไม่ส่งอะไรมาเลย -> ไม่เขียนทับฟิลด์ไหนทั้งนั้น', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(lot());
      prismaMock.stock_purchases.update.mockResolvedValue(lot());

      await service.update(1, 7, {});

      expect(prismaMock.stock_purchases.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {},
      });
    });
  });

  // ── DELETE /stock-purchases/:id ────────────────────────────────────────────
  describe('remove', () => {
    it('lot ที่ยังไม่เคยขาย -> ลบได้', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(
        lot({ shares_count: '100', remaining_shares: '100' }),
      );
      prismaMock.stock_purchases.delete.mockResolvedValue(lot());

      const result = await service.remove(1, 7);

      expect(prismaMock.stock_purchases.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result.id).toBe(1);
    });

    it('ขายไปแล้วบางส่วน -> 409 และต้องไม่ลบ', async () => {
      // ลบทิ้งตอนนี้ = stock_sale_allocations ชี้ไป lot ที่ไม่มีอยู่
      // และ current_balance ของพอร์ตขยับไปตามเงินที่ได้จากการขายไปแล้ว
      prismaMock.stock_purchases.findFirst.mockResolvedValue(
        lot({ shares_count: '100', remaining_shares: '40' }),
      );

      await expect(service.remove(1, 7)).rejects.toThrow(
        'ลบไม่ได้เพราะขายหุ้นล็อตนี้ไปแล้ว 60 หุ้น',
      );

      expect(prismaMock.stock_purchases.delete).not.toHaveBeenCalled();
    });

    it('ขายหมดทั้ง lot -> ก็ยังลบไม่ได้', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(
        lot({ shares_count: '100', remaining_shares: '0' }),
      );

      await expect(service.remove(1, 7)).rejects.toThrow(
        'ลบไม่ได้เพราะขายหุ้นล็อตนี้ไปแล้ว 100 หุ้น',
      );

      expect(prismaMock.stock_purchases.delete).not.toHaveBeenCalled();
    });

    it('lot ของคนอื่น -> 404 ไม่ให้ลบข้ามบัญชี', async () => {
      prismaMock.stock_purchases.findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 99)).rejects.toThrow(
        'ไม่พบรายการซื้อหุ้น หรือคุณไม่มีสิทธิ์เข้าถึง',
      );

      expect(prismaMock.stock_purchases.delete).not.toHaveBeenCalled();
    });
  });
});

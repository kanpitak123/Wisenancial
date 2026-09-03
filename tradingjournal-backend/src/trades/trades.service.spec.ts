import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { PnlCalculatorService } from './pnl-calculator.service';
import { TradesService } from './trades.service';

const prismaMock = {
  portfolios: { findFirst: jest.fn() },
  trades: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const recordsMock = {
  createSystem: jest.fn(),
};

describe('TradesService', () => {
  let service: TradesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          TradesService,
          PnlCalculatorService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: RecordsService, useValue: recordsMock },
        ],
      }).compile();

    service = module.get<TradesService>(TradesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject non-owned trader portfolio', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue(null);

    await expect(
      service.findAllByPortfolio(1, 99),
    ).rejects.toThrow(
      'ไม่พบพอร์ตเทรดนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
    );
  });

  describe('updateOpenTrade', () => {
    function tradeRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 1,
        user_id: 1,
        portfolio_id: 3,
        broker_connection_id: null,
        source: 'MANUAL',
        pair: 'XAUUSD',
        trade_type: 'BUY',
        result_status: 'OPEN',
        raw_data: {},
        ...overrides,
      };
    }

    it('ปฏิเสธการแก้ field การเงิน (เช่น volume) ถ้าไม้ปิดไปแล้ว', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ result_status: 'WIN' }));

      await expect(service.updateOpenTrade(1, 1, { volume: 0.5 })).rejects.toThrow(
        'แก้ไขข้อมูลการเงิน/ตัวตนของไม้ได้เฉพาะออเดอร์ที่ยังเปิดอยู่',
      );
      expect(prismaMock.trades.update).not.toHaveBeenCalled();
    });

    it('อนุญาตแก้ field การเงินถ้าไม้ยัง OPEN อยู่ (พฤติกรรมเดิม)', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ result_status: 'OPEN' }));
      prismaMock.trades.update.mockResolvedValue(tradeRow());

      await service.updateOpenTrade(1, 1, { volume: 0.5 });

      expect(prismaMock.trades.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ volume: expect.anything() }) }),
      );
    });

    it('อนุญาตแก้ field บันทึก (strategy/note/sl/tp) แม้ไม้ปิดไปแล้ว — ความสามารถใหม่สำหรับไม้ MT5 ที่ sync เข้ามาแล้วปิดไปแล้ว', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(
        tradeRow({ source: 'MT5_SYNC', result_status: 'WIN' }),
      );
      prismaMock.trades.update.mockResolvedValue(tradeRow());

      await service.updateOpenTrade(1, 1, {
        strategy: 'breakout',
        note: 'good entry',
        stop_loss: 2300,
        take_profit: 2450,
      });

      expect(prismaMock.trades.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ strategy: 'breakout', note: 'good entry' }),
        }),
      );
      const updateCall = prismaMock.trades.update.mock.calls[0]![0] as { data: Record<string, unknown> };
      // sl/tp เป็น risk annotation ไม่ใช่ field การเงินที่กระทบ pnl — แก้ได้แม้ไม้ปิดแล้ว
      expect(updateCall.data).toHaveProperty('stop_loss');
      expect(updateCall.data).toHaveProperty('take_profit');
      // ต้องไม่แตะ field การเงินที่กระทบ pnl/records เลยตอนแก้แค่บันทึก
      expect(updateCall.data).not.toHaveProperty('volume');
      expect(updateCall.data).not.toHaveProperty('open_price');
      expect(updateCall.data).not.toHaveProperty('pair');
    });

    it('บล็อกทันทีที่มี field การเงินแม้จะส่ง field บันทึกมาด้วยพร้อมกัน', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ result_status: 'LOSS' }));

      await expect(
        service.updateOpenTrade(1, 1, { note: 'try to sneak in a price edit', open_price: 999 }),
      ).rejects.toThrow('แก้ไขข้อมูลการเงิน/ตัวตนของไม้ได้เฉพาะออเดอร์ที่ยังเปิดอยู่');
      expect(prismaMock.trades.update).not.toHaveBeenCalled();
    });
  });
});

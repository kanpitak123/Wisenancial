import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { PnlCalculatorService } from './pnl-calculator.service';
import { TradesService } from './trades.service';

const txMock = {
  trades: { delete: jest.fn() },
};

const prismaMock = {
  portfolios: { findFirst: jest.fn() },
  trades: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
};

const recordsMock = {
  createSystem: jest.fn(),
  reverseSystem: jest.fn(),
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

  describe('remove', () => {
    function tradeRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 1,
        user_id: 1,
        portfolio_id: 3,
        broker_connection_id: null,
        source: 'MANUAL',
        pair: 'XAUUSD',
        trade_type: 'BUY',
        result_status: 'WIN',
        raw_data: {},
        ...overrides,
      };
    }

    it('ลบไม้ manual ที่ปิดแล้วได้ และ reverse Cash Record ที่ผูกอยู่', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ source: 'MANUAL' }));
      recordsMock.reverseSystem.mockResolvedValue({ id: 99 });

      const result = await service.remove(1, 1);

      expect(recordsMock.reverseSystem).toHaveBeenCalledWith(
        3,
        'TRADE',
        1,
        'TRADE_PNL',
        expect.any(String),
        txMock,
      );
      expect(txMock.trades.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual({ message: 'ลบรายการเทรดสำเร็จ', deleted_id: 1 });
    });

    it('ลบไม้ CSV import ที่ปิดแล้วได้ และ reverse Cash Record ที่ผูกอยู่', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ source: 'IMPORT' }));
      recordsMock.reverseSystem.mockResolvedValue({ id: 100 });

      const result = await service.remove(1, 1);

      expect(recordsMock.reverseSystem).toHaveBeenCalled();
      expect(txMock.trades.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.deleted_id).toBe(1);
    });

    it('ไม่มี Active Record ผูกอยู่ (ข้อมูลเก่า) ก็ยังลบไม้ manual/import ที่ปิดแล้วได้ตามปกติ', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ source: 'MANUAL' }));
      recordsMock.reverseSystem.mockRejectedValue(new NotFoundException('ไม่พบ Active Record ของรายการต้นทาง'));

      const result = await service.remove(1, 1);

      expect(txMock.trades.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.deleted_id).toBe(1);
    });

    it('ปฏิเสธการลบไม้ที่ sync มาจาก broker (MT5_SYNC) แม้ปิดแล้ว', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ source: 'MT5_SYNC' }));

      await expect(service.remove(1, 1)).rejects.toThrow(
        'ไม่สามารถลบไม้ที่ sync มาจาก broker ได้โดยตรง หากต้องการนำออก กรุณายกเลิกการเชื่อมต่อ broker แทน',
      );
      expect(txMock.trades.delete).not.toHaveBeenCalled();
      expect(recordsMock.reverseSystem).not.toHaveBeenCalled();
    });

    it('อนุญาตลบไม้ OPEN ได้ตามปกติ (พฤติกรรมเดิม ไม่ต้อง reverse Cash Record)', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ result_status: 'OPEN' }));
      prismaMock.trades.delete.mockResolvedValue(tradeRow({ result_status: 'OPEN' }));

      const result = await service.remove(1, 1);

      expect(prismaMock.trades.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(recordsMock.reverseSystem).not.toHaveBeenCalled();
      expect(result.deleted_id).toBe(1);
    });

    it('ปฏิเสธการลบไม้ของ user คนอื่น', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(null);

      await expect(service.remove(1, 999)).rejects.toThrow(
        'ไม่พบรายการเทรด หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
      expect(txMock.trades.delete).not.toHaveBeenCalled();
      expect(prismaMock.trades.delete).not.toHaveBeenCalled();
    });

    it('atomicity: reverse + delete อยู่ใน $transaction เดียวกัน (tx client เดียวกันทั้งคู่) ด้วย isolation level Serializable — ถ้า delete ล้มเหลวหลัง reverse สำเร็จ ทั้งคู่ต้อง rollback', async () => {
      prismaMock.trades.findFirst.mockResolvedValue(tradeRow({ source: 'MANUAL' }));
      recordsMock.reverseSystem.mockResolvedValue({ id: 99 });
      txMock.trades.delete.mockRejectedValueOnce(new Error('DB connection dropped mid-delete'));

      // reverseSystem ถูกเรียกด้วย `tx` (ตัวเดียวกับที่ $transaction ส่งให้ callback) ไม่ใช่ prisma root client —
      // นี่คือสิ่งที่ทำให้ reverse + delete เป็น atomic operation เดียวกันจริง: ถ้า delete throw ภายใน callback,
      // Prisma จะไม่ COMMIT อะไรเลยทั้งการ reverse record และการลบไม้ (Postgres rolls back the whole interactive
      // transaction) แม้ reverseSystem จะ resolve สำเร็จไปแล้วก่อนหน้าก็ตาม — unit test นี้ยืนยันว่า error จาก
      // ครึ่งหลังของ callback ยัง propagate ออกมาเป็น rejection ของทั้ง remove() ไม่ใช่ silently swallowed
      await expect(service.remove(1, 1)).rejects.toThrow('DB connection dropped mid-delete');

      expect(recordsMock.reverseSystem).toHaveBeenCalledWith(
        3,
        'TRADE',
        1,
        'TRADE_PNL',
        expect.any(String),
        txMock,
      );
      const transactionCall = prismaMock.$transaction.mock.calls[0] as unknown[];
      expect(transactionCall[1]).toEqual(
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
    });

    it('double-delete: ลบไม้ตัวเดิมซ้ำ (double-click/retry) ต้อง throw NotFoundException (404) สะอาดๆ โดยไม่แตะ reverseSystem/balance ซ้ำ', async () => {
      // ครั้งแรก: ลบสำเร็จตามปกติ
      prismaMock.trades.findFirst.mockResolvedValueOnce(tradeRow({ source: 'MANUAL' }));
      recordsMock.reverseSystem.mockResolvedValue({ id: 99 });
      const first = await service.remove(1, 1);
      expect(first.deleted_id).toBe(1);
      expect(recordsMock.reverseSystem).toHaveBeenCalledTimes(1);

      // ครั้งที่สอง (double-click/retry): แถวถูกลบไปแล้วจริงใน DB จึง findFirst คืน null —
      // findOwnedTrade ต้อง reject ด้วย NotFoundException (map เป็น HTTP 404 โดย Nest) ก่อนถึง reverseSystem/delete เลย
      prismaMock.trades.findFirst.mockResolvedValueOnce(null);

      const secondAttempt = service.remove(1, 1);
      await expect(secondAttempt).rejects.toThrow(NotFoundException);
      await expect(secondAttempt).rejects.toThrow(
        'ไม่พบรายการเทรด หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
      // ยังคงถูกเรียกแค่ 1 ครั้งจากการลบครั้งแรกเท่านั้น — ครั้งที่สองไม่แตะ reverse/balance เลย
      expect(recordsMock.reverseSystem).toHaveBeenCalledTimes(1);
    });
  });
});

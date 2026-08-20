import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

/**
 * เดิมไฟล์นี้เป็น scaffold ที่ `nest g` สร้างให้แล้วไม่เคยถูกเติม — providers มีแต่
 * GoalsService เปล่าๆ ไม่ได้ provide PrismaService ที่ constructor ต้องใช้
 * DI จึงพังตั้งแต่ compile() ทำให้ทั้งไฟล์ fail มาตลอด
 *
 * เติม mock ให้ครบแล้วใส่เคสจริงแทน toBeDefined() เปล่าๆ — จุดที่คุ้มที่สุดของ service
 * นี้คือด่านเช็คสิทธิ์ ทั้ง getGoal และ setGoal ต้องไม่ยอมให้แตะพอร์ตของคนอื่น
 */
const prismaMock = {
  portfolios: { findFirst: jest.fn() },
  goals: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('GoalsService', () => {
  let service: GoalsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGoal', () => {
    it('พอร์ตไม่ใช่ของผู้ใช้คนนี้ -> ปฏิเสธ ไม่อ่านเป้าหมายต่อ', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue(null);

      await expect(service.getGoal(99, 1, 2026, 8)).rejects.toThrow(
        'ไม่มีสิทธิ์เข้าถึง',
      );

      expect(prismaMock.goals.findFirst).not.toHaveBeenCalled();
    });

    it('ยังไม่เคยตั้งเป้าเดือนนี้ -> คืน 0 ไม่ใช่ null', async () => {
      // หน้าบ้านเอาไปคำนวณ % ความคืบหน้าต่อ ถ้าได้ null จะกลายเป็น NaN
      prismaMock.portfolios.findFirst.mockResolvedValue({ id: 1 });
      prismaMock.goals.findFirst.mockResolvedValue(null);

      await expect(service.getGoal(7, 1, 2026, 8)).resolves.toBe(0);
    });

    it('มีเป้าอยู่แล้ว -> คืนเป็นตัวเลข ไม่ใช่ Decimal ของ Prisma', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue({ id: 1 });
      prismaMock.goals.findFirst.mockResolvedValue({ target_profit: '1500.50' });

      const result = await service.getGoal(7, 1, 2026, 8);

      expect(result).toBe(1500.5);
      expect(typeof result).toBe('number');
    });
  });

  describe('setGoal', () => {
    it('พอร์ตไม่ใช่ของผู้ใช้คนนี้ -> ปฏิเสธ ไม่เขียนอะไรลง DB', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue(null);

      await expect(service.setGoal(99, 1, 2026, 8, 5000)).rejects.toThrow(
        'ไม่มีสิทธิ์เข้าถึง',
      );

      expect(prismaMock.goals.create).not.toHaveBeenCalled();
      expect(prismaMock.goals.update).not.toHaveBeenCalled();
    });

    it('ยังไม่มีเป้าของเดือนนั้น -> สร้างใหม่', async () => {
      prismaMock.portfolios.findFirst.mockResolvedValue({ id: 1 });
      prismaMock.goals.findFirst.mockResolvedValue(null);
      prismaMock.goals.create.mockResolvedValue({ id: 10 });

      await service.setGoal(7, 1, 2026, 8, 5000);

      expect(prismaMock.goals.create).toHaveBeenCalled();
      expect(prismaMock.goals.update).not.toHaveBeenCalled();
    });

    it('มีเป้าเดือนนั้นอยู่แล้ว -> อัปเดตของเดิม ไม่สร้างซ้ำ', async () => {
      // ตั้งเป้าเดือนเดิมซ้ำแล้วได้สองแถวคือบั๊กที่หา
      prismaMock.portfolios.findFirst.mockResolvedValue({ id: 1 });
      prismaMock.goals.findFirst.mockResolvedValue({ id: 42 });
      prismaMock.goals.update.mockResolvedValue({ id: 42 });

      await service.setGoal(7, 1, 2026, 8, 5000);

      expect(prismaMock.goals.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 42 } }),
      );
      expect(prismaMock.goals.create).not.toHaveBeenCalled();
    });
  });
});

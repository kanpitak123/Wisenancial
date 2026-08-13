import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
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

describe('StockPurchasesService', () => {
  let service: StockPurchasesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          StockPurchasesService,
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service = module.get<StockPurchasesService>(
      StockPurchasesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject non-owned investor portfolio', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue(null);

    await expect(
      service.findAll(1, 99),
    ).rejects.toThrow(
      'ไม่พบพอร์ตลงทุนนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
    );
  });
});

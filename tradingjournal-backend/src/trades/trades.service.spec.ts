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
});

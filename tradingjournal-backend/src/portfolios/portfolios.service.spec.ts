import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from './portfolios.service';

const prismaMock = {
  portfolios: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  trades: { count: jest.fn() },
  trade_imports: { count: jest.fn() },
  goals: { count: jest.fn() },
  stock_purchases: { count: jest.fn() },
  records: { count: jest.fn() },
  dividends: { count: jest.fn() },
  watchlist: { count: jest.fn() },
  $transaction: jest.fn(),
};

describe('PortfoliosService', () => {
  let service: PortfoliosService;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (input: unknown) => {
        if (typeof input === 'function') {
          return input(prismaMock);
        }
        return Promise.all(input as Promise<unknown>[]);
      },
    );

    const module: TestingModule =
      await Test.createTestingModule({
        providers: [
          PortfoliosService,
          {
            provide: PrismaService,
            useValue: prismaMock,
          },
        ],
      }).compile();

    service = module.get<PortfoliosService>(
      PortfoliosService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should filter portfolios by owner and type', async () => {
    prismaMock.portfolios.findMany.mockResolvedValue([]);

    await service.findAll(10, PortfolioType.TRADER);

    expect(
      prismaMock.portfolios.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 10,
          portfolio_type: PortfolioType.TRADER,
        },
      }),
    );
  });

  it('should reject access to another user portfolio', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue(null);

    await expect(service.findOne(1, 99)).rejects.toThrow(
      'ไม่พบพอร์ตนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
    );
  });
});

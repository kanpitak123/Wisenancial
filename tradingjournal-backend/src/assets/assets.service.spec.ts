import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from './assets.service';

/**
 * scaffold เดิมไม่ได้ provide PrismaService ที่ constructor ต้องใช้ -> DI พัง
 *
 * เคสที่ใส่เพิ่มคุมสิ่งที่เป็นหัวใจของ service นี้: รายชื่อสินทรัพย์ต้องเปลี่ยนตามโหมด
 * ของพอร์ต (Forex อ่านตาราง assets / Stock อ่านตาราง stocks) ถ้าสลับผิดผู้ใช้โหมด
 * Stock จะเห็นคู่เงินมาแทนหุ้นทั้งหน้า
 */
const prismaMock = {
  portfolios: { findFirst: jest.fn() },
  assets: { findMany: jest.fn() },
  stocks: { findMany: jest.fn() },
};

describe('AssetsService', () => {
  let service: AssetsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.assets.findMany.mockResolvedValue([]);
    prismaMock.stocks.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('พอร์ตไม่ใช่ของผู้ใช้คนนี้ -> 404 และไม่อ่านรายชื่อสินทรัพย์ต่อ', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue(null);

    await expect(service.getAssetsForPortfolio(99, 1)).rejects.toThrow(
      'ไม่พบพอร์ตนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
    );

    expect(prismaMock.assets.findMany).not.toHaveBeenCalled();
    expect(prismaMock.stocks.findMany).not.toHaveBeenCalled();
  });

  it('พอร์ตโหมด Forex -> อ่านจากตาราง assets ไม่ใช่ stocks', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      portfolio_type: PortfolioType.TRADER,
    });

    await service.getAssetsForPortfolio(7, 1);

    expect(prismaMock.assets.findMany).toHaveBeenCalled();
    expect(prismaMock.stocks.findMany).not.toHaveBeenCalled();
  });

  it('พอร์ตโหมด Stock -> อ่านจากตาราง stocks ไม่ใช่ assets', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      portfolio_type: PortfolioType.INVESTOR,
    });

    await service.getAssetsForPortfolio(7, 1);

    expect(prismaMock.stocks.findMany).toHaveBeenCalled();
    expect(prismaMock.assets.findMany).not.toHaveBeenCalled();
  });

  it('ส่ง sector มา -> กรองแบบไม่สนตัวพิมพ์เล็กใหญ่', async () => {
    // ผู้ใช้พิมพ์ "technology" แต่ในตารางเก็บ "Technology" ต้องยังเจอ
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      portfolio_type: PortfolioType.INVESTOR,
    });

    await service.getAssetsForPortfolio(7, 1, '  technology  ');

    expect(prismaMock.stocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sector: { equals: 'technology', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('sector เป็นช่องว่างล้วน -> ไม่ใส่เงื่อนไขกรองเลย', async () => {
    prismaMock.portfolios.findFirst.mockResolvedValue({
      id: 1,
      portfolio_type: PortfolioType.INVESTOR,
    });

    await service.getAssetsForPortfolio(7, 1, '   ');

    const args = prismaMock.stocks.findMany.mock.calls[0][0];

    expect(args.where).not.toHaveProperty('sector');
  });
});

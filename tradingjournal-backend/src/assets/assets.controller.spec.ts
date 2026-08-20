import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/**
 * scaffold เดิม provide คลาส AssetsService ตัวจริงเข้าไป Nest จึงพยายามสร้างมันขึ้นมา
 * แล้วต้องการ PrismaService ต่อ -> DI พังทั้งไฟล์ เปลี่ยนเป็น mock แล้ว override guard
 */
const assetsServiceMock = {
  getAssetsForPortfolio: jest.fn(),
  getChartData: jest.fn(),
  getMonthlyFinancialData: jest.fn(),
  getInvestorPortfolioOverview: jest.fn(),
  getStockNews: jest.fn(),
  getCorporateEvents: jest.fn(),
  getTrendingStocks: jest.fn(),
  getStockValuation: jest.fn(),
};

describe('AssetsController', () => {
  let controller: AssetsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [{ provide: AssetsService, useValue: assetsServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssetsController>(AssetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('ใช้ userId จาก token ไม่ใช่ค่าที่ client ส่งมา', () => {
    controller.getAssetsForPortfolio({ userId: 7 } as never, 5, 'Technology');

    expect(assetsServiceMock.getAssetsForPortfolio).toHaveBeenCalledWith(
      7,
      5,
      'Technology',
    );
  });

  it('ไม่ส่ง sector มา -> ส่งต่อเป็น undefined ให้ service ตัดสินใจเอง', () => {
    controller.getAssetsForPortfolio({ userId: 7 } as never, 5);

    expect(assetsServiceMock.getAssetsForPortfolio).toHaveBeenCalledWith(
      7,
      5,
      undefined,
    );
  });
});

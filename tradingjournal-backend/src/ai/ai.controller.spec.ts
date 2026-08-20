import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiController } from './ai.controller';
import { AiManagerService } from './ai-manager.service';
import { AiService } from './ai.service';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiRiskService } from './ai-risk.service';
import { AiEducationService } from './ai-education.service';

/**
 * scaffold เดิม provide คลาส AiService ตัวจริงเข้าไปตัวเดียว ทั้งที่คอนโทรลเลอร์ฉีด
 * 5 service และ AiService เองก็ลาก PrismaService/AiManager/RuleEngine/Analytics/
 * StockPurchases ตามมาอีกชั้น -> DI พังทั้งไฟล์
 *
 * mock ทั้ง 5 ตัวตามที่ constructor ประกาศจริง
 */
const managerMock = { listModels: jest.fn(), getCredits: jest.fn() };
const aiMock = { analyze: jest.fn(), reviewPortfolio: jest.fn() };
const recommendationsMock = { getGrowthRecommendations: jest.fn() };
const riskMock = { analyzePortfolioRisk: jest.fn() };
const educationMock = { generateQuiz: jest.fn() };

describe('AiController', () => {
  let controller: AiController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiManagerService, useValue: managerMock },
        { provide: AiService, useValue: aiMock },
        { provide: AiRecommendationService, useValue: recommendationsMock },
        { provide: AiRiskService, useValue: riskMock },
        { provide: AiEducationService, useValue: educationMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('growthRecommendations ใช้ userId จาก request ไม่ใช่ค่าจาก client', () => {
    controller.growthRecommendations({ user: { userId: 7 } } as never);

    expect(recommendationsMock.getGrowthRecommendations).toHaveBeenCalledWith(7);
  });
});

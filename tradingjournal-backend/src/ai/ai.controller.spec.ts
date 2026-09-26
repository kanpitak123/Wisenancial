import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
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
      .overrideGuard(VerifiedEmailGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  /**
   * ฟีเจอร์ AI ที่กินโควตาต้องยืนยันอีเมลก่อน — แต่ /ai/pricing กับ /ai/credits ต้องเปิดไว้
   * เพราะ badge โควตาบนหัวเว็บเรียกทุกหน้า ถ้าปิดผู้ใช้ที่ยังไม่ยืนยันจะเจอ error ทุกหน้า
   */
  it('routes that run AI are behind VerifiedEmailGuard; pricing/credits are not', () => {
    const guardsOf = (handler: unknown): unknown[] =>
      (Reflect.getMetadata('__guards__', handler as object) as unknown[]) ?? [];

    const proto = AiController.prototype as unknown as Record<string, unknown>;
    const open = new Set(['getPricing', 'getCredits']);

    const routeNames = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );

    expect(routeNames.length).toBeGreaterThan(4);

    for (const name of routeNames) {
      expect({
        name,
        guarded: guardsOf(proto[name]).includes(VerifiedEmailGuard),
      }).toEqual({
        name,
        guarded: !open.has(name),
      });
    }
  });

  it('GET /ai/pricing returns the flat price of every feature and the balance floor', () => {
    const body = controller.getPricing();

    expect(body.minBalance).toBe(20);
    expect(body.features).toEqual(
      expect.arrayContaining([
        { feature: 'chart_insight', credits: 5, tier: 'fast' },
        { feature: 'ai_picks', credits: 10, tier: 'fast' },
        { feature: 'portfolio_review', credits: 20, tier: 'smart' },
      ]),
    );
    // no model list any more: users do not pick a model
    expect(body).not.toHaveProperty('models');
  });

  it('growthRecommendations ใช้ userId จาก request ไม่ใช่ค่าจาก client', () => {
    controller.growthRecommendations({ user: { userId: 7 } });

    expect(recommendationsMock.getGrowthRecommendations).toHaveBeenCalledWith(
      7,
      undefined,
    );
  });

  it('growthRecommendations ส่ง outputLanguage จาก query ต่อให้ service', () => {
    controller.growthRecommendations({ user: { userId: 7 } }, 'en');

    expect(recommendationsMock.getGrowthRecommendations).toHaveBeenCalledWith(
      7,
      'en',
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

const portfoliosServiceMock = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  getQuota: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const AUTH_USER = { userId: 7 } as never;

describe('PortfoliosController', () => {
  let controller: PortfoliosController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfoliosController],
      providers: [
        {
          provide: PortfoliosService,
          useValue: portfoliosServiceMock,
        },
      ],
    })
      // JwtAuthGuard ดึง JwtService + ConfigService เข้ามา ซึ่งไม่มีใน test module
      // เทสนี้สนใจแค่ routing/delegation เลย override ทิ้งไป
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PortfoliosController>(PortfoliosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('ส่ง userId ของผู้ใช้ที่ล็อกอินไปให้ getQuota', async () => {
    const quota = {
      max: 3,
      used: 2,
      remaining: 1,
      byType: { TRADER: 1, INVESTOR: 1 },
    };

    portfoliosServiceMock.getQuota.mockResolvedValue(quota);

    await expect(controller.getQuota(AUTH_USER)).resolves.toEqual(quota);
    expect(portfoliosServiceMock.getQuota).toHaveBeenCalledWith(7);
  });

  it('เส้นทาง quota ต้องถูกประกาศก่อน :id ไม่งั้นโดน ParseIntPipe จับ', () => {
    const paths = Reflect.ownKeys(PortfoliosController.prototype)
      .filter((key): key is string => typeof key === 'string' && key !== 'constructor')
      .map((key) => ({
        key,
        path: Reflect.getMetadata('path', PortfoliosController.prototype[key]) as string,
        method: Reflect.getMetadata('method', PortfoliosController.prototype[key]) as number,
      }))
      .filter((route) => route.path !== undefined);

    const getRoutes = paths.filter((route) => route.method === 0);
    const quotaIndex = getRoutes.findIndex((route) => route.path === 'quota');
    const idIndex = getRoutes.findIndex((route) => route.path === ':id');

    expect(quotaIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(quotaIndex).toBeLessThan(idIndex);
  });
});

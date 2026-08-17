import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioType, SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from './portfolios.service';
import {
  FREE_TIER_MAX_PORTFOLIOS,
  TIER_MAX_PORTFOLIOS,
} from './portfolio-quota.config';

const prismaMock = {
  users: {
    findUnique: jest.fn(),
  },
  portfolios: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
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

const USER_ID = 10;

/** ผู้ใช้ที่ไม่มี subscription แถวไหนเลย */
function mockUserTier(tier: SubscriptionTier | null, subscriptions: unknown[] = []) {
  prismaMock.users.findUnique.mockResolvedValue({
    subscription_tier: tier,
    subscriptions,
  });
}

/** จำนวนพอร์ตที่มีอยู่แยกตามประเภท */
function mockPortfolioCounts(trader: number, investor: number) {
  prismaMock.portfolios.groupBy.mockResolvedValue([
    { portfolio_type: PortfolioType.TRADER, _count: { _all: trader } },
    { portfolio_type: PortfolioType.INVESTOR, _count: { _all: investor } },
  ]);

  // create() นับรวมด้วย count() ตัวเดียว
  prismaMock.portfolios.count.mockResolvedValue(trader + investor);
}

function createDto(overrides: Record<string, unknown> = {}) {
  return {
    name: 'พอร์ตใหม่',
    initial_balance: 1000,
    ...overrides,
  } as never;
}

describe('PortfoliosService', () => {
  let service: PortfoliosService;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') {
        return input(prismaMock);
      }
      return Promise.all(input as Promise<unknown>[]);
    });

    // ไม่มีชื่อซ้ำ และ create คืนพอร์ตกลับมาตามที่ส่งเข้าไป
    prismaMock.portfolios.findFirst.mockResolvedValue(null);
    prismaMock.portfolios.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 99,
        ...data,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfoliosService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<PortfoliosService>(PortfoliosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should filter portfolios by owner and type', async () => {
    prismaMock.portfolios.findMany.mockResolvedValue([]);

    await service.findAll(USER_ID, PortfolioType.TRADER);

    expect(prismaMock.portfolios.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: USER_ID,
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

  // ==========================================================
  // GET /portfolios/quota
  // ==========================================================
  describe('getQuota', () => {
    it('รวมพอร์ตทั้งสองประเภทเป็นโควต้าก้อนเดียว', async () => {
      mockUserTier(SubscriptionTier.PACK_399);
      mockPortfolioCounts(2, 1);

      await expect(service.getQuota(USER_ID)).resolves.toEqual({
        max: TIER_MAX_PORTFOLIOS.PACK_399,
        used: 3,
        remaining: TIER_MAX_PORTFOLIOS.PACK_399 - 3,
        byType: { TRADER: 2, INVESTOR: 1 },
      });
    });

    it('tier = null ใช้โควต้า free', async () => {
      mockUserTier(null);
      mockPortfolioCounts(0, 0);

      await expect(service.getQuota(USER_ID)).resolves.toEqual({
        max: FREE_TIER_MAX_PORTFOLIOS,
        used: 0,
        remaining: FREE_TIER_MAX_PORTFOLIOS,
        byType: { TRADER: 0, INVESTOR: 0 },
      });
    });

    it('remaining ไม่ติดลบแม้พอร์ตเกินเพดาน (เช่นเพิ่งถูกดาวน์เกรด)', async () => {
      mockUserTier(null);
      mockPortfolioCounts(3, 2);

      const quota = await service.getQuota(USER_ID);

      expect(quota.used).toBe(5);
      expect(quota.remaining).toBe(0);
    });

    it('นับ byType เป็น 0 เมื่อยังไม่มีพอร์ตประเภทนั้น', async () => {
      mockUserTier(SubscriptionTier.PACK_279);
      prismaMock.portfolios.groupBy.mockResolvedValue([
        { portfolio_type: PortfolioType.INVESTOR, _count: { _all: 2 } },
      ]);

      await expect(service.getQuota(USER_ID)).resolves.toEqual({
        max: TIER_MAX_PORTFOLIOS.PACK_279,
        used: 2,
        remaining: TIER_MAX_PORTFOLIOS.PACK_279 - 2,
        byType: { TRADER: 0, INVESTOR: 2 },
      });
    });

    it('subscription_tier = null แต่มี subscriptions ACTIVE -> ใช้ tier ของแพ็กนั้น', async () => {
      mockUserTier(null, [{ plans: { name: 'PACK_399' } }]);
      mockPortfolioCounts(1, 1);

      const quota = await service.getQuota(USER_ID);

      expect(quota.max).toBe(TIER_MAX_PORTFOLIOS.PACK_399);
      expect(quota.remaining).toBe(TIER_MAX_PORTFOLIOS.PACK_399 - 2);
    });

    it('มีหลาย subscription ACTIVE -> เลือกแพ็กที่โควต้าสูงสุด', async () => {
      mockUserTier(null, [
        { plans: { name: 'PACK_219' } },
        { plans: { name: 'PACK_399' } },
      ]);
      mockPortfolioCounts(0, 0);

      await expect(
        service.getQuota(USER_ID).then((q) => q.max),
      ).resolves.toBe(TIER_MAX_PORTFOLIOS.PACK_399);
    });

    it('plans.name ที่ไม่ใช่ tier ที่รู้จัก -> ตกกลับไป free', async () => {
      mockUserTier(null, [{ plans: { name: 'LEGACY_TRIAL' } }]);
      mockPortfolioCounts(0, 0);

      await expect(
        service.getQuota(USER_ID).then((q) => q.max),
      ).resolves.toBe(FREE_TIER_MAX_PORTFOLIOS);
    });
  });

  // ==========================================================
  // create() — บังคับโควต้า
  // ==========================================================
  describe('create — โควต้า', () => {
    it('ยังไม่เต็มโควต้า -> สร้างได้', async () => {
      mockUserTier(SubscriptionTier.PACK_279);
      mockPortfolioCounts(1, 1); // ใช้ไป 2 จาก 3

      await expect(service.create(USER_ID, createDto())).resolves.toEqual(
        expect.objectContaining({ id: 99 }),
      );

      expect(prismaMock.portfolios.create).toHaveBeenCalled();
    });

    it('โควต้าเต็มพอดี -> ForbiddenException และไม่แตะ DB เพื่อสร้าง', async () => {
      mockUserTier(SubscriptionTier.PACK_279);
      mockPortfolioCounts(2, 1); // ใช้ไป 3 จาก 3

      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        ForbiddenException,
      );

      expect(prismaMock.portfolios.create).not.toHaveBeenCalled();
    });

    it('โควต้าเกิน (ถูกดาวน์เกรดมา) -> ForbiddenException', async () => {
      mockUserTier(SubscriptionTier.PACK_219);
      mockPortfolioCounts(3, 2); // ใช้ไป 5 จาก 2

      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        ForbiddenException,
      );

      expect(prismaMock.portfolios.create).not.toHaveBeenCalled();
    });

    it('ข้อความ error เป็นภาษาไทยและบอกตัวเลขที่ใช้ไป/เพดาน', async () => {
      mockUserTier(SubscriptionTier.PACK_399);
      mockPortfolioCounts(5, 0);

      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        /สร้างพอร์ตไม่ได้.*แพ็กเกจ 399฿.*สูงสุด 5 พอร์ต.*ใช้ไปแล้ว 5 พอร์ต/,
      );
    });

    it('tier = null สร้างพอร์ตแรกได้ แต่พอร์ตที่ 2 ถูกบล็อก', async () => {
      mockUserTier(null);
      mockPortfolioCounts(0, 0);

      await expect(service.create(USER_ID, createDto())).resolves.toBeDefined();

      jest.clearAllMocks();
      prismaMock.portfolios.findFirst.mockResolvedValue(null);
      mockUserTier(null);
      mockPortfolioCounts(1, 0);

      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('นับรวมข้ามโหมด — พอร์ต INVESTOR เต็มโควต้าแล้วสร้าง TRADER ไม่ได้', async () => {
      mockUserTier(SubscriptionTier.PACK_279);
      mockPortfolioCounts(0, 3); // หุ้นล้วน 3 พอร์ต

      await expect(
        service.create(
          USER_ID,
          createDto({ portfolio_type: PortfolioType.TRADER }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('มีคนสร้างแทรกระหว่างทาง -> เช็คซ้ำใน transaction จับได้ ไม่สร้างเกินโควต้า', async () => {
      mockUserTier(SubscriptionTier.PACK_279); // เพดาน 3

      prismaMock.portfolios.groupBy.mockResolvedValue([]);
      prismaMock.portfolios.count
        .mockResolvedValueOnce(2) // เช็ครอบแรก (นอก transaction) — ยังว่าง
        .mockResolvedValueOnce(2) // existingCount ของประเภทนั้น
        .mockResolvedValueOnce(3); // เช็คซ้ำใน transaction — เต็มไปแล้ว

      await expect(service.create(USER_ID, createDto())).rejects.toThrow(
        ForbiddenException,
      );

      expect(prismaMock.portfolios.create).not.toHaveBeenCalled();
    });

    it('count() ที่ใช้เช็คโควต้าต้องไม่กรอง portfolio_type', async () => {
      mockUserTier(SubscriptionTier.PACK_399);
      mockPortfolioCounts(1, 1);

      await service.create(
        USER_ID,
        createDto({ portfolio_type: PortfolioType.INVESTOR }),
      );

      expect(prismaMock.portfolios.count).toHaveBeenCalledWith({
        where: { user_id: USER_ID },
      });
    });
  });

  // ==========================================================
  // แบ่งสัดส่วนได้อิสระ ขอแค่รวมไม่เกิน
  // ==========================================================
  describe('create — แบ่งสัดส่วนประเภทได้อิสระ', () => {
    const max = TIER_MAX_PORTFOLIOS.PACK_399; // 5

    const splits: Array<[number, number]> = [
      [0, 4],
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 0],
    ];

    it.each(splits)(
      'มี TRADER %i + INVESTOR %i (รวม 4 จาก 5) -> ยังสร้างได้ทั้งสองประเภท',
      async (trader, investor) => {
        for (const nextType of [
          PortfolioType.TRADER,
          PortfolioType.INVESTOR,
        ]) {
          jest.clearAllMocks();
          prismaMock.portfolios.findFirst.mockResolvedValue(null);
          prismaMock.portfolios.create.mockImplementation(
            async ({ data }: { data: Record<string, unknown> }) => ({
              id: 99,
              ...data,
            }),
          );
          mockUserTier(SubscriptionTier.PACK_399);
          mockPortfolioCounts(trader, investor);

          expect(trader + investor).toBe(max - 1);

          await expect(
            service.create(USER_ID, createDto({ portfolio_type: nextType })),
          ).resolves.toBeDefined();
        }
      },
    );

    it.each(splits.map(([t, i]): [number, number] => [t + (5 - 4 - 0), i]))(
      'พอรวมครบ %i + %i = 5 แล้ว สร้างเพิ่มไม่ได้ทั้งสองประเภท',
      async (trader, investor) => {
        for (const nextType of [
          PortfolioType.TRADER,
          PortfolioType.INVESTOR,
        ]) {
          jest.clearAllMocks();
          prismaMock.portfolios.findFirst.mockResolvedValue(null);
          mockUserTier(SubscriptionTier.PACK_399);
          mockPortfolioCounts(trader, investor);

          expect(trader + investor).toBe(max);

          await expect(
            service.create(USER_ID, createDto({ portfolio_type: nextType })),
          ).rejects.toThrow(ForbiddenException);
        }
      },
    );
  });
});

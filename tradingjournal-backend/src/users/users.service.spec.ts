import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const prismaMock = {
  users: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject duplicate username', async () => {
    prismaMock.users.findFirst.mockResolvedValue({ id: 2 });

    await expect(
      service.updateProfile(1, { username: 'existing-user' }),
    ).rejects.toThrow('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
  });

  it('should update current user profile', async () => {
    prismaMock.users.findFirst.mockResolvedValue(null);
    prismaMock.users.update.mockResolvedValue({
      id: 1,
      username: 'new-name',
      full_name: 'New Name',
      email: 'user@example.com',
      role: 'USER',
      avatar_url: null,
      bio: 'Updated bio',
      subscription_tier: null,
      updated_at: new Date(),
    });

    const result = await service.updateProfile(1, {
      username: 'new-name',
      full_name: 'New Name',
      bio: 'Updated bio',
    });

    expect(prismaMock.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      }),
    );
    expect(result.user.username).toBe('new-name');
  });

  // ── GET /users/profile/:username ────────────────────────────────────────────
  describe('getPublicProfile', () => {
    const profile = (over: Record<string, unknown> = {}) => ({
      id: 1,
      username: 'trader01',
      full_name: 'Trader One',
      avatar_url: null,
      bio: null,
      subscription_tier: 'PACK_279',
      is_public_profile: true,
      current_streak: 4,
      created_at: new Date('2026-01-01'),
      portfolios: [],
      ...over,
    });

    it('ไม่พบ username -> 404', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(
        service.getPublicProfile('ghost', 99),
      ).rejects.toThrow('ไม่พบผู้ใช้นี้');
    });

    it('โปรไฟล์ส่วนตัว + คนอื่นเปิดดู -> 403', async () => {
      prismaMock.users.findUnique.mockResolvedValue(
        profile({ is_public_profile: false }),
      );

      await expect(
        service.getPublicProfile('trader01', 99),
      ).rejects.toThrow('โปรไฟล์นี้ตั้งเป็นส่วนตัว');
    });

    it('โปรไฟล์ส่วนตัว + เจ้าของเปิดดูเอง -> ดูได้ และรู้ว่าเป็นเจ้าของ', async () => {
      // ไม่ยอมให้ผ่านตรงนี้ = เจ้าของเปิดหน้าไปกดสวิตช์เปิดสาธารณะไม่ได้เลย
      prismaMock.users.findUnique.mockResolvedValue(
        profile({ is_public_profile: false }),
      );

      const result = await service.getPublicProfile('trader01', 1);

      expect(result.is_owner).toBe(true);
      expect(result.is_public_profile).toBe(false);
    });

    it('รวมยอดข้ามพอร์ตทุกใบ และนับเฉพาะหุ้นที่ยังถืออยู่', async () => {
      prismaMock.users.findUnique.mockResolvedValue(
        profile({
          portfolios: [
            {
              current_balance: '1000.00',
              stock_purchases: [
                { stock_symbol: 'NVDA' },
                { stock_symbol: 'AAPL' },
              ],
              stock_sales: [{ realized_pnl: '150.00' }],
              trades: [{ pnl: '50.00' }],
            },
            {
              current_balance: '500.50',
              stock_purchases: [{ stock_symbol: 'NVDA' }],
              stock_sales: [],
              trades: [{ pnl: null }],
            },
          ],
        }),
      );

      const result = await service.getPublicProfile('trader01', 99);

      expect(result.total_asset_value).toBe(1500.5);
      // realized_pnl ฝั่งหุ้น + pnl ฝั่ง Forex รวมกัน (ของเดิมนับแค่ trades.pnl)
      expect(result.total_pnl).toBe(200);
      // NVDA ซ้ำสองพอร์ตต้องนับครั้งเดียว
      expect(result.held_stocks).toEqual(['AAPL', 'NVDA']);
      expect(result.portfolio_count).toBe(2);
    });

    it('เคียวรีต้องกรอง remaining_shares > 0 ไม่งั้นหุ้นที่ขายไปแล้วจะโผล่', async () => {
      prismaMock.users.findUnique.mockResolvedValue(profile());

      await service.getPublicProfile('trader01', 99);

      const args = prismaMock.users.findUnique.mock.calls[0][0];

      expect(
        args.select.portfolios.select.stock_purchases.where,
      ).toEqual({ remaining_shares: { gt: 0 } });
    });

    it('ไม่ส่ง email/password ออกไปกับโปรไฟล์สาธารณะ', async () => {
      prismaMock.users.findUnique.mockResolvedValue(profile());

      const result = await service.getPublicProfile('trader01', 99);

      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('id');
    });
  });
});

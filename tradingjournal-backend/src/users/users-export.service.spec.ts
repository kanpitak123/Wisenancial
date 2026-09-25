import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  USER_EXPORT_FORMAT_VERSION,
  UsersExportService,
} from './users-export.service';

/** ตารางที่ service ต้องอ่าน — ทุกตัวต้องถูกกรองด้วย user หรือ portfolio ของผู้ใช้คนนี้ */
const USER_SCOPED = [
  'trades',
  'dividends',
  'watchlist',
  'posts',
  'comments',
  'post_likes',
  'chat_messages',
  'subscriptions',
  'user_missions',
  'point_transactions',
  'token_transactions',
  'lesson_progress',
  'readiness_assessments',
  'coach_sessions',
  'ai_usage_logs',
  'share_logs',
  'user_pinned_news',
  'user_pinned_market_news',
  'broker_connections',
] as const;

const PORTFOLIO_SCOPED = [
  'trade_imports',
  'records',
  'goals',
  'stock_purchases',
  'stock_sales',
] as const;

const USER_ID = 7;

function buildPrismaMock() {
  const findMany = () => jest.fn().mockResolvedValue([]);

  const mock: Record<string, { findMany: jest.Mock; findUnique?: jest.Mock }> =
    {
      portfolios: {
        findMany: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]),
      },
      trade_screenshots: { findMany: findMany() },
    };

  for (const name of [...USER_SCOPED, ...PORTFOLIO_SCOPED]) {
    mock[name] = { findMany: findMany() };
  }

  mock.users = {
    findMany: findMany(),
    findUnique: jest.fn().mockResolvedValue({
      id: USER_ID,
      username: 'trader',
      email: 't@example.com',
    }),
  };

  return mock;
}

describe('UsersExportService', () => {
  let service: UsersExportService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersExportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UsersExportService);
  });

  it('throws NotFound when the account does not exist', async () => {
    prisma.users.findUnique!.mockResolvedValue(null);

    await expect(service.buildExport(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns a versioned bundle with the profile and every data group', async () => {
    const bundle = await service.buildExport(USER_ID);

    expect(bundle.format_version).toBe(USER_EXPORT_FORMAT_VERSION);
    expect(new Date(bundle.exported_at).toString()).not.toBe('Invalid Date');
    expect(bundle.user).toMatchObject({ id: USER_ID, username: 'trader' });
    expect(Object.keys(bundle.data)).toEqual(
      expect.arrayContaining([
        'portfolios',
        'trades',
        'records',
        'dividends',
        'stock_purchases',
        'stock_sales',
        'ai_usage_logs',
        'token_transactions',
        'broker_connections',
      ]),
    );
  });

  it('looks the account up by the id it was given, selecting only allow-listed columns', async () => {
    await service.buildExport(USER_ID);

    const call = prisma.users.findUnique!.mock.calls[0][0] as {
      where: unknown;
      select: Record<string, boolean>;
    };

    expect(call.where).toEqual({ id: USER_ID });
    expect(call.select.email).toBe(true);
    // ความลับ/รหัสภายในต้องไม่อยู่ใน select เลย
    expect(call.select).not.toHaveProperty('password');
    expect(call.select).not.toHaveProperty('stripe_customer_id');
    expect(call.select).not.toHaveProperty('stripe_subscription_id');
  });

  it.each(USER_SCOPED)('scopes %s to the requesting user', async (table) => {
    await service.buildExport(USER_ID);

    const args = prisma[table].findMany.mock.calls[0][0] as {
      where: unknown;
    };

    expect(args.where).toEqual({ user_id: USER_ID });
  });

  it('scopes trade_screenshots through the owning trade', async () => {
    await service.buildExport(USER_ID);

    const args = prisma.trade_screenshots.findMany.mock.calls[0][0] as {
      where: unknown;
    };

    expect(args.where).toEqual({ trades: { user_id: USER_ID } });
  });

  it.each(PORTFOLIO_SCOPED)(
    'scopes %s to the portfolios owned by the user',
    async (table) => {
      await service.buildExport(USER_ID);

      const args = prisma[table].findMany.mock.calls[0][0] as {
        where: unknown;
      };

      expect(args.where).toEqual({ portfolio_id: { in: [11, 12] } });
    },
  );

  it('reads portfolios by owner first (their ids drive every portfolio-scoped table)', async () => {
    await service.buildExport(USER_ID);

    expect(prisma.portfolios.findMany).toHaveBeenCalledWith({
      where: { user_id: USER_ID },
      orderBy: { id: 'asc' },
    });
  });

  it('never selects broker credential columns', async () => {
    await service.buildExport(USER_ID);

    const args = prisma.broker_connections.findMany.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };

    expect(args.select.broker_type).toBe(true);
    expect(args.select).not.toHaveProperty('api_key_hash');
    expect(args.select).not.toHaveProperty('oauth_access_token_encrypted');
    expect(args.select).not.toHaveProperty('oauth_refresh_token_encrypted');
  });

  it('never reads refresh tokens at all', async () => {
    await service.buildExport(USER_ID);

    expect(prisma).not.toHaveProperty('refresh_tokens');
  });

  it('produces JSON that contains no password or token-hash keys', async () => {
    const json = JSON.stringify(await service.buildExport(USER_ID));

    expect(json).not.toMatch(/"password"/);
    expect(json).not.toMatch(/token_hash/);
    expect(json).not.toMatch(/api_key_hash/);
    expect(json).not.toMatch(/_encrypted/);
  });
});

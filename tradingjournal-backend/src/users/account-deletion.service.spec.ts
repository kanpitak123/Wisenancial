import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AccountDeletionService } from './account-deletion.service';
import { ACCOUNT_DELETION } from './constants/users.constants';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

const prismaMock = {
  users: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  refresh_tokens: { updateMany: jest.fn() },
  subscriptions: { findFirst: jest.fn() },
};

const USER = {
  id: 7,
  password: 'hashed',
  stripe_subscription_id: null as string | null,
  deletion_scheduled_at: null as Date | null,
};

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    prismaMock.users.findUnique.mockResolvedValue({ ...USER });
    prismaMock.users.update.mockResolvedValue({});
    prismaMock.refresh_tokens.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.subscriptions.findFirst.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(AccountDeletionService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('requestDeletion', () => {
    it('rejects a wrong password with 400 (not 401) and changes nothing', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.requestDeletion(7, 'nope')).rejects.toMatchObject({
        status: 400,
      });

      expect(prismaMock.users.update).not.toHaveBeenCalled();
      expect(prismaMock.refresh_tokens.updateMany).not.toHaveBeenCalled();
    });

    it('404s when the account does not exist', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(service.requestDeletion(7, 'pw')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('schedules the deletion exactly graceDays (30) from now', async () => {
      const before = Date.now();

      const result = await service.requestDeletion(7, 'pw');

      const call = prismaMock.users.update.mock.calls[0][0] as {
        where: { id: number };
        data: { deletion_scheduled_at: Date };
      };
      const scheduled = call.data.deletion_scheduled_at.getTime();

      expect(ACCOUNT_DELETION.graceDays).toBe(30);
      expect(call.where).toEqual({ id: 7 });
      expect(scheduled).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
      expect(scheduled).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
      expect(result.grace_days).toBe(30);
      expect(result.deletion_scheduled_at).toBe(
        call.data.deletion_scheduled_at.toISOString(),
      );
    });

    it('signs the user out everywhere — every unrevoked refresh token, no family kept', async () => {
      await service.requestDeletion(7, 'pw');

      expect(prismaMock.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { user_id: 7, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
    });

    it('is idempotent: a second request keeps the original date and revokes nothing new', async () => {
      const original = new Date(Date.now() + 10 * DAY_MS);
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER,
        deletion_scheduled_at: original,
      });

      const result = await service.requestDeletion(7, 'pw');

      expect(result.deletion_scheduled_at).toBe(original.toISOString());
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('refuses (409) while a paid Stripe subscription is still active', async () => {
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER,
        stripe_subscription_id: 'sub_123',
      });
      prismaMock.subscriptions.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.requestDeletion(7, 'pw')).rejects.toMatchObject({
        status: 409,
      });

      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('allows deletion when the Stripe id is left over but no live subscription remains', async () => {
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER,
        stripe_subscription_id: 'sub_old',
      });
      prismaMock.subscriptions.findFirst.mockResolvedValue(null);

      await expect(service.requestDeletion(7, 'pw')).resolves.toBeDefined();
    });
  });

  describe('purgeExpiredAccounts', () => {
    it('does nothing when no account is due', async () => {
      prismaMock.users.findMany.mockResolvedValue([]);

      await expect(service.purgeExpiredAccounts()).resolves.toEqual({
        purged: 0,
        skippedActiveSubscription: 0,
        failed: 0,
      });

      expect(prismaMock.users.deleteMany).not.toHaveBeenCalled();
    });

    it('only looks at accounts whose moment has passed', async () => {
      prismaMock.users.findMany.mockResolvedValue([]);

      await service.purgeExpiredAccounts();

      const args = prismaMock.users.findMany.mock.calls[0][0] as {
        where: { deletion_scheduled_at: { lte: Date } };
        take: number;
      };

      expect(args.where.deletion_scheduled_at.lte).toBeInstanceOf(Date);
      expect(args.take).toBe(ACCOUNT_DELETION.purgeBatchSize);
    });

    it('hard-deletes due accounts, re-checking the schedule so a login-cancel wins', async () => {
      prismaMock.users.findMany
        .mockResolvedValueOnce([
          { id: 1, stripe_subscription_id: null },
          { id: 2, stripe_subscription_id: null },
        ])
        .mockResolvedValueOnce([]);
      prismaMock.users.deleteMany.mockResolvedValue({ count: 1 });

      const summary = await service.purgeExpiredAccounts();

      expect(summary).toEqual({
        purged: 2,
        skippedActiveSubscription: 0,
        failed: 0,
      });
      expect(prismaMock.users.deleteMany).toHaveBeenCalledWith({
        where: { id: 1, deletion_scheduled_at: { lte: expect.any(Date) } },
      });
    });

    it('does not count an account whose deletion was cancelled mid-run (0 rows deleted)', async () => {
      prismaMock.users.findMany
        .mockResolvedValueOnce([{ id: 1, stripe_subscription_id: null }])
        .mockResolvedValueOnce([]);
      prismaMock.users.deleteMany.mockResolvedValue({ count: 0 });

      const summary = await service.purgeExpiredAccounts();

      expect(summary.purged).toBe(0);
    });

    it('skips (never deletes) an account that still has a live Stripe subscription, and does not loop on it', async () => {
      prismaMock.users.findMany
        .mockResolvedValueOnce([{ id: 9, stripe_subscription_id: 'sub_9' }])
        .mockResolvedValueOnce([]);
      prismaMock.subscriptions.findFirst.mockResolvedValue({ id: 5 });

      const summary = await service.purgeExpiredAccounts();

      expect(summary.skippedActiveSubscription).toBe(1);
      expect(prismaMock.users.deleteMany).not.toHaveBeenCalled();

      // รอบถัดไปของลูปต้องกันไอดีที่ข้ามแล้วออก ไม่งั้นวนซ้ำไม่จบ
      const secondQuery = prismaMock.users.findMany.mock.calls[1][0] as {
        where: { id: { notIn: number[] } };
      };
      expect(secondQuery.where.id).toEqual({ notIn: [9] });
    });

    it('keeps going when one account fails to delete, and counts it', async () => {
      prismaMock.users.findMany
        .mockResolvedValueOnce([
          { id: 1, stripe_subscription_id: null },
          { id: 2, stripe_subscription_id: null },
        ])
        .mockResolvedValueOnce([]);
      prismaMock.users.deleteMany
        .mockRejectedValueOnce(new Error('fk violation'))
        .mockResolvedValueOnce({ count: 1 });

      const summary = await service.purgeExpiredAccounts();

      expect(summary).toEqual({
        purged: 1,
        skippedActiveSubscription: 0,
        failed: 1,
      });
    });

    it('logs only counts — no user id, email or name appears in the log line', async () => {
      prismaMock.users.findMany
        .mockResolvedValueOnce([{ id: 424242, stripe_subscription_id: null }])
        .mockResolvedValueOnce([]);
      prismaMock.users.deleteMany.mockResolvedValue({ count: 1 });

      await service.purgeExpiredAccounts();

      const lines = logSpy.mock.calls.map((call) => String(call[0]));

      expect(lines).toContain(
        'Account purge finished: purged=1 skipped_active_subscription=0 failed=0',
      );
      expect(lines.join('\n')).not.toContain('424242');
    });

    it('refuses to run twice at once', async () => {
      let release: (rows: unknown[]) => void = () => undefined;
      prismaMock.users.findMany.mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      const first = service.purgeExpiredAccounts();
      const second = await service.purgeExpiredAccounts();

      expect(second).toEqual({
        purged: 0,
        skippedActiveSubscription: 0,
        failed: 0,
      });
      expect(prismaMock.users.findMany).toHaveBeenCalledTimes(1);

      release([]);
      await first;
    });
  });
});

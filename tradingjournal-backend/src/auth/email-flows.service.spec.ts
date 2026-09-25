import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailTokenPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_ERROR_MESSAGES } from './constants/auth.constants';
import { EMAIL_FLOW } from './constants/email-flows.constants';
import { EmailFlowsService } from './email-flows.service';
import { hashOneTimeToken } from './utils/one-time-token.util';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

const prismaMock = {
  users: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  email_tokens: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  refresh_tokens: { updateMany: jest.fn() },
  // รองรับทั้งรูปแบบ array และ callback (interactive transaction) ที่โค้ดจริงใช้
  $transaction: jest.fn(),
};

const mailerMock = { send: jest.fn() };

const USER = { id: 7, email: 'alice@example.com', full_name: 'Alice' };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** ดึง token ดิบออกจากลิงก์ที่ส่งไปในอีเมลล่าสุด */
function tokenFromLastMail(): string {
  const message = mailerMock.send.mock.calls.at(-1)![0] as { text: string };
  const match = /token=([A-Za-z0-9_%-]+)/.exec(message.text);

  return decodeURIComponent(match![1]);
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 7,
    purpose: EmailTokenPurpose.PASSWORD_RESET,
    token_hash: 'h',
    email: USER.email,
    expires_at: new Date(Date.now() + 10 * MINUTE),
    used_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe('EmailFlowsService', () => {
  let service: EmailFlowsService;
  let warnSpy: jest.SpyInstance;
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://app.test';
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as Promise<unknown>[]),
    );
    prismaMock.users.findUnique.mockResolvedValue({
      ...USER,
      email_verified_at: null,
    });
    prismaMock.users.update.mockResolvedValue({});
    prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.email_tokens.findMany.mockResolvedValue([]);
    prismaMock.email_tokens.create.mockResolvedValue({});
    prismaMock.email_tokens.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.refresh_tokens.updateMany.mockResolvedValue({ count: 3 });
    mailerMock.send.mockResolvedValue(undefined);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailFlowsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: Mailer, useValue: mailerMock },
      ],
    }).compile();

    service = module.get(EmailFlowsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  describe('requestPasswordReset', () => {
    it('does nothing (and does not throw) when no account has that email', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset('ghost@example.com'),
      ).resolves.toBeUndefined();

      expect(prismaMock.email_tokens.create).not.toHaveBeenCalled();
      expect(mailerMock.send).not.toHaveBeenCalled();
    });

    it('normalises the email before looking the account up', async () => {
      await service.requestPasswordReset('  Alice@Example.COM ');

      expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
        select: { id: true, email: true, full_name: true },
      });
    });

    it('stores only the SHA-256 of the token and emails the raw token in a hash-router link', async () => {
      await service.requestPasswordReset('alice@example.com');

      const created = prismaMock.email_tokens.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      const raw = tokenFromLastMail();

      expect(created.data.token_hash).toBe(hashOneTimeToken(raw));
      expect(JSON.stringify(created.data)).not.toContain(raw);
      expect(created.data).toMatchObject({
        user_id: 7,
        purpose: EmailTokenPurpose.PASSWORD_RESET,
        email: 'alice@example.com',
      });

      const mail = mailerMock.send.mock.calls[0][0] as {
        to: string;
        text: string;
      };
      expect(mail.to).toBe('alice@example.com');
      expect(mail.text).toContain(
        `https://app.test/#/ResetPassword?token=${raw}`,
      );
    });

    it('expires the link after 30 minutes', async () => {
      const before = Date.now();

      await service.requestPasswordReset('alice@example.com');

      const created = prismaMock.email_tokens.create.mock.calls[0][0] as {
        data: { expires_at: Date };
      };
      const ttl = created.data.expires_at.getTime();

      expect(EMAIL_FLOW.resetTtlMinutes).toBe(30);
      expect(ttl).toBeGreaterThanOrEqual(before + 30 * MINUTE);
      expect(ttl).toBeLessThanOrEqual(Date.now() + 30 * MINUTE);
    });

    it('invalidates earlier unused reset links when a new one is issued', async () => {
      await service.requestPasswordReset('alice@example.com');

      expect(prismaMock.email_tokens.updateMany).toHaveBeenCalledWith({
        where: {
          user_id: 7,
          purpose: EmailTokenPurpose.PASSWORD_RESET,
          used_at: null,
        },
        data: { used_at: expect.any(Date) },
      });
    });

    it('sends nothing during the resend cooldown — silently, no error', async () => {
      prismaMock.email_tokens.findMany.mockResolvedValue([
        { created_at: new Date(Date.now() - 10_000) },
      ]);

      await expect(
        service.requestPasswordReset('alice@example.com'),
      ).resolves.toBeUndefined();

      expect(prismaMock.email_tokens.create).not.toHaveBeenCalled();
      expect(mailerMock.send).not.toHaveBeenCalled();
    });

    it('sends nothing once the per-address hourly cap is reached', async () => {
      const cap = EMAIL_FLOW.maxEmailsPerAddressPerHour;
      prismaMock.email_tokens.findMany.mockResolvedValue(
        Array.from({ length: cap }, (_, i) => ({
          created_at: new Date(Date.now() - (5 + i) * MINUTE),
        })),
      );

      await service.requestPasswordReset('alice@example.com');

      expect(mailerMock.send).not.toHaveBeenCalled();
    });

    it('sends again after the cooldown when under the cap', async () => {
      prismaMock.email_tokens.findMany.mockResolvedValue([
        { created_at: new Date(Date.now() - 5 * MINUTE) },
      ]);

      await service.requestPasswordReset('alice@example.com');

      expect(mailerMock.send).toHaveBeenCalledTimes(1);
    });

    it('a failing mail transport never throws, and the warning leaks no address, link or token', async () => {
      mailerMock.send.mockRejectedValue(
        new Error('SMTP refused alice@example.com body: ...token=SECRET'),
      );

      await expect(
        service.requestPasswordReset('alice@example.com'),
      ).resolves.toBeUndefined();

      const logged = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('Failed to send PASSWORD_RESET email');
      expect(logged).not.toContain('alice@example.com');
      expect(logged).not.toContain('SECRET');
    });

    it('does not send when there is no frontend URL to build the link from (production, unconfigured)', async () => {
      delete process.env.FRONTEND_URL;
      delete process.env.CORS_ORIGINS;
      process.env.NODE_ENV = 'production';

      await service.requestPasswordReset('alice@example.com');

      expect(mailerMock.send).not.toHaveBeenCalled();
      expect(prismaMock.email_tokens.create).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it.each([
      ['unknown token', null],
      ['already used', row({ used_at: new Date() })],
      ['expired', row({ expires_at: new Date(Date.now() - 1000) })],
      [
        'a verification token',
        row({ purpose: EmailTokenPurpose.EMAIL_VERIFICATION }),
      ],
    ])(
      '%s -> the same 400 message every time, nothing changes',
      async (_name, found) => {
        prismaMock.email_tokens.findUnique.mockResolvedValue(found);

        await expect(
          service.resetPassword('t'.repeat(43), 'NewPass123'),
        ).rejects.toMatchObject({
          status: 400,
          message: AUTH_ERROR_MESSAGES.invalidEmailToken,
        });

        expect(prismaMock.users.update).not.toHaveBeenCalled();
        expect(prismaMock.refresh_tokens.updateMany).not.toHaveBeenCalled();
      },
    );

    it('looks the token up by its hash, never by the raw value', async () => {
      prismaMock.email_tokens.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('RAWVALUE'.padEnd(43, 'x'), 'NewPass123'),
      ).rejects.toThrow();

      expect(prismaMock.email_tokens.findUnique).toHaveBeenCalledWith({
        where: { token_hash: hashOneTimeToken('RAWVALUE'.padEnd(43, 'x')) },
      });
    });

    describe('with a valid token', () => {
      beforeEach(() => {
        prismaMock.email_tokens.findUnique.mockResolvedValue(row());
      });

      it('consumes the token atomically (only if still unused and unexpired)', async () => {
        await service.resetPassword('t'.repeat(43), 'NewPass123');

        expect(prismaMock.email_tokens.updateMany).toHaveBeenCalledWith({
          where: {
            id: 1,
            used_at: null,
            expires_at: { gt: expect.any(Date) },
          },
          data: { used_at: expect.any(Date) },
        });
      });

      it('stores a bcrypt hash of the new password, never the password', async () => {
        await service.resetPassword('t'.repeat(43), 'NewPass123');

        expect(bcrypt.hash).toHaveBeenCalledWith(
          'NewPass123',
          expect.any(Number),
        );
        expect(prismaMock.users.update).toHaveBeenCalledWith({
          where: { id: 7 },
          data: { password: 'new-hash', updated_at: expect.any(Date) },
        });
      });

      it('revokes every refresh token of the user and reports how many', async () => {
        const result = await service.resetPassword(
          't'.repeat(43),
          'NewPass123',
        );

        expect(prismaMock.refresh_tokens.updateMany).toHaveBeenCalledWith({
          where: { user_id: 7, revoked_at: null },
          data: { revoked_at: expect.any(Date) },
        });
        expect(result.sessions_revoked).toBe(3);
      });

      it('runs everything in one transaction so a failure changes nothing', async () => {
        await service.resetPassword('t'.repeat(43), 'NewPass123');

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(typeof prismaMock.$transaction.mock.calls[0][0]).toBe(
          'function',
        );
      });

      it('also invalidates any other outstanding reset link', async () => {
        await service.resetPassword('t'.repeat(43), 'NewPass123');

        expect(prismaMock.email_tokens.updateMany).toHaveBeenCalledWith({
          where: {
            user_id: 7,
            purpose: EmailTokenPurpose.PASSWORD_RESET,
            used_at: null,
          },
          data: { used_at: expect.any(Date) },
        });
      });

      it('marks the address verified (they read the email) — only for the address the link was sent to', async () => {
        await service.resetPassword('t'.repeat(43), 'NewPass123');

        expect(prismaMock.users.updateMany).toHaveBeenCalledWith({
          where: { id: 7, email: USER.email, email_verified_at: null },
          data: { email_verified_at: expect.any(Date) },
        });
      });

      it('loses a race for the token -> 400 and the password is NOT changed', async () => {
        prismaMock.email_tokens.updateMany.mockResolvedValueOnce({ count: 0 });

        await expect(
          service.resetPassword('t'.repeat(43), 'NewPass123'),
        ).rejects.toMatchObject({ status: 400 });

        expect(prismaMock.users.update).not.toHaveBeenCalled();
        expect(prismaMock.refresh_tokens.updateMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('verifyEmail', () => {
    const verifyRow = (o: Record<string, unknown> = {}) =>
      row({ purpose: EmailTokenPurpose.EMAIL_VERIFICATION, ...o });

    it.each([
      ['unknown', null],
      ['used', verifyRow({ used_at: new Date() })],
      ['expired', verifyRow({ expires_at: new Date(Date.now() - 1) })],
      ['a reset token', row()],
    ])('%s token -> 400', async (_name, found) => {
      prismaMock.email_tokens.findUnique.mockResolvedValue(found);

      await expect(service.verifyEmail('t'.repeat(43))).rejects.toMatchObject({
        status: 400,
        message: AUTH_ERROR_MESSAGES.invalidEmailToken,
      });
    });

    it('sets email_verified_at and consumes the token', async () => {
      prismaMock.email_tokens.findUnique.mockResolvedValue(verifyRow());
      prismaMock.users.findUnique.mockResolvedValue({
        email: USER.email,
        email_verified_at: null,
      });

      await service.verifyEmail('t'.repeat(43));

      expect(prismaMock.email_tokens.updateMany).toHaveBeenCalledWith({
        where: { id: 1, used_at: null, expires_at: { gt: expect.any(Date) } },
        data: { used_at: expect.any(Date) },
      });
      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { email_verified_at: expect.any(Date) },
      });
    });

    it('does not overwrite an existing verification time', async () => {
      prismaMock.email_tokens.findUnique.mockResolvedValue(verifyRow());
      prismaMock.users.findUnique.mockResolvedValue({
        email: USER.email,
        email_verified_at: new Date('2026-01-01'),
      });

      await service.verifyEmail('t'.repeat(43));

      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('rejects a link whose address is no longer the account email', async () => {
      prismaMock.email_tokens.findUnique.mockResolvedValue(verifyRow());
      prismaMock.users.findUnique.mockResolvedValue({
        email: 'changed@example.com',
        email_verified_at: null,
      });

      await expect(service.verifyEmail('t'.repeat(43))).rejects.toMatchObject({
        status: 400,
      });
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('loses a race for the token -> 400', async () => {
      prismaMock.email_tokens.findUnique.mockResolvedValue(verifyRow());
      prismaMock.email_tokens.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.verifyEmail('t'.repeat(43))).rejects.toMatchObject({
        status: 400,
      });
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });
  });

  describe('sendVerificationEmail', () => {
    it('401s when the account is gone', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(service.sendVerificationEmail(7)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('an already verified account gets no email', async () => {
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER,
        email_verified_at: new Date(),
      });

      await expect(service.sendVerificationEmail(7)).resolves.toMatchObject({
        already_verified: true,
      });
      expect(mailerMock.send).not.toHaveBeenCalled();
    });

    it('emails a 24-hour link', async () => {
      const before = Date.now();

      await expect(service.sendVerificationEmail(7)).resolves.toMatchObject({
        already_verified: false,
      });

      const created = prismaMock.email_tokens.create.mock.calls[0][0] as {
        data: { purpose: string; expires_at: Date };
      };

      expect(created.data.purpose).toBe(EmailTokenPurpose.EMAIL_VERIFICATION);
      expect(created.data.expires_at.getTime()).toBeGreaterThanOrEqual(
        before + 24 * HOUR,
      );
      expect(
        String((mailerMock.send.mock.calls[0][0] as { text: string }).text),
      ).toContain('#/VerifyEmail?token=');
    });

    it('during the cooldown answers 429 with how long to wait', async () => {
      prismaMock.email_tokens.findMany.mockResolvedValue([
        { created_at: new Date(Date.now() - 20_000) },
      ]);

      const error = await service
        .sendVerificationEmail(7)
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 429 });
      const body = (
        error as { getResponse: () => { retry_after_seconds: number } }
      ).getResponse();
      expect(body.retry_after_seconds).toBeGreaterThan(0);
      expect(body.retry_after_seconds).toBeLessThanOrEqual(
        EMAIL_FLOW.resendCooldownSeconds,
      );
      expect(mailerMock.send).not.toHaveBeenCalled();
    });

    it('a failing transport -> 503, without leaking the error', async () => {
      mailerMock.send.mockRejectedValue(new Error('boom alice@example.com'));

      await expect(service.sendVerificationEmail(7)).rejects.toMatchObject({
        status: 503,
        message: AUTH_ERROR_MESSAGES.emailUnavailable,
      });
    });
  });

  describe('sendVerificationForNewUser', () => {
    it('emails the new address and never throws', async () => {
      await expect(
        service.sendVerificationForNewUser(USER),
      ).resolves.toBeUndefined();

      expect(mailerMock.send).toHaveBeenCalledTimes(1);

      mailerMock.send.mockRejectedValue(new Error('down'));
      prismaMock.email_tokens.findMany.mockResolvedValue([]);

      await expect(
        service.sendVerificationForNewUser(USER),
      ).resolves.toBeUndefined();
    });
  });
});

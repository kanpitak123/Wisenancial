import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { CURRENT_TERMS_VERSION } from '../legal/legal.constants';
import { AUTH_ERROR_MESSAGES } from './constants/auth.constants';
import { EmailFlowsService } from './email-flows.service';
import { RefreshTokenService } from './refresh-token.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const prismaMock = {
  users: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const jwtMock = {
  signAsync: jest.fn(),
};

const refreshTokenMock = {
  issue: jest.fn(),
  rotate: jest.fn(),
  revoke: jest.fn(),
  findActiveFamilyForUser: jest.fn(),
  revokeAllForUser: jest.fn(),
};

const emailFlowsMock = {
  sendVerificationForNewUser: jest.fn(),
};

const USER_ROW = {
  id: 1,
  email: 'user@example.com',
  username: 'user',
  full_name: 'Example User',
  password: 'hashed-password',
  role: Role.USER,
  avatar_url: null,
  bio: null,
  subscription_tier: null,
  points_balance: 0,
  ai_token_balance: 0,
  current_streak: 0,
  longest_streak: 0,
  created_at: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: RefreshTokenService, useValue: refreshTokenMock },
        { provide: EmailFlowsService, useValue: emailFlowsMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject unknown credentials', async () => {
    prismaMock.users.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'Password123',
      }),
    ).rejects.toThrow('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('should return an access token for valid credentials', async () => {
    prismaMock.users.findUnique.mockResolvedValue(USER_ROW);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwtMock.signAsync.mockResolvedValue('access-token');
    refreshTokenMock.issue.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: new Date(),
    });

    const result = await service.login({
      email: 'USER@example.com',
      password: 'Password123',
    });

    expect(jwtMock.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        email: 'user@example.com',
        username: 'user',
        role: Role.USER,
      }),
    );
    expect(result.access_token).toBe('access-token');
  });

  describe('email verification state', () => {
    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtMock.signAsync.mockResolvedValue('access-token');
      refreshTokenMock.issue.mockResolvedValue({
        token: 'refresh-token',
        expiresAt: new Date(),
      });
    });

    it('login reports email_verified=false until the address is verified', async () => {
      prismaMock.users.findUnique.mockResolvedValue(USER_ROW);

      const result = await service.login({
        email: 'user@example.com',
        password: 'Password123',
      });

      expect(result.user.email_verified).toBe(false);
    });

    it('login reports email_verified=true once email_verified_at is set', async () => {
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER_ROW,
        email_verified_at: new Date(),
      });

      const result = await service.login({
        email: 'user@example.com',
        password: 'Password123',
      });

      expect(result.user.email_verified).toBe(true);
    });

    it('register sends a verification email to the new address without waiting for it', async () => {
      prismaMock.users.findFirst.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      prismaMock.users.create.mockResolvedValue({ ...USER_ROW });
      // ไม่มีวันจบ — ถ้า register รอผลการส่งอีเมล เทสนี้จะค้างจนหมดเวลา
      emailFlowsMock.sendVerificationForNewUser.mockReturnValue(
        new Promise(() => undefined),
      );

      const result = await service.register({
        email: 'User@Example.com',
        username: 'user',
        full_name: 'Example User',
        password: 'Password123',
        accepted_terms_version: CURRENT_TERMS_VERSION,
      });

      expect(emailFlowsMock.sendVerificationForNewUser).toHaveBeenCalledWith({
        id: 1,
        email: 'user@example.com',
        full_name: 'Example User',
      });
      expect(result.user.email_verified).toBe(false);
    });
  });

  describe('register: terms consent', () => {
    const REGISTER_INPUT = {
      email: 'new@example.com',
      username: 'newuser',
      full_name: 'New User',
      password: 'Password123',
    };

    beforeEach(() => {
      prismaMock.users.findFirst.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      prismaMock.users.create.mockResolvedValue({ ...USER_ROW });
      emailFlowsMock.sendVerificationForNewUser.mockResolvedValue(undefined);
    });

    it('stores the accepted version and a server-side timestamp', async () => {
      const before = Date.now();

      await service.register({
        ...REGISTER_INPUT,
        accepted_terms_version: CURRENT_TERMS_VERSION,
      });

      const data = (
        prismaMock.users.create.mock.calls[0] as [
          { data: { accepted_terms_version: string; accepted_terms_at: Date } },
        ]
      )[0].data;

      expect(data.accepted_terms_version).toBe(CURRENT_TERMS_VERSION);
      expect(data.accepted_terms_at).toBeInstanceOf(Date);
      expect(data.accepted_terms_at.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('rejects an outdated/unknown version with 400 and touches nothing', async () => {
      await expect(
        service.register({
          ...REGISTER_INPUT,
          accepted_terms_version: 'draft-0.0',
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: AUTH_ERROR_MESSAGES.termsVersionOutdated,
      });

      expect(prismaMock.users.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.users.create).not.toHaveBeenCalled();
      expect(emailFlowsMock.sendVerificationForNewUser).not.toHaveBeenCalled();
    });
  });

  describe('login during the account-deletion grace period', () => {
    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtMock.signAsync.mockResolvedValue('access-token');
      refreshTokenMock.issue.mockResolvedValue({
        token: 'refresh-token',
        expiresAt: new Date(),
      });
      prismaMock.users.update.mockResolvedValue({});
    });

    it('clears deletion_scheduled_at and tells the client the deletion was cancelled', async () => {
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER_ROW,
        deletion_scheduled_at: new Date(Date.now() + 86_400_000),
      });

      const result = await service.login({
        email: 'user@example.com',
        password: 'Password123',
      });

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletion_scheduled_at: null },
      });
      expect(result).toMatchObject({ account_deletion_cancelled: true });
    });

    it('does nothing extra for a normal account (no write, no flag)', async () => {
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER_ROW,
        deletion_scheduled_at: null,
      });

      const result = await service.login({
        email: 'user@example.com',
        password: 'Password123',
      });

      expect(prismaMock.users.update).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('account_deletion_cancelled');
    });

    it('does NOT cancel the deletion when the password is wrong', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER_ROW,
        deletion_scheduled_at: new Date(Date.now() + 86_400_000),
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong' }),
      ).rejects.toThrow();

      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });
  });

  it('should issue a refresh token on login and pass the request context along', async () => {
    prismaMock.users.findUnique.mockResolvedValue(USER_ROW);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwtMock.signAsync.mockResolvedValue('access-token');
    refreshTokenMock.issue.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: new Date(),
    });

    const result = await service.login(
      { email: 'user@example.com', password: 'Password123' },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(refreshTokenMock.issue).toHaveBeenCalledWith(1, {
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
    });
    expect(result.refresh_token).toBe('refresh-token');
  });

  describe('refresh', () => {
    it('should reject when no refresh token is supplied', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(
        'ไม่พบ Refresh Token กรุณาล็อกอินใหม่',
      );

      expect(refreshTokenMock.rotate).not.toHaveBeenCalled();
    });

    it('should rotate the token and mint a brand new access token', async () => {
      refreshTokenMock.rotate.mockResolvedValue({
        userId: 1,
        refreshToken: { token: 'rotated-refresh-token', expiresAt: new Date() },
      });
      prismaMock.users.findUnique.mockResolvedValue(USER_ROW);
      jwtMock.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refresh('old-refresh-token', {
        userAgent: 'jest',
      });

      expect(refreshTokenMock.rotate).toHaveBeenCalledWith(
        'old-refresh-token',
        {
          userAgent: 'jest',
        },
      );
      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('rotated-refresh-token');
      expect(result.user.id).toBe(1);
    });

    it('should reject when the user behind a valid token no longer exists', async () => {
      refreshTokenMock.rotate.mockResolvedValue({
        userId: 99,
        refreshToken: { token: 'rotated-refresh-token', expiresAt: new Date() },
      });
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(service.refresh('old-refresh-token')).rejects.toThrow(
        'ไม่พบบัญชีผู้ใช้',
      );
    });

    it('should read the user fresh from the database instead of trusting the token payload', async () => {
      refreshTokenMock.rotate.mockResolvedValue({
        userId: 1,
        refreshToken: { token: 'rotated-refresh-token', expiresAt: new Date() },
      });
      prismaMock.users.findUnique.mockResolvedValue({
        ...USER_ROW,
        role: Role.ADMIN,
        subscription_tier: 'PACK_399',
      });
      jwtMock.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refresh('old-refresh-token');

      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.ADMIN }),
      );
      expect(result.user.subscription_tier).toBe('PACK_399');
    });
  });

  describe('changePassword', () => {
    const DTO = { current_password: 'OldPass123', new_password: 'NewPass456' };

    beforeEach(() => {
      prismaMock.users.findUnique.mockResolvedValue({
        id: 1,
        password: 'hashed-password',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      prismaMock.users.update.mockResolvedValue({});
      refreshTokenMock.findActiveFamilyForUser.mockResolvedValue('family-A');
      refreshTokenMock.revokeAllForUser.mockResolvedValue(3);
    });

    it('rejects a wrong current password without touching the DB or sessions', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(1, DTO, 'cookie')).rejects.toThrow(
        'รหัสผ่านปัจจุบันไม่ถูกต้อง',
      );

      expect(prismaMock.users.update).not.toHaveBeenCalled();
      expect(refreshTokenMock.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('answers 400 (not 401) for a wrong current password so the client does not force-logout', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(1, DTO, 'cookie'),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects a new password identical to the current one', async () => {
      await expect(
        service.changePassword(
          1,
          { current_password: 'SamePass1', new_password: 'SamePass1' },
          'cookie',
        ),
      ).rejects.toThrow('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน');

      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('stores only the bcrypt hash, never the plain new password', async () => {
      await service.changePassword(1, DTO, 'cookie');

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass456', 12);
      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { password: 'new-hash', updated_at: expect.any(Date) },
      });
    });

    it('revokes every OTHER session and keeps the one this request came from', async () => {
      const result = await service.changePassword(1, DTO, 'cookie');

      expect(refreshTokenMock.findActiveFamilyForUser).toHaveBeenCalledWith(
        1,
        'cookie',
      );
      expect(refreshTokenMock.revokeAllForUser).toHaveBeenCalledWith(
        1,
        'family-A',
      );
      expect(result).toEqual({
        message: 'เปลี่ยนรหัสผ่านสำเร็จ',
        other_sessions_revoked: 3,
        current_session_kept: true,
      });
    });

    it('revokes ALL sessions when this device cannot be identified (safe fallback)', async () => {
      refreshTokenMock.findActiveFamilyForUser.mockResolvedValue(undefined);

      const result = await service.changePassword(1, DTO, undefined);

      expect(refreshTokenMock.revokeAllForUser).toHaveBeenCalledWith(
        1,
        undefined,
      );
      expect(result.current_session_kept).toBe(false);
    });

    it('fails with 401 when the account no longer exists', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword(1, DTO, 'cookie'),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('logout', () => {
    it('should revoke the supplied refresh token', async () => {
      await service.logout('refresh-token');

      expect(refreshTokenMock.revoke).toHaveBeenCalledWith('refresh-token');
    });

    it('should succeed even when no refresh token is present', async () => {
      await expect(service.logout(undefined)).resolves.toEqual({
        message: 'ออกจากระบบเรียบร้อย',
      });

      expect(refreshTokenMock.revoke).not.toHaveBeenCalled();
    });
  });
});

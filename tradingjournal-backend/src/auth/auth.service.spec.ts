import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
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
  },
};

const jwtMock = {
  signAsync: jest.fn(),
};

const refreshTokenMock = {
  issue: jest.fn(),
  rotate: jest.fn(),
  revoke: jest.fn(),
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

      expect(refreshTokenMock.rotate).toHaveBeenCalledWith('old-refresh-token', {
        userAgent: 'jest',
      });
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

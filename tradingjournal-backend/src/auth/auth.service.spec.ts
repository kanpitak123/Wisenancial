import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

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

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
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
    prismaMock.users.findUnique.mockResolvedValue({
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
    });

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwtMock.signAsync.mockResolvedValue('access-token');

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
});

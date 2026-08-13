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
});

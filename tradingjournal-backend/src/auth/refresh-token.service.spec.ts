import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

const prismaMock = {
  refresh_tokens: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
};

const jwtMock = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const defaultConfig = (key: string): string | undefined => {
  if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
  if (key === 'JWT_REFRESH_EXPIRES') return '2592000';
  return undefined;
};

const configMock = {
  get: jest.fn(defaultConfig),
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const RAW_TOKEN = 'raw.refresh.token';

const VALID_PAYLOAD = {
  sub: 7,
  jti: '11111111-1111-4111-8111-111111111111',
  fam: '22222222-2222-4222-8222-222222222222',
};

const INVALID_MESSAGE = 'Refresh Token หมดอายุหรือไม่ถูกต้อง';

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    user_id: 7,
    jti: VALID_PAYLOAD.jti,
    token_hash: sha256(RAW_TOKEN),
    family_id: VALID_PAYLOAD.fam,
    expires_at: new Date(Date.now() + 60_000),
    revoked_at: null,
    used_at: null,
    ...overrides,
  };
}

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    configMock.get.mockImplementation(defaultConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);

    prismaMock.refresh_tokens.create.mockResolvedValue({});
    prismaMock.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });
  });

  it('should read the refresh lifetime from JWT_REFRESH_EXPIRES', () => {
    expect(service.ttlSeconds).toBe(2_592_000);
  });

  it('should fall back to 30 days when JWT_REFRESH_EXPIRES is unusable', () => {
    configMock.get.mockImplementation((key: string) =>
      key === 'JWT_REFRESH_SECRET' ? 'refresh-secret' : 'not-a-duration',
    );

    expect(service.ttlSeconds).toBe(30 * 24 * 60 * 60);
  });

  describe('issue', () => {
    it('should store the hash of the token rather than the token itself', async () => {
      jwtMock.signAsync.mockResolvedValue(RAW_TOKEN);

      const issued = await service.issue(7, {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });

      expect(issued.token).toBe(RAW_TOKEN);

      const created = prismaMock.refresh_tokens.create.mock.calls[0][0].data;

      expect(created.token_hash).toBe(sha256(RAW_TOKEN));
      expect(created.user_id).toBe(7);
      expect(created.user_agent).toBe('jest');
      expect(created.ip_address).toBe('127.0.0.1');
      expect(JSON.stringify(created)).not.toContain(RAW_TOKEN);
    });

    it('should start a new family per login but keep the family when one is supplied', async () => {
      jwtMock.signAsync.mockResolvedValue(RAW_TOKEN);

      await service.issue(7);
      await service.issue(7);

      const firstFamily =
        prismaMock.refresh_tokens.create.mock.calls[0][0].data.family_id;
      const secondFamily =
        prismaMock.refresh_tokens.create.mock.calls[1][0].data.family_id;

      expect(firstFamily).not.toBe(secondFamily);

      await service.issue(7, {}, 'fixed-family');

      expect(
        prismaMock.refresh_tokens.create.mock.calls[2][0].data.family_id,
      ).toBe('fixed-family');
    });

    it('should sign with the refresh secret, not the access secret', async () => {
      jwtMock.signAsync.mockResolvedValue(RAW_TOKEN);

      await service.issue(7);

      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 7 }),
        expect.objectContaining({ secret: 'refresh-secret' }),
      );
    });
  });

  describe('rotate', () => {
    it('should burn the old token and issue a replacement in the same family', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(tokenRow());
      jwtMock.signAsync.mockResolvedValue('next.refresh.token');

      const result = await service.rotate(RAW_TOKEN);

      expect(result.userId).toBe(7);
      expect(result.refreshToken.token).toBe('next.refresh.token');

      const burn = prismaMock.refresh_tokens.updateMany.mock.calls[0][0];

      expect(burn.where).toEqual({ id: 10, used_at: null, revoked_at: null });
      expect(burn.data.used_at).toBeInstanceOf(Date);
      expect(burn.data.revoked_at).toBeInstanceOf(Date);

      expect(
        prismaMock.refresh_tokens.create.mock.calls[0][0].data.family_id,
      ).toBe(VALID_PAYLOAD.fam);
    });

    it('should reject a token with a bad signature', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);

      expect(prismaMock.refresh_tokens.findUnique).not.toHaveBeenCalled();
    });

    it('should reject a token whose row was already deleted', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(null);

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);
    });

    it('should reject an expired token', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(
        tokenRow({ expires_at: new Date(Date.now() - 1_000) }),
      );

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);

      expect(prismaMock.refresh_tokens.create).not.toHaveBeenCalled();
    });

    it('should revoke the whole family when an already-used token comes back', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(
        tokenRow({ used_at: new Date() }),
      );

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);

      expect(prismaMock.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { family_id: VALID_PAYLOAD.fam, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
      expect(prismaMock.refresh_tokens.create).not.toHaveBeenCalled();
    });

    it('should revoke the whole family when a revoked token comes back', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(
        tokenRow({ revoked_at: new Date() }),
      );

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);

      expect(prismaMock.refresh_tokens.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { family_id: VALID_PAYLOAD.fam, revoked_at: null },
        }),
      );
    });

    it('should revoke the family when the stored hash does not match the token', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(
        tokenRow({ token_hash: sha256('some.other.token') }),
      );

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);

      expect(prismaMock.refresh_tokens.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { family_id: VALID_PAYLOAD.fam, revoked_at: null },
        }),
      );
    });

    it('should treat a lost race for the same token as reuse', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue(tokenRow());
      // อีกคำขอชิงอัปเดตไปก่อนแล้ว เงื่อนไข used_at/revoked_at จึงไม่แมตช์
      prismaMock.refresh_tokens.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.rotate(RAW_TOKEN)).rejects.toThrow(INVALID_MESSAGE);

      expect(prismaMock.refresh_tokens.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('should revoke every token in the family, not just the current one', async () => {
      jwtMock.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
      prismaMock.refresh_tokens.findUnique.mockResolvedValue({
        family_id: VALID_PAYLOAD.fam,
      });

      await service.revoke(RAW_TOKEN);

      expect(prismaMock.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { family_id: VALID_PAYLOAD.fam, revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
    });

    it('should stay silent for an unusable token so logout never fails', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('expired'));

      await expect(service.revoke(RAW_TOKEN)).resolves.toBeUndefined();

      expect(prismaMock.refresh_tokens.updateMany).not.toHaveBeenCalled();
    });
  });
});

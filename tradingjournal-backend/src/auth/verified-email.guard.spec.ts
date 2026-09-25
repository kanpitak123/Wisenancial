import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VerifiedEmailGuard } from './verified-email.guard';

const prismaMock = { users: { findUnique: jest.fn() } };

function contextFor(user: { userId?: number } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('VerifiedEmailGuard', () => {
  let guard: VerifiedEmailGuard;
  const saved = process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    // ทุกเทสต์ยกเว้นที่ทดสอบค่าดีฟอลต์ ทำงานกับ guard ที่เปิดอยู่
    process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = 'true';
    guard = new VerifiedEmailGuard(prismaMock as unknown as PrismaService);
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI;
    else process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = saved;
  });

  it('lets a verified user through', async () => {
    prismaMock.users.findUnique.mockResolvedValue({
      email_verified_at: new Date(),
    });

    await expect(guard.canActivate(contextFor({ userId: 1 }))).resolves.toBe(
      true,
    );
  });

  it('blocks an unverified user with 403 and a machine-readable EMAIL_NOT_VERIFIED code', async () => {
    prismaMock.users.findUnique.mockResolvedValue({ email_verified_at: null });

    const error = await guard
      .canActivate(contextFor({ userId: 1 }))
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 403 });
    expect(
      (error as { getResponse: () => Record<string, unknown> }).getResponse(),
    ).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('reads the state from the database, not from the token', async () => {
    prismaMock.users.findUnique.mockResolvedValue({
      email_verified_at: new Date(),
    });

    await guard.canActivate(contextFor({ userId: 9 }));

    expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
      where: { id: 9 },
      select: { email_verified_at: true },
    });
  });

  it('403s when there is no authenticated user or the account is gone', async () => {
    await expect(
      guard.canActivate(contextFor(undefined)),
    ).rejects.toMatchObject({ status: 403 });

    prismaMock.users.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor({ userId: 1 })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('is OFF by default (variable unset) and does not touch the database', async () => {
    delete process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI;

    await expect(guard.canActivate(contextFor({ userId: 1 }))).resolves.toBe(
      true,
    );
    expect(prismaMock.users.findUnique).not.toHaveBeenCalled();
  });

  it.each(['false', '', '1', 'TRUE'])(
    'only the exact value "true" turns it on — "%s" leaves it off',
    async (value) => {
      process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = value;

      await expect(guard.canActivate(contextFor({ userId: 1 }))).resolves.toBe(
        true,
      );
      expect(prismaMock.users.findUnique).not.toHaveBeenCalled();
    },
  );

  it('REQUIRE_VERIFIED_EMAIL_FOR_AI=false turns the check off without touching the database', async () => {
    process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = 'false';

    await expect(guard.canActivate(contextFor({ userId: 1 }))).resolves.toBe(
      true,
    );
    expect(prismaMock.users.findUnique).not.toHaveBeenCalled();
  });
});

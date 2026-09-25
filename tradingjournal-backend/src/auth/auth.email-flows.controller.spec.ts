import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailFlowsService } from './email-flows.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenService } from './refresh-token.service';

const emailFlows = {
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  sendVerificationEmail: jest.fn(),
  verifyEmail: jest.fn(),
};

describe('AuthController — email flows', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: RefreshTokenService, useValue: { ttlSeconds: 60 } },
        { provide: EmailFlowsService, useValue: emailFlows },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AuthController);
  });

  describe('POST /auth/forgot-password', () => {
    it('answers the same message whether or not the account exists', () => {
      emailFlows.requestPasswordReset.mockResolvedValue(undefined);
      const known = controller.forgotPassword({ email: 'alice@example.com' });

      emailFlows.requestPasswordReset.mockResolvedValue(undefined);
      const unknown = controller.forgotPassword({ email: 'ghost@example.com' });

      expect(known).toEqual(unknown);
      expect(known.message).toContain('หากอีเมลนี้มีบัญชีอยู่');
    });

    it('does not wait for the lookup or the mail — a slow path cannot be timed to find real accounts', () => {
      emailFlows.requestPasswordReset.mockReturnValue(
        new Promise(() => undefined),
      );

      // ฟังก์ชันซิงก์คืนค่าทันที ไม่ใช่ Promise ที่รอผลของ service
      const result = controller.forgotPassword({ email: 'alice@example.com' });

      expect(result).not.toBeInstanceOf(Promise);
      expect(emailFlows.requestPasswordReset).toHaveBeenCalledWith(
        'alice@example.com',
      );
    });

    it('a failing lookup is swallowed (no unhandled rejection) and the response is unchanged', async () => {
      emailFlows.requestPasswordReset.mockRejectedValue(new Error('db down'));

      const result = controller.forgotPassword({ email: 'alice@example.com' });
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.message).toContain('หากอีเมลนี้มีบัญชีอยู่');
    });
  });

  it('POST /auth/reset-password passes token + new password to the service', async () => {
    emailFlows.resetPassword.mockResolvedValue({ message: 'ok' });

    await controller.resetPassword({
      token: 't'.repeat(43),
      new_password: 'NewPass123',
    });

    expect(emailFlows.resetPassword).toHaveBeenCalledWith(
      't'.repeat(43),
      'NewPass123',
    );
  });

  it('POST /auth/send-verification uses the user id from the access token, not from the body', async () => {
    emailFlows.sendVerificationEmail.mockResolvedValue({ message: 'ok' });

    await controller.sendVerification({
      userId: 42,
      email: 'a@b.co',
      username: 'a',
      role: 'USER',
    } as never);

    expect(emailFlows.sendVerificationEmail).toHaveBeenCalledWith(42);
  });

  it('POST /auth/verify-email passes the token to the service', async () => {
    emailFlows.verifyEmail.mockResolvedValue({ message: 'ok' });

    await controller.verifyEmail({ token: 't'.repeat(43) });

    expect(emailFlows.verifyEmail).toHaveBeenCalledWith('t'.repeat(43));
  });
});

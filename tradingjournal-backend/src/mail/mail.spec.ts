import { Logger } from '@nestjs/common';
import { ConsoleMailer, maskEmail } from './console.mailer';
import { buildTokenLink, resolveFrontendBaseUrl } from './frontend-link';
import { createMailer } from './mail.module';
import { renderPasswordResetEmail, renderVerifyEmail } from './mail-templates';
import { Mailer } from './mailer';

const MESSAGE = {
  to: 'alice@example.com',
  subject: 'Reset',
  text: 'open https://app.test/#/ResetPassword?token=RAWTOKEN',
};

describe('ConsoleMailer', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dev: logs the link so it can be clicked, with the recipient masked', async () => {
    await new ConsoleMailer(false).send(MESSAGE);

    const line = String(logSpy.mock.calls[0][0]);

    expect(line).toContain('RAWTOKEN');
    expect(line).toContain('a***@example.com');
    expect(line).not.toContain('alice@example.com');
  });

  it('production: never prints the body (a live reset link) — only a "not sent" warning', async () => {
    await new ConsoleMailer(true).send(MESSAGE);

    const output = [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((call) => String(call[0]))
      .join('\n');

    expect(output).not.toContain('RAWTOKEN');
    expect(output).not.toContain('alice@example.com');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('was NOT sent');
  });

  it('maskEmail keeps only the first character and the domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    expect(maskEmail('nonsense')).toBe('***');
  });
});

describe('createMailer', () => {
  it('defaults to the console transport when MAIL_TRANSPORT is unset or blank', () => {
    expect(createMailer(undefined)).toBeInstanceOf(ConsoleMailer);
    expect(createMailer('  ')).toBeInstanceOf(ConsoleMailer);
    expect(createMailer('CONSOLE')).toBeInstanceOf(Mailer);
  });

  it('fails loudly at boot on an unknown transport instead of silently sending nothing', () => {
    expect(() => createMailer('carrier-pigeon')).toThrow(
      /Unknown MAIL_TRANSPORT "carrier-pigeon" — available: console/,
    );
  });
});

describe('frontend links', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('puts the token after the # so it never reaches a server log or Referer', () => {
    expect(buildTokenLink('https://app.test', 'ResetPassword', 'a+b/c')).toBe(
      'https://app.test/#/ResetPassword?token=a%2Bb%2Fc',
    );
  });

  it('prefers FRONTEND_URL, falls back to the first CORS origin, trims trailing slashes', () => {
    process.env.FRONTEND_URL = 'https://app.test/';
    expect(resolveFrontendBaseUrl()).toBe('https://app.test');

    delete process.env.FRONTEND_URL;
    process.env.CORS_ORIGINS = 'https://a.test,https://b.test';
    expect(resolveFrontendBaseUrl()).toBe('https://a.test');
  });

  it('returns null in production when nothing is configured, so no email is sent with a bad link', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'production';

    expect(resolveFrontendBaseUrl()).toBeNull();
  });
});

describe('email templates', () => {
  it('reset email carries the link and the 30-minute single-use notice in both languages', () => {
    const mail = renderPasswordResetEmail({
      to: 'a@b.co',
      name: 'Alice',
      link: 'https://app.test/#/ResetPassword?token=T',
      ttlMinutes: 30,
    });

    expect(mail.to).toBe('a@b.co');
    expect(mail.text).toContain('https://app.test/#/ResetPassword?token=T');
    expect(mail.text).toContain('30 นาที');
    expect(mail.text).toContain('30 minutes');
    expect(mail.text).toContain("If you didn't request a reset");
  });

  it('verify email carries the link and the 24-hour notice', () => {
    const mail = renderVerifyEmail({
      to: 'a@b.co',
      name: 'Alice',
      link: 'https://app.test/#/VerifyEmail?token=T',
      ttlHours: 24,
    });

    expect(mail.text).toContain('https://app.test/#/VerifyEmail?token=T');
    expect(mail.text).toContain('24 ชั่วโมง');
    expect(mail.text).toContain('24 hours');
  });
});

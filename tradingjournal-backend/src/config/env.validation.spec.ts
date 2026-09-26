import { assertProductionEnv, validateProductionEnv } from './env.validation';

const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);

/** A complete, valid production environment. */
const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@pooler.example.com/db?pgbouncer=true',
  DIRECT_URL: 'postgresql://u:p@direct.example.com/db',
  JWT_ACCESS_SECRET: SECRET_A,
  JWT_REFRESH_SECRET: SECRET_B,
  CORS_ORIGINS: 'https://app.example.com,https://www.example.com',
  API_PUBLIC_URL: 'https://api.example.com',
  STRIPE_SECRET_KEY: 'sk_live_' + 'x'.repeat(20),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'x'.repeat(20),
  STRIPE_PACK_159_PRICE_ID: 'price_1',
  STRIPE_PACK_219_PRICE_ID: 'price_2',
  STRIPE_PACK_279_PRICE_ID: 'price_3',
  STRIPE_PACK_399_PRICE_ID: 'price_4',
  ANTHROPIC_API_KEY: 'sk-ant-api03-' + 'x'.repeat(40),
  AI_MODEL_FAST: 'fast-model',
  AI_MODEL_SMART: 'smart-model',
  NEWS_API_KEY: 'news',
  MAIL_TRANSPORT: 'resend',
};

const without = (...names: string[]): NodeJS.ProcessEnv => {
  const env = { ...VALID };
  for (const name of names) delete env[name];
  return env;
};

const errorsOf = (env: NodeJS.ProcessEnv): string =>
  validateProductionEnv(env).errors.join('\n');

describe('validateProductionEnv', () => {
  it('a complete environment has no errors and no warnings', () => {
    expect(validateProductionEnv(VALID)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    'DATABASE_URL',
    'DIRECT_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ORIGINS',
    'API_PUBLIC_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PACK_159_PRICE_ID',
    'STRIPE_PACK_399_PRICE_ID',
    'ANTHROPIC_API_KEY',
    'AI_MODEL_FAST',
    'AI_MODEL_SMART',
  ])('%s missing is an error that names it', (name) => {
    expect(errorsOf(without(name))).toContain(name);
  });

  it('JWT_REFRESH_SECRET is checked at boot (it used to fail only on first login)', () => {
    expect(() => assertProductionEnv(without('JWT_REFRESH_SECRET'))).toThrow(
      /JWT_REFRESH_SECRET is required/,
    );
  });

  it('reports every problem at once, not just the first', () => {
    expect(
      validateProductionEnv({ NODE_ENV: 'production' }).errors.length,
    ).toBeGreaterThan(10);
  });

  it('secrets must be long enough and different from each other', () => {
    expect(errorsOf({ ...VALID, JWT_ACCESS_SECRET: 'short' })).toMatch(
      /JWT_ACCESS_SECRET must be at least 32/,
    );
    expect(errorsOf({ ...VALID, JWT_REFRESH_SECRET: SECRET_A })).toMatch(
      /must be different/,
    );
  });

  it('key formats are checked by prefix', () => {
    const errors = errorsOf({
      ...VALID,
      ANTHROPIC_API_KEY: 'gsk_looks_like_a_groq_key_' + 'x'.repeat(20),
      STRIPE_SECRET_KEY: 'not-a-stripe-key',
      STRIPE_WEBHOOK_SECRET: 'nope',
      STRIPE_PACK_159_PRICE_ID: 'prod_1',
      DATABASE_URL: 'mysql://x',
    });

    expect(errors).toMatch(/ANTHROPIC_API_KEY does not look like/);
    expect(errors).toMatch(/STRIPE_SECRET_KEY must start with/);
    expect(errors).toMatch(/STRIPE_WEBHOOK_SECRET must start with whsec_/);
    expect(errors).toMatch(/STRIPE_PACK_159_PRICE_ID must start with price_/);
    expect(errors).toMatch(/DATABASE_URL must be a postgres/);
  });

  it('CORS: no wildcard, http(s) URLs only; http and localhost are warnings', () => {
    expect(errorsOf({ ...VALID, CORS_ORIGINS: '*' })).toMatch(
      /must not contain "\*"/,
    );
    expect(errorsOf({ ...VALID, CORS_ORIGINS: 'app.example.com' })).toMatch(
      /not an http/,
    );

    const warn = validateProductionEnv({
      ...VALID,
      CORS_ORIGINS: 'http://localhost:9000',
    });
    expect(warn.errors).toEqual([]);
    expect(warn.warnings.join()).toMatch(/localhost/);
  });

  it('API_PUBLIC_URL must not be localhost', () => {
    expect(
      errorsOf({ ...VALID, API_PUBLIC_URL: 'http://localhost:3000' }),
    ).toMatch(/must not point at localhost/);
  });

  describe('AI providers', () => {
    it('the default is anthropic only: other keys are not required', () => {
      expect(validateProductionEnv(VALID).errors).toEqual([]);
    });

    it('a provider enabled by AI_PROVIDERS needs its key', () => {
      expect(errorsOf({ ...VALID, AI_PROVIDERS: 'anthropic,groq' })).toMatch(
        /GROQ_API_KEY is required/,
      );
    });

    it('an unknown provider name is an error', () => {
      expect(errorsOf({ ...VALID, AI_PROVIDERS: 'mistral' })).toMatch(
        /unknown provider "mistral"/,
      );
    });

    it('model ids are not required when anthropic is not enabled', () => {
      const env = {
        ...without('ANTHROPIC_API_KEY', 'AI_MODEL_FAST', 'AI_MODEL_SMART'),
        AI_PROVIDERS: 'groq',
        GROQ_API_KEY: 'gsk_' + 'x'.repeat(30),
      };

      expect(validateProductionEnv(env).errors).toEqual([]);
    });
  });

  describe('email', () => {
    it('console transport is a warning by itself', () => {
      const report = validateProductionEnv({
        ...VALID,
        MAIL_TRANSPORT: 'console',
      });

      expect(report.errors).toEqual([]);
      expect(report.warnings.join()).toMatch(/emails are not sent/);
    });

    it('requiring verified email with the console transport is an error (AI would be locked for everyone)', () => {
      expect(
        errorsOf({
          ...VALID,
          MAIL_TRANSPORT: 'console',
          REQUIRE_VERIFIED_EMAIL_FOR_AI: 'true',
        }),
      ).toMatch(
        /REQUIRE_VERIFIED_EMAIL_FOR_AI=true needs a real MAIL_TRANSPORT/,
      );
    });
  });

  it('numeric tuning variables must be whole numbers', () => {
    expect(errorsOf({ ...VALID, EXPORT_THROTTLE_LIMIT: 'ten' })).toMatch(
      /EXPORT_THROTTLE_LIMIT must be a whole number/,
    );
  });

  it('warns about risky-but-allowed settings', () => {
    const report = validateProductionEnv({
      ...VALID,
      TRUST_PROXY: 'true',
      SWAGGER_ENABLED: 'true',
    });

    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toMatch(/TRUST_PROXY=true/);
    expect(report.warnings.join('\n')).toMatch(/SWAGGER_ENABLED=true/);
  });
});

describe('assertProductionEnv', () => {
  it('does nothing outside production, however incomplete the env is', () => {
    expect(assertProductionEnv({})).toBeNull();
    expect(assertProductionEnv({ NODE_ENV: 'development' })).toBeNull();
    expect(assertProductionEnv({ NODE_ENV: 'test' })).toBeNull();
  });

  it('passes a valid production env', () => {
    expect(assertProductionEnv(VALID)).toEqual({ errors: [], warnings: [] });
  });

  it('the error lists variable names only, never a value', () => {
    const secretish = 'super-secret-value-that-must-not-leak-1234567890';
    let message = '';
    try {
      assertProductionEnv({
        ...VALID,
        JWT_ACCESS_SECRET: 'short',
        STRIPE_SECRET_KEY: secretish,
        DATABASE_URL: secretish,
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/Invalid production environment/);
    expect(message).not.toContain(secretish);
    expect(message).not.toContain('short');
  });
});

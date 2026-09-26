/**
 * Boot-time environment check for production.
 *
 * Several required variables used to fail only when a user hit the code that reads them
 * (JWT_REFRESH_SECRET on the first login, Stripe and Anthropic keys on the first paid
 * call), so a deploy looked healthy and then returned 500/503 to real users. This checks
 * everything in one go at startup and reports all problems together, by variable name only:
 * a value is never printed, not even in part.
 *
 * Only enforced when NODE_ENV=production; development and tests are not affected.
 */

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

type Env = NodeJS.ProcessEnv;

const MIN_SECRET_LENGTH = 32;

const isSet = (env: Env, name: string): boolean =>
  (env[name]?.trim() ?? '') !== '';

const valueOf = (env: Env, name: string): string => env[name]?.trim() ?? '';

function isUrl(value: string, protocols = ['http:', 'https:']): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const isLocalhost = (value: string): boolean => {
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
};

/** Providers the AI layer may use, from AI_PROVIDERS (default anthropic only). */
function enabledAiProviders(env: Env): string[] {
  const listed = valueOf(env, 'AI_PROVIDERS')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return listed.length > 0 ? listed : ['anthropic'];
}

export function validateProductionEnv(env: Env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const need = (name: string, why: string): boolean => {
    if (isSet(env, name)) return true;
    errors.push(`${name} is required: ${why}`);
    return false;
  };

  // ── Database ────────────────────────────────────────────────────────────────
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    if (
      need(
        name,
        name === 'DATABASE_URL'
          ? 'pooled Postgres connection string'
          : 'direct (non-pooled) connection used by prisma migrate',
      ) &&
      !isUrl(valueOf(env, name), ['postgres:', 'postgresql:'])
    ) {
      errors.push(`${name} must be a postgres:// or postgresql:// URL`);
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const secrets: Record<string, string> = {};
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!need(name, 'signs auth tokens')) continue;

    secrets[name] = valueOf(env, name);
    if (secrets[name].length < MIN_SECRET_LENGTH) {
      errors.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
    }
  }
  if (
    secrets.JWT_ACCESS_SECRET !== undefined &&
    secrets.JWT_ACCESS_SECRET === secrets.JWT_REFRESH_SECRET
  ) {
    errors.push(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values',
    );
  }

  // ── Origins / URLs ──────────────────────────────────────────────────────────
  const origins = valueOf(env, 'CORS_ORIGINS') || valueOf(env, 'FRONTEND_URL');
  if (origins === '') {
    errors.push(
      'CORS_ORIGINS (or FRONTEND_URL) is required: allowed web origins',
    );
  } else {
    for (const origin of origins.split(',').map((item) => item.trim())) {
      if (origin === '*') {
        errors.push(
          'CORS_ORIGINS must not contain "*" (credentials are enabled)',
        );
      } else if (!isUrl(origin)) {
        errors.push(
          'CORS_ORIGINS / FRONTEND_URL contains a value that is not an http(s) URL',
        );
      } else if (!origin.startsWith('https://')) {
        warnings.push(
          isLocalhost(origin)
            ? 'CORS_ORIGINS / FRONTEND_URL still lists a localhost origin'
            : 'CORS_ORIGINS / FRONTEND_URL has a non-https origin: the SameSite=None cookie needs HTTPS',
        );
      }
    }
  }

  if (
    need('API_PUBLIC_URL', 'public base URL of this API (share-image links)')
  ) {
    const url = valueOf(env, 'API_PUBLIC_URL');
    if (!isUrl(url)) errors.push('API_PUBLIC_URL must be an http(s) URL');
    else if (isLocalhost(url))
      errors.push('API_PUBLIC_URL must not point at localhost in production');
  }

  // ── Stripe ──────────────────────────────────────────────────────────────────
  if (
    need('STRIPE_SECRET_KEY', 'billing') &&
    !/^sk_(live|test)_/.test(valueOf(env, 'STRIPE_SECRET_KEY'))
  ) {
    errors.push('STRIPE_SECRET_KEY must start with sk_live_ or sk_test_');
  }
  if (
    need('STRIPE_WEBHOOK_SECRET', 'verifies Stripe webhooks') &&
    !valueOf(env, 'STRIPE_WEBHOOK_SECRET').startsWith('whsec_')
  ) {
    errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
  }
  for (const name of [
    'STRIPE_PACK_159_PRICE_ID',
    'STRIPE_PACK_219_PRICE_ID',
    'STRIPE_PACK_279_PRICE_ID',
    'STRIPE_PACK_399_PRICE_ID',
  ]) {
    if (
      need(name, 'Stripe price id of a subscription tier') &&
      !valueOf(env, name).startsWith('price_')
    ) {
      errors.push(`${name} must start with price_`);
    }
  }

  // ── AI (Anthropic is the primary provider; others only if enabled) ──────────
  const providers = enabledAiProviders(env);
  const keyPrefix: Record<string, [string, RegExp]> = {
    anthropic: ['ANTHROPIC_API_KEY', /^sk-ant-/],
    groq: ['GROQ_API_KEY', /^gsk_/],
    gemini: ['GEMINI_API_KEY', /^AIza/],
    openai: ['OPENAI_API_KEY', /^sk-/],
  };
  for (const provider of providers) {
    const rule = keyPrefix[provider];
    if (!rule) {
      errors.push(`AI_PROVIDERS lists an unknown provider "${provider}"`);
      continue;
    }
    const [name, prefix] = rule;
    if (
      need(name, `AI provider "${provider}" is enabled by AI_PROVIDERS`) &&
      !prefix.test(valueOf(env, name))
    ) {
      errors.push(
        `${name} does not look like a ${provider} key (wrong prefix)`,
      );
    }
  }
  if (providers.includes('anthropic')) {
    need('AI_MODEL_FAST', 'model id for the fast tier (GET /v1/models)');
    need('AI_MODEL_SMART', 'model id for the smart tier (GET /v1/models)');
  }

  // ── Email ───────────────────────────────────────────────────────────────────
  const transport = (valueOf(env, 'MAIL_TRANSPORT') || 'console').toLowerCase();
  if (transport === 'console') {
    if (valueOf(env, 'REQUIRE_VERIFIED_EMAIL_FOR_AI') === 'true') {
      errors.push(
        'REQUIRE_VERIFIED_EMAIL_FOR_AI=true needs a real MAIL_TRANSPORT: with "console" no verification email is ever sent and AI is locked for everyone',
      );
    } else {
      warnings.push(
        'MAIL_TRANSPORT is "console": verification and password-reset emails are not sent',
      );
    }
  }

  // ── Numbers, flags and soft checks ──────────────────────────────────────────
  for (const name of [
    'PORT',
    'THROTTLE_TTL_SECONDS',
    'THROTTLE_LIMIT',
    'AUTH_THROTTLE_TTL_SECONDS',
    'AUTH_THROTTLE_LIMIT',
    'EXPORT_THROTTLE_TTL_SECONDS',
    'EXPORT_THROTTLE_LIMIT',
    'MT_INGEST_THROTTLE_TTL_SECONDS',
    'MT_INGEST_THROTTLE_LIMIT',
  ]) {
    if (isSet(env, name) && !/^\d+$/.test(valueOf(env, name))) {
      errors.push(`${name} must be a whole number`);
    }
  }

  if (valueOf(env, 'TRUST_PROXY').toLowerCase() === 'true') {
    warnings.push(
      'TRUST_PROXY=true trusts every hop, so clients can spoof their IP; prefer the number of proxies in front of the app',
    );
  }
  if (valueOf(env, 'SWAGGER_ENABLED') === 'true') {
    warnings.push(
      'SWAGGER_ENABLED=true exposes the API documentation publicly',
    );
  }
  if (!isSet(env, 'NEWS_API_KEY')) {
    warnings.push('NEWS_API_KEY is not set: investor news sync is off');
  }

  return { errors, warnings };
}

/**
 * Throws with every problem listed (names only) when production env is invalid; logs the
 * warnings. Does nothing outside production.
 */
export function assertProductionEnv(env: Env = process.env): EnvReport | null {
  if (env.NODE_ENV !== 'production') return null;

  const report = validateProductionEnv(env);

  for (const warning of report.warnings) {
    console.warn(`[env] warning: ${warning}`);
  }

  if (report.errors.length > 0) {
    throw new Error(
      `Invalid production environment (${report.errors.length} problem${report.errors.length === 1 ? '' : 's'}):\n` +
        report.errors.map((error) => `  - ${error}`).join('\n'),
    );
  }

  return report;
}

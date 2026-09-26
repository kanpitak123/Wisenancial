/**
 * Config for the shadow guardrails second pass. Read from process.env on every run (like
 * NEWS_CLASSIFIER_ENABLED) so a flag flip needs a restart at most, and a malformed
 * value falls back to the safe default instead of throwing inside a cron.
 */
export interface NewsGuardrailsConfig {
  /** NEWS_GUARDRAILS_ENABLED — master switch, default OFF. */
  enabled: boolean;
  /** NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD — rows whose first-pass ai_confidence is below this qualify. */
  confidenceThreshold: number;
  /** NEWS_GUARDRAILS_DAILY_BUDGET — hard cap on analysed articles per UTC day. */
  dailyBudget: number;
  /** NEWS_GUARDRAILS_BATCH_SIZE — max articles per cron tick (each takes ~47 s on Claude). */
  batchSize: number;
  /** NEWS_GUARDRAILS_MAX_AGE_HOURS — ignore articles published longer ago than this. */
  maxAgeHours: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_DAILY_BUDGET = 20;
export const DEFAULT_BATCH_SIZE = 3;
export const MAX_BATCH_SIZE = 10;
export const DEFAULT_MAX_AGE_HOURS = 48;

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function loadNewsGuardrailsConfig(
  env: NodeJS.ProcessEnv = process.env,
): NewsGuardrailsConfig {
  const threshold = parseNumber(env.NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD);
  const budget = parseNumber(env.NEWS_GUARDRAILS_DAILY_BUDGET);
  const batch = parseNumber(env.NEWS_GUARDRAILS_BATCH_SIZE);
  const maxAge = parseNumber(env.NEWS_GUARDRAILS_MAX_AGE_HOURS);

  return {
    enabled: env.NEWS_GUARDRAILS_ENABLED === 'true',
    confidenceThreshold:
      threshold !== null && threshold > 0 && threshold <= 1
        ? threshold
        : DEFAULT_CONFIDENCE_THRESHOLD,
    dailyBudget:
      budget !== null && budget >= 0
        ? Math.floor(budget)
        : DEFAULT_DAILY_BUDGET,
    batchSize:
      batch !== null && batch >= 1
        ? Math.min(Math.floor(batch), MAX_BATCH_SIZE)
        : DEFAULT_BATCH_SIZE,
    maxAgeHours: maxAge !== null && maxAge > 0 ? maxAge : DEFAULT_MAX_AGE_HOURS,
  };
}

import type { AiProviderId } from './ai.models';

/**
 * Runtime AI configuration, read from the environment on demand (not at import time)
 * so a flag flip needs a restart at most and tests can set env per case.
 */

const ALL_PROVIDERS: readonly AiProviderId[] = [
  'groq',
  'gemini',
  'openai',
  'anthropic',
];

/** Anthropic is the only provider unless AI_PROVIDERS says otherwise. */
export const DEFAULT_AI_PROVIDERS: readonly AiProviderId[] = ['anthropic'];

/**
 * Providers that may serve a request. A provider that is not listed here is treated as
 * absent everywhere — model picker, system fallback walk, user requests — even if its
 * API key is set, so a parked provider can never answer (or bill) by accident.
 *
 * Comma-separated, e.g. `AI_PROVIDERS=anthropic` or `AI_PROVIDERS=anthropic,groq`.
 * Unknown names are ignored; an empty/unusable value falls back to the default rather
 * than leaving the server with no provider at all.
 */
export function loadEnabledAiProviders(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<AiProviderId> {
  const requested = (env.AI_PROVIDERS ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is AiProviderId =>
      (ALL_PROVIDERS as readonly string[]).includes(name),
    );

  return new Set(requested.length > 0 ? requested : DEFAULT_AI_PROVIDERS);
}

export type AiModelTier = 'fast' | 'smart';

/**
 * Fallbacks used only when AI_MODEL_FAST / AI_MODEL_SMART are unset. They are starting
 * points, not the source of truth: set the env vars to the ids GET /v1/models returns
 * for the workspace.
 */
export const DEFAULT_TIER_MODELS: Readonly<Record<AiModelTier, string>> = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-5',
};

const TIER_ENV: Readonly<Record<AiModelTier, string>> = {
  fast: 'AI_MODEL_FAST',
  smart: 'AI_MODEL_SMART',
};

/** The upstream Anthropic model id behind a tier. */
export function resolveTierModel(
  tier: AiModelTier,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env[TIER_ENV[tier]]?.trim() || DEFAULT_TIER_MODELS[tier];
}

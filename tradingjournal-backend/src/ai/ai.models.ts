/**
 * Model-agnostic pricing registry.
 *
 * A "credit" is the billing unit users pre-purchase. Rates are expressed per
 * 1k tokens and split input/output because upstream output tokens cost 3-5x
 * more than input tokens on every provider — a single blended rate would
 * under-charge output-heavy calls (long JSON reports) and over-charge
 * input-heavy ones (large portfolio dumps).
 *
 * Only models with a registered provider belong here. Adding an entry without
 * a matching IAiProvider makes executeAiRequest throw at runtime.
 */

export type AiProviderId = 'groq' | 'gemini' | 'openai' | 'anthropic';

export type AiModelId =
  | 'groq-llama3'
  | 'gemini-2.5-flash'
  | 'gpt-4o'
  | 'claude-sonnet-5';

export interface AiModelPricing {
  /** Public id: what the frontend sends and what we write to ai_usage_logs.model_used. */
  readonly id: AiModelId;
  readonly provider: AiProviderId;
  /** Human-facing name for the model picker. */
  readonly label: string;
  /** The string sent to the upstream API. Decoupled so we can bump versions without breaking clients. */
  readonly upstreamModel: string;
  readonly creditsPer1kInput: number;
  readonly creditsPer1kOutput: number;
}

export const AI_MODEL_REGISTRY: Readonly<Record<AiModelId, AiModelPricing>> = {
  'groq-llama3': {
    id: 'groq-llama3',
    provider: 'groq',
    label: 'Llama 3.1 8B (Fast)',
    upstreamModel: 'llama-3.1-8b-instant',
    creditsPer1kInput: 1,
    creditsPer1kOutput: 1,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash (Balanced)',
    upstreamModel: 'gemini-2.5-flash',
    creditsPer1kInput: 5,
    creditsPer1kOutput: 15,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    provider: 'openai',
    label: 'GPT-4o (Premium)',
    upstreamModel: 'gpt-4o',
    creditsPer1kInput: 50,
    creditsPer1kOutput: 150,
  },
  'claude-sonnet-5': {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5 (Expert)',
    upstreamModel: 'claude-sonnet-5',
    creditsPer1kInput: 60,
    creditsPer1kOutput: 300,
  },
} as const;

/**
 * Balance a user must hold before we will start any request. Charging happens
 * after the call, when real token counts are known, so this floor absorbs the
 * cost of a request whose size we cannot predict up front.
 */
export const MIN_CREDIT_BALANCE = 10;

/** Every call costs at least this much, so trivial prompts still bill something. */
export const MIN_CREDITS_PER_CALL = 1;

export function isAiModelId(value: string): value is AiModelId {
  return Object.prototype.hasOwnProperty.call(AI_MODEL_REGISTRY, value);
}

export function getModelPricing(modelId: AiModelId): AiModelPricing {
  return AI_MODEL_REGISTRY[modelId];
}

export function listAiModels(): readonly AiModelPricing[] {
  return Object.values(AI_MODEL_REGISTRY);
}

/**
 * Exact (fractional) credit cost of a call. Callers round this to the integer
 * that is actually removed from the balance.
 */
export function calculateCredits(
  pricing: AiModelPricing,
  tokensInput: number,
  tokensOutput: number,
): number {
  const input = (Math.max(0, tokensInput) / 1000) * pricing.creditsPer1kInput;
  const output = (Math.max(0, tokensOutput) / 1000) * pricing.creditsPer1kOutput;
  return input + output;
}

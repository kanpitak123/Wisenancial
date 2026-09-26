import { ServiceUnavailableException } from '@nestjs/common';
import { AiManagerService } from './ai-manager.service';
import type { IAiProvider } from './providers/ai-provider.interface';

/**
 * Claude is the only AI provider. AI_PROVIDERS (default: anthropic) is an allow-list:
 * a parked provider (groq/gemini/openai) must never answer or bill, even with its key
 * configured, and a failing Claude must surface as a clear error, not a fallback.
 */

type ProviderId = 'groq' | 'gemini' | 'openai' | 'anthropic';

const httpError = (status: number, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

interface Upstream {
  provider: ProviderId;
  upstreamModel: string;
}

function fakeProvider(
  id: ProviderId,
  seen: Upstream[],
  fails?: Error,
): IAiProvider {
  return {
    id,
    isConfigured: () => true,
    generateJsonResponse: jest.fn((options: { upstreamModel: string }) => {
      seen.push({ provider: id, upstreamModel: options.upstreamModel });
      if (fails) return Promise.reject(fails);
      return Promise.resolve({
        data: { ok: true } as never,
        usage: { inputTokens: 1000, outputTokens: 1000 },
      });
    }),
  } as IAiProvider;
}

function makeManager(opts: { claudeFails?: Error; balance?: number } = {}) {
  const seen: Upstream[] = [];
  const prisma = {
    users: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ai_token_balance: opts.balance ?? 500 }),
    },
    ai_usage_logs: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue(400),
  };

  const manager = new AiManagerService(
    prisma as never,
    fakeProvider('groq', seen) as never,
    fakeProvider('gemini', seen) as never,
    fakeProvider('openai', seen) as never,
    fakeProvider('anthropic', seen, opts.claudeFails) as never,
  );

  jest.spyOn(manager['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(manager['logger'], 'error').mockImplementation(() => undefined);
  jest.spyOn(manager['logger'], 'log').mockImplementation(() => undefined);

  return { manager, seen, prisma };
}

const ENV_KEYS = ['AI_PROVIDERS', 'AI_MODEL_FAST', 'AI_MODEL_SMART'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.AI_MODEL_FAST = 'test-fast-model';
  process.env.AI_MODEL_SMART = 'test-smart-model';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('AI_PROVIDERS default (anthropic only)', () => {
  it('lists only the Claude tiers, even though every provider has a key', () => {
    const { manager } = makeManager();

    expect(manager.listAvailableModels().map((m) => m.id)).toEqual([
      'claude-fast',
      'claude-smart',
    ]);
  });

  it('a system job with no model goes to claude-fast and nothing else', async () => {
    const { manager, seen } = makeManager();

    const result = await manager.executeSystemAiRequest({ prompt: 'x' });

    expect(result.model).toBe('claude-fast');
    expect(seen).toEqual([
      { provider: 'anthropic', upstreamModel: 'test-fast-model' },
    ]);
  });

  it('claude-smart is used only when asked for, and maps to AI_MODEL_SMART', async () => {
    const { manager, seen } = makeManager();

    const result = await manager.executeSystemAiRequest({
      prompt: 'x',
      modelId: 'claude-smart',
      preferredOnly: true,
    });

    expect(result.model).toBe('claude-smart');
    expect(seen).toEqual([
      { provider: 'anthropic', upstreamModel: 'test-smart-model' },
    ]);
  });

  it('Claude failing on a system job is an error: no parked provider answers, no smart escalation', async () => {
    const { manager, seen } = makeManager({ claudeFails: httpError(429) });

    await expect(
      manager.executeSystemAiRequest({ prompt: 'x' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(seen).toEqual([
      { provider: 'anthropic', upstreamModel: 'test-fast-model' },
    ]);
  });

  it('a system request that names a parked model is refused, not rerouted', async () => {
    const { manager, seen } = makeManager();

    await expect(
      manager.executeSystemAiRequest({
        prompt: 'x',
        modelId: 'groq-llama3',
        preferredOnly: true,
      }),
    ).rejects.toThrow(/No AI provider is configured/);

    expect(seen).toEqual([]);
  });

  it('when anthropic is not in AI_PROVIDERS a user request is refused, not rerouted, and nothing is charged', async () => {
    process.env.AI_PROVIDERS = 'groq';
    const { manager, seen, prisma } = makeManager();

    const error = await manager
      .executeAiRequest({ userId: 1, feature: 'portfolio_review', prompt: 'x' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toContain('not enabled');
    expect(seen).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('each feature is served by its fixed tier and charged its flat price', async () => {
    const cases = [
      ['chart_insight', 'test-fast-model', 5],
      ['ai_picks', 'test-fast-model', 10],
      ['risk_analysis', 'test-smart-model', 20],
      ['portfolio_review', 'test-smart-model', 20],
    ] as const;

    for (const [feature, upstreamModel, credits] of cases) {
      const { manager, seen, prisma } = makeManager();

      const result = await manager.executeAiRequest({
        userId: 1,
        feature,
        prompt: 'x',
      });

      expect(seen).toEqual([{ provider: 'anthropic', upstreamModel }]);
      // the fake provider reports 1k in + 1k out; the price does not depend on that
      expect(result.creditsCharged).toBe(credits);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    }
  });

  it('Claude failing on a user request: clear AI_PROVIDER_UNAVAILABLE, no fallback, credits NOT charged', async () => {
    const { manager, seen, prisma } = makeManager({
      claudeFails: httpError(503),
    });

    const error = await manager
      .executeAiRequest({ userId: 1, feature: 'portfolio_review', prompt: 'x' })
      .catch((caught: unknown) => caught);

    const body = (error as ServiceUnavailableException).getResponse() as {
      error: string;
      provider: string;
    };
    expect(body.error).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(body.provider).toBe('anthropic');

    expect(seen).toHaveLength(1);
    expect(seen[0]?.provider).toBe('anthropic');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ai_usage_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        credits_deducted: 0,
      }) as unknown,
    });
  });
});

describe('AI_PROVIDERS opt-in', () => {
  it('listing a parked provider brings it back', () => {
    process.env.AI_PROVIDERS = 'anthropic,groq';
    const { manager } = makeManager();

    expect(manager.listAvailableModels().map((m) => m.id)).toEqual([
      'groq-llama3',
      'claude-fast',
      'claude-smart',
    ]);
  });
});

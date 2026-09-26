import { WrongLanguageError } from './ai-language';
import { AiManagerService } from './ai-manager.service';
import type { IAiProvider } from './providers/ai-provider.interface';

/**
 * Wrong-language answers: retried once with a correction, refused (and not charged) if the
 * second answer is still wrong. Only an accepted answer is ever billed.
 */

const THAI =
  'พอร์ตนี้กระจุกตัวในหุ้นเทคโนโลยีสหรัฐมากเกินไป ควรติดตามความเสี่ยงด้านการกระจายการลงทุนอย่างใกล้ชิด';
const KOREAN =
  '이 포트폴리오는 미국 기술주에 지나치게 집중되어 있어 분산 투자 위험을 면밀히 살펴봐야 합니다.';
const ENGLISH =
  'The portfolio is concentrated in US technology stocks, so diversification risk deserves close monitoring.';

const usage = { inputTokens: 1000, outputTokens: 500 };

function makeManager(answers: string[]) {
  const prompts: string[] = [];
  let call = 0;

  const generate = jest.fn((options: { prompt: string }) => {
    prompts.push(options.prompt);
    const summary = answers[Math.min(call, answers.length - 1)];
    call += 1;
    return Promise.resolve({ data: { summary } as never, usage });
  });
  const anthropic = {
    id: 'anthropic',
    isConfigured: () => true,
    generateJsonResponse: generate,
  } as unknown as IAiProvider;
  const off = (id: string) =>
    ({ id, isConfigured: () => false }) as unknown as IAiProvider;

  const prisma = {
    users: {
      findUnique: jest.fn().mockResolvedValue({ ai_token_balance: 5000 }),
    },
    ai_usage_logs: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue(4000),
  };

  const manager = new AiManagerService(
    prisma as never,
    off('groq') as never,
    off('gemini') as never,
    off('openai') as never,
    anthropic as never,
  );
  for (const level of ['warn', 'error', 'log'] as const) {
    jest.spyOn(manager['logger'], level).mockImplementation(() => undefined);
  }

  return { manager, prompts, prisma, generate };
}

const userRequest = {
  userId: 7,
  feature: 'chart_insight' as const,
  prompt: '{"task":"x"}',
  expectedLanguage: 'th' as const,
  languageProbe: (data: { summary: string }) => data.summary,
};

describe('executeAiRequest — language guard', () => {
  it('right language first time: one call, charged normally', async () => {
    const { manager, prisma, generate } = makeManager([THAI]);

    const result = await manager.executeAiRequest<{ summary: string }>(
      userRequest,
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.data.summary).toBe(THAI);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('Korean first, Thai on retry: retried once with a correction, charged only for the accepted answer', async () => {
    const { manager, prompts, prisma } = makeManager([KOREAN, THAI]);

    const result = await manager.executeAiRequest<{ summary: string }>(
      userRequest,
    );

    expect(result.data.summary).toBe(THAI);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBe(userRequest.prompt);
    expect(prompts[1]).toContain(userRequest.prompt);
    expect(prompts[1]).toContain('Respond only in Thai.');

    // billed once, at the feature's flat price (chart_insight = 5)
    expect(result.creditsCharged).toBe(5);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // the discarded answer is on record as FAILED with 0 credits
    expect(prisma.ai_usage_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        credits_deducted: 0,
        error_code: 'WRONG_LANGUAGE',
        tokens_input: 1000,
        tokens_output: 500,
      }) as unknown,
    });
  });

  it('still wrong after the retry: WrongLanguageError, NOT charged', async () => {
    const { manager, prisma, generate } = makeManager([KOREAN, KOREAN]);

    const error = await manager
      .executeAiRequest<{ summary: string }>(userRequest)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WrongLanguageError);
    const body = (error as WrongLanguageError).getResponse() as {
      error: string;
      creditsCharged: number;
    };
    expect(body.error).toBe('AI_WRONG_LANGUAGE');
    expect(body.creditsCharged).toBe(0);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ai_usage_logs.create).toHaveBeenCalledTimes(2);
  });

  it('English answer to a Thai request is treated as wrong (Risk Analysis case)', async () => {
    const { manager, prisma } = makeManager([ENGLISH, ENGLISH]);

    await expect(
      manager.executeAiRequest<{ summary: string }>(userRequest),
    ).rejects.toBeInstanceOf(WrongLanguageError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('without expectedLanguage nothing is checked or retried', async () => {
    const { manager, generate } = makeManager([KOREAN]);

    await manager.executeAiRequest<{ summary: string }>({
      userId: 7,
      feature: 'chart_insight' as const,
      prompt: 'x',
    });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('a provider outage is still an outage, not a language error', async () => {
    const { manager, generate } = makeManager([THAI]);
    generate.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 503 }),
    );

    const error = await manager
      .executeAiRequest<{ summary: string }>(userRequest)
      .catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(WrongLanguageError);
    expect((error as Error).message).toMatch(/unavailable/i);
  });
});

describe('executeSystemAiRequest — language guard', () => {
  const systemRequest = {
    prompt: '{"task":"x"}',
    expectedLanguage: 'en' as const,
    languageProbe: (data: { summary: string }) => data.summary,
  };

  it('retries once, then serves the corrected answer', async () => {
    const { manager, prompts } = makeManager([KOREAN, ENGLISH]);

    const result = await manager.executeSystemAiRequest<{ summary: string }>(
      systemRequest,
    );

    expect(result.data.summary).toBe(ENGLISH);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Respond only in English.');
  });

  it('still wrong after the retry: throws (callers fall back to their static default)', async () => {
    const { manager } = makeManager([KOREAN, KOREAN]);

    await expect(
      manager.executeSystemAiRequest<{ summary: string }>(systemRequest),
    ).rejects.toThrow(/wrong-language/);
  });
});

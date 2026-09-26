import { UngroundedNumbersError } from './ai-grounding';
import { AiManagerService } from './ai-manager.service';
import type { IAiProvider } from './providers/ai-provider.interface';

/**
 * Numeric grounding: every percent/money figure in an answer must come from the data the
 * prompt was built from. A miss is retried once; a second miss is refused and never charged.
 */

const THAI_GROUNDED =
  'กำไรรวมตั้งแต่เริ่มต้นคือ 2,874.76 ดอลลาร์ หรือ 14.37% ของเงินทุนที่ใส่เข้ามา พอร์ตนี้กระจุกตัวในหุ้นเทคโนโลยี';
const THAI_INVENTED =
  'กำไรรวมตั้งแต่เริ่มต้นคือ 3,999.99 ดอลลาร์ หรือ 31.5% ของเงินทุนที่ใส่เข้ามา พอร์ตนี้กระจุกตัวในหุ้นเทคโนโลยี';

const payload = {
  metrics: { totalProfitLoss_USD: 2874.76, totalReturn_percent: 14.37 },
};

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
    {
      id: 'anthropic',
      isConfigured: () => true,
      generateJsonResponse: generate,
    } as never,
  );
  for (const level of ['warn', 'error', 'log'] as const) {
    jest.spyOn(manager['logger'], level).mockImplementation(() => undefined);
  }

  return { manager, prompts, prisma, generate };
}

const request = {
  userId: 7,
  modelId: 'claude-fast',
  prompt: '{"task":"review"}',
  expectedLanguage: 'th' as const,
  groundedIn: payload,
};

describe('executeAiRequest — numeric grounding', () => {
  it('grounded answer: one call, charged normally', async () => {
    const { manager, generate, prisma } = makeManager([THAI_GROUNDED]);

    const result = await manager.executeAiRequest<{ summary: string }>(request);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.data.summary).toBe(THAI_GROUNDED);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('invented figures first, grounded on retry: correction names the bad figures, charged once', async () => {
    const { manager, prompts, prisma } = makeManager([
      THAI_INVENTED,
      THAI_GROUNDED,
    ]);

    const result = await manager.executeAiRequest<{ summary: string }>(request);

    expect(result.data.summary).toBe(THAI_GROUNDED);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain(request.prompt);
    expect(prompts[1]).toContain('3,999.99');
    expect(prompts[1]).toContain('31.5');
    expect(prompts[1]).toContain('Do not compute');

    // one answer's tokens only: 1k in x20 + 0.5k out x100 = 70 credits
    expect(result.creditsCharged).toBe(70);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ai_usage_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        credits_deducted: 0,
        error_code: 'UNGROUNDED_NUMBERS',
      }) as unknown,
    });
  });

  it('still ungrounded after the retry: AI_UNGROUNDED_NUMBERS and NOT charged', async () => {
    const { manager, prisma, generate } = makeManager([
      THAI_INVENTED,
      THAI_INVENTED,
    ]);

    const error = await manager
      .executeAiRequest<{ summary: string }>(request)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UngroundedNumbersError);
    const body = (error as UngroundedNumbersError).getResponse() as {
      error: string;
      creditsCharged: number;
    };
    expect(body.error).toBe('AI_UNGROUNDED_NUMBERS');
    expect(body.creditsCharged).toBe(0);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a wrong-language answer is judged before its numbers (language correction wins)', async () => {
    const { manager, prompts } = makeManager([
      'The total profit is 9,999.99 USD which is 88.8% of capital overall.',
      THAI_GROUNDED,
    ]);

    await manager.executeAiRequest<{ summary: string }>(request);

    expect(prompts[1]).toContain('Respond only in Thai.');
  });

  it('without groundedIn nothing is checked', async () => {
    const { manager, generate } = makeManager([THAI_INVENTED]);

    await manager.executeAiRequest<{ summary: string }>({
      ...request,
      groundedIn: undefined,
    });

    expect(generate).toHaveBeenCalledTimes(1);
  });
});

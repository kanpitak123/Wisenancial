import { AiService } from './ai.service';

describe('AiService', () => {
  it('uses the rule engine when no model is selected', async () => {
    const service = new AiService(
      {} as any,
      {} as any,
      { analyze: jest.fn().mockReturnValue('insight') } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.analyzeChart(1, {
        portfolioType: 'TRADER',
        chartType: 'equity_curve',
        data: {},
        useRuleBased: true,
      }),
    ).resolves.toEqual({
      insight: 'insight',
      source: 'RULE_BASED',
    });
  });

  /**
   * ภาษาของคำตอบเคย hardcode เป็นไทยใน prompt ผู้ใช้ที่ตั้งแอปเป็นอังกฤษจึงได้ไทยเสมอ
   * เทสนี้ล็อกไว้ว่าค่าที่ส่งมาถูกแปลงเป็นคำสั่งใน system prompt จริง
   */
  it('ส่ง outputLanguage เข้าไปเป็นคำสั่งใน system prompt', async () => {
    const executeAiRequest = jest.fn().mockResolvedValue({
      data: { insight: 'ok' },
      model: 'groq-llama3',
      creditsCharged: 1,
      creditsRemaining: 9,
    });

    const service = new AiService(
      {} as any,
      { executeAiRequest } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.analyzeChart(1, {
      portfolioType: 'TRADER',
      chartType: 'equity_curve',
      data: {},
      modelId: 'groq-llama3',
      outputLanguage: 'en',
    });

    expect(executeAiRequest.mock.calls[0][0].systemPrompt).toContain(
      'Output language: English',
    );
  });

  it('ไม่ส่ง outputLanguage มา -> ใช้ไทยเหมือนพฤติกรรมเดิม', async () => {
    const executeAiRequest = jest.fn().mockResolvedValue({
      data: { insight: 'ok' },
      model: 'groq-llama3',
      creditsCharged: 1,
      creditsRemaining: 9,
    });

    const service = new AiService(
      {} as any,
      { executeAiRequest } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.analyzeChart(1, {
      portfolioType: 'TRADER',
      chartType: 'equity_curve',
      data: {},
      modelId: 'groq-llama3',
    });

    expect(executeAiRequest.mock.calls[0][0].systemPrompt).toContain(
      'Output language: Thai',
    );
  });

  it('system prompt ของ analyzeChart มี guardrail ห้ามพูดเป็นคำสั่งซื้อขาย', async () => {
    const executeAiRequest = jest.fn().mockResolvedValue({
      data: { insight: 'ok' },
      model: 'groq-llama3',
      creditsCharged: 1,
      creditsRemaining: 9,
    });

    const service = new AiService(
      {} as any,
      { executeAiRequest } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.analyzeChart(1, {
      portfolioType: 'TRADER',
      chartType: 'equity_curve',
      data: {},
      modelId: 'groq-llama3',
    });

    expect(executeAiRequest.mock.calls[0][0].systemPrompt).toContain(
      'Never use words like "buy", "sell"',
    );
  });

  it('exposes a public news fallback for legacy NewsService', () => {
    const service = new AiService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service.buildFallback('Headline', 'th')).toMatchObject({
      sentiment: 'NEUTRAL',
      fromFallback: true,
    });
  });
});

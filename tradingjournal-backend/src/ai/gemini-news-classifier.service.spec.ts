import {
  GeminiClassificationValidationError,
  GeminiNewsClassifierService,
} from './gemini-news-classifier.service';

function makeService(executeSystemAiRequest: jest.Mock) {
  return new GeminiNewsClassifierService({
    executeSystemAiRequest,
  } as never);
}

const VALID_RAW = {
  aiSummary: 'Central bank held rates steady, citing inflation progress.',
  aiTrend: 'SIDEWAY',
  aiImpactProbability: 60,
  stockImpactAnalysis:
    'Financing costs stay elevated near-term for leveraged names.',
  sector: 'Macro / Rates',
  importance: 'HIGH',
  sentiment: 'NEUTRAL',
  aiTranslatedSummary: { en: 'Rates held steady.', th: 'คงอัตราดอกเบี้ย' },
  confidence: 0.91,
};

describe('GeminiNewsClassifierService', () => {
  it('classifies successfully through AiManagerService with a single preferred-only Gemini attempt', async () => {
    const executeSystemAiRequest = jest.fn().mockResolvedValue({
      data: VALID_RAW,
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const service = makeService(executeSystemAiRequest);

    const result = await service.classify({
      headline: 'Fed holds rates steady',
      summary: 'The Fed left rates unchanged.',
      content: 'The Fed left rates unchanged.',
      language: 'en',
    });

    expect(result).toEqual({
      ...VALID_RAW,
      fromFallback: false,
    });

    expect(executeSystemAiRequest).toHaveBeenCalledTimes(1);
    const [request] = executeSystemAiRequest.mock.calls[0] as [
      { modelId?: string; preferredOnly?: boolean },
    ];
    expect(request.modelId).toBe('gemini-2.5-flash');
    expect(request.preferredOnly).toBe(true);
  });

  it('clamps out-of-range confidence and impact probability into their valid ranges', async () => {
    const executeSystemAiRequest = jest.fn().mockResolvedValue({
      data: { ...VALID_RAW, confidence: 1.5, aiImpactProbability: 140 },
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const service = makeService(executeSystemAiRequest);

    const result = await service.classify({
      headline: 'x',
      summary: 'x',
      content: 'x',
      language: 'en',
    });

    expect(result.confidence).toBe(1);
    expect(result.aiImpactProbability).toBe(100);
  });

  it('rejects with GeminiClassificationValidationError when importance is outside the enum (malformed output)', async () => {
    const executeSystemAiRequest = jest.fn().mockResolvedValue({
      data: { ...VALID_RAW, importance: 'CRITICAL' },
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const service = makeService(executeSystemAiRequest);

    await expect(
      service.classify({
        headline: 'x',
        summary: 'x',
        content: 'x',
        language: 'en',
      }),
    ).rejects.toBeInstanceOf(GeminiClassificationValidationError);
  });

  it('rejects with GeminiClassificationValidationError when a required field is missing (malformed output)', async () => {
    const { aiSummary: _unused, ...withoutSummary } = VALID_RAW;
    const executeSystemAiRequest = jest.fn().mockResolvedValue({
      data: withoutSummary,
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const service = makeService(executeSystemAiRequest);

    await expect(
      service.classify({
        headline: 'x',
        summary: 'x',
        content: 'x',
        language: 'en',
      }),
    ).rejects.toBeInstanceOf(GeminiClassificationValidationError);
  });

  it('rejects when the response contains forbidden advisory language despite the neutrality mandate', async () => {
    const executeSystemAiRequest = jest.fn().mockResolvedValue({
      data: {
        ...VALID_RAW,
        stockImpactAnalysis: 'Investors should buy this stock immediately.',
      },
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const service = makeService(executeSystemAiRequest);

    await expect(
      service.classify({
        headline: 'x',
        summary: 'x',
        content: 'x',
        language: 'en',
      }),
    ).rejects.toBeInstanceOf(GeminiClassificationValidationError);
  });

  it('propagates a provider/network failure from AiManagerService unchanged', async () => {
    const executeSystemAiRequest = jest
      .fn()
      .mockRejectedValue(new Error('Gemini request failed: network timeout'));
    const service = makeService(executeSystemAiRequest);

    await expect(
      service.classify({
        headline: 'x',
        summary: 'x',
        content: 'x',
        language: 'en',
      }),
    ).rejects.toThrow('Gemini request failed: network timeout');
  });
});

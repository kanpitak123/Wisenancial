import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { AiRecommendationService } from './ai-recommendation.service';
import type { AiManagerService } from './ai-manager.service';
import type { GrowthCandidate, StocksService } from '../stocks/stocks.service';

/**
 * AI Picks (GET /ai/recommendations/growth) ไม่รับ modelId — เซิร์ฟเวอร์เลือกให้
 * ตอนนี้ Claude เป็น provider เดียว ฟีเจอร์นี้ใช้ tier fast เสมอ
 *
 * ชุดนี้คุมว่า:
 *   - ใช้ claude-fast ไม่ใช่ claude-smart ที่แพงกว่า 3 เท่า
 *   - fast ล้ม -> โยน error ชัด ๆ ออกไป ไม่ถอย "ขึ้น" ไป smart (ไม่ให้คิดเงินเกิน)
 *   - ไม่ถอยเมื่อ error ไม่ใช่เรื่องของโมเดล (เครดิตไม่พอ ลองตัวอื่นก็ตายเหมือนกัน)
 */

const FAST = {
  id: 'claude-fast',
  label: 'Claude Fast',
  creditsPer1kInput: 20,
  creditsPer1kOutput: 100,
};
const SMART = {
  id: 'claude-smart',
  label: 'Claude Smart',
  creditsPer1kInput: 60,
  creditsPer1kOutput: 300,
};

const PICKS = [
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    sector: 'Automotive',
    reasoning: {
      growth: 'g',
      profit: 'p',
      customerBase: 'c',
      liquidity: 'l',
    },
    aiSummary: 's',
  },
];

/** candidate ปลอม — ต้องมี TSLA ไม่งั้นคำตอบข้างบนถูกตัดทิ้งตามกติกาใหม่ */
const CANDIDATES: GrowthCandidate[] = [
  'TSLA',
  'NVDA',
  'AAPL',
  'PTT.BK',
  'CPALL.BK',
  'DELTA.BK',
].map((symbol) => ({
  symbol,
  name: `${symbol} Inc.`,
  sector: 'Technology',
  exchange: symbol.endsWith('.BK') ? 'SET' : 'NASDAQ',
  asOf: '2026-06-30',
  metrics: {
    revenueGrowthYoY: 0.32,
    netMargin: 0.18,
    peRatio: 41.2,
    currentPrice: 123.4,
    avgDailyVolume3M: 1_000_000,
  },
}));

const providerUnavailable = (modelId: string) =>
  new ServiceUnavailableException({
    statusCode: 503,
    error: 'AI_PROVIDER_UNAVAILABLE',
    message: `Model "${modelId}" hit its rate limit.`,
    model: modelId,
    failureKind: 'rate-limit',
  });

const insufficientCredits = () =>
  new HttpException({ error: 'INSUFFICIENT_AI_CREDITS' }, 402);

/** manager ปลอมที่บันทึกลำดับโมเดลที่ถูกเรียกไว้ใน calls */
function makeService(
  models: Array<typeof FAST>,
  behaviour: Record<string, Error> = {},
  candidates: GrowthCandidate[] = CANDIDATES,
) {
  const calls: string[] = [];

  const manager = {
    listAvailableModels: () => models,
    executeAiRequest: jest.fn(({ modelId }: { modelId: string }) => {
      calls.push(modelId);

      const failure = behaviour[modelId];
      if (failure) {
        return Promise.reject(failure);
      }

      return Promise.resolve({
        data: PICKS,
        model: modelId,
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
        creditsCharged: 1,
        creditsRemaining: 99,
      });
    }),
  } as unknown as AiManagerService;

  const getGrowthCandidates = jest.fn().mockResolvedValue(candidates);
  const stocks = {
    getGrowthCandidates,
  } as unknown as StocksService;

  return {
    service: new AiRecommendationService(manager, stocks),
    calls,
    manager,
    getGrowthCandidates,
  };
}

describe('AiRecommendationService — เลือกโมเดล', () => {
  it('ใช้ claude-fast แม้ smart ก็พร้อมใช้ และไม่ถูกสลับ', async () => {
    const { service, calls } = makeService([SMART, FAST]);

    const result = await service.getGrowthRecommendations(1);

    expect(calls).toEqual(['claude-fast']);
    expect(result.model).toBe('claude-fast');
    expect(result.fallbackFrom).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it('fast ชน rate limit -> ไม่ถอยขึ้นไป smart (แพงกว่า) แต่โยน error ชัด ๆ', async () => {
    const { service, calls } = makeService([FAST, SMART], {
      'claude-fast': providerUnavailable('claude-fast'),
    });

    await expect(service.getGrowthRecommendations(1)).rejects.toMatchObject({
      response: { model: 'claude-fast' },
    });

    expect(calls).toEqual(['claude-fast']);
  });

  it('เครดิตไม่พอ -> ไม่ถอยไปตัวอื่น เพราะลองกี่ตัวก็ตายเหมือนกัน', async () => {
    const { service, calls } = makeService([FAST, SMART], {
      'claude-fast': insufficientCredits(),
    });

    await expect(service.getGrowthRecommendations(1)).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(calls).toEqual(['claude-fast']);
  });

  it('fast ไม่อยู่ในรายการ (ปิดไว้) -> ใช้ตัวแรกที่มี ไม่ crash', async () => {
    const { service, calls } = makeService([SMART]);

    await service.getGrowthRecommendations(1);

    expect(calls).toEqual(['claude-smart']);
  });

  it('ไม่มี provider ที่ตั้งค่าไว้เลย -> บอกให้ชัด ไม่ใช่ crash แปลกๆ', async () => {
    const { service } = makeService([]);

    await expect(service.getGrowthRecommendations(1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  /**
   * AI Picks เป็นจุดที่ใกล้เคียง "แนะนำให้ซื้อ" ที่สุดในระบบ จึงต้องมี guardrail
   * ทั้งสองชั้น ไม่ใช่แค่ชั้นเดียวเหมือนจุดอื่น
   */
  it('system prompt มี guardrail ห้ามพูดเป็นคำสั่งซื้อขาย ทั้งสองชั้น', async () => {
    const { service, manager } = makeService([FAST]);

    await service.getGrowthRecommendations(1);

    const { systemPrompt } = (manager.executeAiRequest as unknown as jest.Mock)
      .mock.calls[0][0];

    expect(systemPrompt).toContain('Never use words like "buy", "sell"');
    expect(systemPrompt).toContain(
      'educational screening output only, not personalized investment advice',
    );
  });
});

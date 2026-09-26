import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { AiRecommendationService } from './ai-recommendation.service';
import type { AiManagerService } from './ai-manager.service';
import type { GrowthCandidate, StocksService } from '../stocks/stocks.service';

/**
 * AI Picks (GET /ai/recommendations/growth): a flat-priced feature ('ai_picks', claude-fast
 * tier). The server picks the model; there is no model chain and no fallback to another one.
 *
 * Covers: the request names the feature (so the manager applies the flat price and tier);
 * a provider outage or insufficient credits surfaces as-is; the guardrails stay in the prompt.
 */

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

/** manager ปลอมที่บันทึก feature ที่ถูกขอไว้ใน calls */
function makeService(
  failure?: Error,
  candidates: GrowthCandidate[] = CANDIDATES,
) {
  const calls: string[] = [];

  const manager = {
    executeAiRequest: jest.fn(({ feature }: { feature: string }) => {
      calls.push(feature);

      if (failure) {
        return Promise.reject(failure);
      }

      return Promise.resolve({
        data: PICKS,
        model: 'claude-fast',
        usage: { inputTokens: 10, outputTokens: 20 },
        creditsCharged: 10,
        creditsRemaining: 90,
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

describe('AiRecommendationService — flat-priced feature', () => {
  it("asks the manager for the 'ai_picks' feature exactly once", async () => {
    const { service, calls } = makeService();

    const result = await service.getGrowthRecommendations(1);

    expect(calls).toEqual(['ai_picks']);
    expect(result.model).toBe('claude-fast');
    expect(result.creditsCharged).toBe(10);
    expect(result.data).toHaveLength(1);
  });

  it('a provider outage is thrown as-is, with no second attempt', async () => {
    const { service, calls } = makeService(providerUnavailable('claude-fast'));

    await expect(service.getGrowthRecommendations(1)).rejects.toMatchObject({
      response: { model: 'claude-fast' },
    });

    expect(calls).toEqual(['ai_picks']);
  });

  it('insufficient credits is thrown as-is', async () => {
    const { service, calls } = makeService(insufficientCredits());

    await expect(service.getGrowthRecommendations(1)).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(calls).toEqual(['ai_picks']);
  });

  /**
   * AI Picks เป็นจุดที่ใกล้เคียง "แนะนำให้ซื้อ" ที่สุดในระบบ จึงต้องมี guardrail
   * ทั้งสองชั้น ไม่ใช่แค่ชั้นเดียวเหมือนจุดอื่น
   */
  it('system prompt มี guardrail ห้ามพูดเป็นคำสั่งซื้อขาย ทั้งสองชั้น', async () => {
    const { service, manager } = makeService();

    await service.getGrowthRecommendations(1);

    const { systemPrompt } = (manager.executeAiRequest as unknown as jest.Mock)
      .mock.calls[0][0];

    expect(systemPrompt).toContain('Never use words like "buy", "sell"');
    expect(systemPrompt).toContain(
      'educational screening output only, not personalized investment advice',
    );
  });
});

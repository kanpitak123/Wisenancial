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

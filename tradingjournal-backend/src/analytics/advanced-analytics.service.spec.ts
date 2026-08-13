import { AdvancedAnalyticsService } from './advanced-analytics.service';

describe('AdvancedAnalyticsService', () => {
  it('creates deterministic DCA scenarios', async () => {
    const service = new AdvancedAnalyticsService(
      {} as any,
      {} as any,
    );

    const result = await service.simulateDca({
      symbol: 'VOO',
      monthlyAmount: 100,
      durationYears: 10,
    });

    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios[0].totalInvested).toBe(12000);
  });
});

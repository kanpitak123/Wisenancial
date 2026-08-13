import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('is defined with mocked dependencies', () => {
    const service = new AnalyticsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });
});

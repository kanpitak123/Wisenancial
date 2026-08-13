import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  it('is defined with mocked service', () => {
    const controller =
      new AnalyticsController(
        {} as any,
      );

    expect(controller).toBeDefined();
  });
});

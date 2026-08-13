import { AiRuleEngineService } from './ai-rule-engine.service';

describe('AiRuleEngineService', () => {
  const service = new AiRuleEngineService();

  it.each([
    'equity_curve',
    'winrate_position',
    'winrate_day',
    'pnl_day',
    'winrate_slot',
    'pnl_slot',
    'monthly_growth',
    'winrate_month',
    'pnl_month',
    'portfolio_allocation',
  ])('returns an insight for %s', (chartType) => {
    expect(service.analyze(chartType, [])).toEqual(
      expect.any(String),
    );
  });
});

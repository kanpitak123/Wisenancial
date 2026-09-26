import {
  AI_FEATURE_PRICING,
  MIN_CREDIT_BALANCE,
  featureModel,
  featurePrice,
  listFeaturePricing,
} from './ai-pricing.config';
import { AI_MODEL_REGISTRY } from './ai.models';

describe('AI feature pricing (single config)', () => {
  it('flat prices as approved: 5 / 10 / 20', () => {
    const credits = Object.fromEntries(
      listFeaturePricing().map(({ feature, credits: c }) => [feature, c]),
    );

    expect(credits).toEqual({
      chart_insight: 5,
      news_enrich: 5,
      education_quiz: 5,
      ai_picks: 10,
      risk_analysis: 20,
      portfolio_review: 20,
    });
  });

  it('fixed tier per feature: bulk/simple on fast, review and risk on smart', () => {
    const tiers = Object.fromEntries(
      listFeaturePricing().map(({ feature, tier }) => [feature, tier]),
    );

    expect(tiers).toEqual({
      chart_insight: 'fast',
      news_enrich: 'fast',
      education_quiz: 'fast',
      ai_picks: 'fast',
      risk_analysis: 'smart',
      portfolio_review: 'smart',
    });
    expect(featureModel('portfolio_review')).toBe('claude-smart');
    expect(featureModel('chart_insight')).toBe('claude-fast');
  });

  it('MIN_CREDIT_BALANCE is 20: the highest single-feature price', () => {
    expect(MIN_CREDIT_BALANCE).toBe(20);
    expect(MIN_CREDIT_BALANCE).toBe(
      Math.max(...Object.values(AI_FEATURE_PRICING).map((p) => p.credits)),
    );
  });

  it('every feature resolves to a registered model, and prices are positive integers', () => {
    for (const { feature, credits } of listFeaturePricing()) {
      expect(AI_MODEL_REGISTRY[featureModel(feature)]).toBeDefined();
      expect(Number.isInteger(credits) && credits > 0).toBe(true);
      expect(featurePrice(feature).credits).toBe(credits);
    }
  });

  it('prices live only here: the model registry carries no credit rates', () => {
    for (const model of Object.values(AI_MODEL_REGISTRY)) {
      expect(model).not.toHaveProperty('creditsPer1kInput');
      expect(model).not.toHaveProperty('creditsPer1kOutput');
    }
  });
});

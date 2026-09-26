import type { AiModelId } from './ai.models';

/**
 * The one place AI prices live.
 *
 * Users pay a flat number of credits per feature call. It does not depend on how many
 * tokens the call happened to use, on a retry we made, or on a model the user picked: the
 * model is fixed per feature (a cost tier, see AI_MODEL_FAST / AI_MODEL_SMART in
 * ai.config.ts). The frontend reads these numbers from GET /ai/pricing, so changing a price
 * is a one-line change here.
 *
 * Sizing (assumed list prices, see docs/internal/ai-services-integration-plan.md §11):
 * Claude cost is about 20-30% of revenue at the cheapest credit pack rate.
 */

export type AiFeatureId =
  | 'chart_insight'
  | 'news_enrich'
  | 'education_quiz'
  | 'ai_picks'
  | 'risk_analysis'
  | 'portfolio_review';

export type AiFeatureTier = 'fast' | 'smart';

export interface AiFeaturePrice {
  /** Credits deducted per successful call. */
  readonly credits: number;
  /** Cost tier: which Claude model serves the feature. */
  readonly tier: AiFeatureTier;
}

export const AI_FEATURE_PRICING: Readonly<Record<AiFeatureId, AiFeaturePrice>> =
  {
    chart_insight: { credits: 5, tier: 'fast' },
    news_enrich: { credits: 5, tier: 'fast' },
    education_quiz: { credits: 5, tier: 'fast' },
    ai_picks: { credits: 10, tier: 'fast' },
    risk_analysis: { credits: 20, tier: 'smart' },
    portfolio_review: { credits: 20, tier: 'smart' },
  };

const TIER_MODEL: Readonly<Record<AiFeatureTier, AiModelId>> = {
  fast: 'claude-fast',
  smart: 'claude-smart',
};

export function featurePrice(feature: AiFeatureId): AiFeaturePrice {
  return AI_FEATURE_PRICING[feature];
}

/** The registry model that serves a feature. */
export function featureModel(feature: AiFeatureId): AiModelId {
  return TIER_MODEL[featurePrice(feature).tier];
}

/**
 * The highest single-feature price: a balance at or above this can run any feature. The
 * gate for one call is that feature's own price; this is the "keep at least this much"
 * figure the UI shows.
 */
export const MIN_CREDIT_BALANCE = Math.max(
  ...Object.values(AI_FEATURE_PRICING).map((price) => price.credits),
);

export function listFeaturePricing(): Array<
  AiFeaturePrice & { feature: AiFeatureId }
> {
  return (Object.keys(AI_FEATURE_PRICING) as AiFeatureId[]).map((feature) => ({
    feature,
    ...AI_FEATURE_PRICING[feature],
  }));
}

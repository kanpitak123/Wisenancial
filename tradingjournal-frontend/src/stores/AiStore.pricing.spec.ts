/**
 * AiStore — flat per-feature pricing
 *
 * Prices come from GET /ai/pricing (the backend config is the only source), users no longer
 * pick a model, and a paid button is affordable when the balance covers that feature's price.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from 'src/stores/AuthStore';
import { useAiStore } from './AiStore';

const { getPricing, getCredits, notifyAiError, analyzeChart, reviewPortfolio, analyzeRisk } =
  vi.hoisted(() => ({
  getPricing: vi.fn(),
  getCredits: vi.fn(),
  notifyAiError: vi.fn(),
  analyzeChart: vi.fn(),
  reviewPortfolio: vi.fn(),
  analyzeRisk: vi.fn(),
}));

vi.mock('src/services/ai.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  aiService: { getPricing, getCredits, analyzeChart, reviewPortfolio, analyzeRisk },
}));

vi.mock('src/utils/ai-notify', () => ({ notifyAiError }));

const PRICING = {
  features: [
    { feature: 'chart_insight', credits: 5, tier: 'fast' },
    { feature: 'ai_picks', credits: 10, tier: 'fast' },
    { feature: 'risk_analysis', credits: 20, tier: 'smart' },
    { feature: 'portfolio_review', credits: 20, tier: 'smart' },
  ],
  minBalance: 20,
};

function setCredits(balance: number) {
  useAuthStore().user = {
    id: 1,
    username: 'qa',
    ai_token_balance: balance,
  } as unknown as ReturnType<typeof useAuthStore>['user'];
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  getPricing.mockResolvedValue(PRICING);
});

describe('AiStore pricing', () => {
  it('loads the flat prices once and keeps them by feature', async () => {
    const store = useAiStore();

    await store.fetchPricing();
    await store.fetchPricing();

    expect(getPricing).toHaveBeenCalledTimes(1);
    expect(store.costOf('chart_insight')).toBe(5);
    expect(store.costOf('ai_picks')).toBe(10);
    expect(store.costOf('portfolio_review')).toBe(20);
    expect(store.minBalance).toBe(20);
  });

  it('costOf is null until the prices have loaded (buttons show no number rather than a guess)', () => {
    expect(useAiStore().costOf('portfolio_review')).toBeNull();
  });

  it('canAffordFeature compares the balance with that feature price, not with the highest one', async () => {
    const store = useAiStore();
    await store.fetchPricing();
    setCredits(10);

    expect(store.canAffordFeature('chart_insight')).toBe(true); // 5
    expect(store.canAffordFeature('ai_picks')).toBe(true); // 10
    expect(store.canAffordFeature('portfolio_review')).toBe(false); // 20
    expect(store.canAfford).toBe(false); // the badge floor is still 20
  });

  it('before the prices load, affordability falls back to the balance floor', () => {
    const store = useAiStore();
    setCredits(19);

    expect(store.canAffordFeature('portfolio_review')).toBe(false);

    setCredits(20);
    expect(store.canAffordFeature('portfolio_review')).toBe(true);
  });

  it('there is no model list or selection any more', () => {
    const store = useAiStore() as unknown as Record<string, unknown>;

    expect(store.models).toBeUndefined();
    expect(store.selectedModelId).toBeUndefined();
    expect(store.setSelectedModel).toBeUndefined();
  });
});

describe('AiStore requests carry no model', () => {
  it('chart insight, review and risk send no modelId', async () => {
    const store = useAiStore();
    analyzeChart.mockResolvedValue({ insight: 'x', source: 'LLM', creditsRemaining: 90 });
    reviewPortfolio.mockResolvedValue({
      portfolioType: 'INVESTOR',
      data: {},
      creditsRemaining: 70,
    });
    analyzeRisk.mockResolvedValue({ data: {}, holdingsData: [], creditsRemaining: 50 });

    await store.analyzeChart({
      key: 'k',
      portfolioType: 'TRADER',
      chartType: 'x',
      data: {},
    });
    await store.reviewPortfolio(1);
    await store.analyzeRisk([{ symbol: 'AAPL', quantity: 1 }]);

    expect(analyzeChart.mock.calls[0]![0]).not.toHaveProperty('modelId');
    expect(reviewPortfolio.mock.calls[0]![1]).not.toHaveProperty('modelId');
    expect(analyzeRisk.mock.calls[0]![0]).not.toHaveProperty('modelId');
  });
});

describe('chart insight: never charged without an explicit AI click', () => {
  const base = { key: 'k', portfolioType: 'TRADER' as const, chartType: 'x', data: {} };

  it('the default request carries no useAi (backend answers with the free rule-based insight)', async () => {
    const store = useAiStore();
    analyzeChart.mockResolvedValue({ insight: 'rule', source: 'RULE_BASED' });

    await store.analyzeChart(base);

    expect(analyzeChart.mock.calls[0]![0]).not.toHaveProperty('useAi');
  });

  it('useAi: false is not sent either', async () => {
    const store = useAiStore();
    analyzeChart.mockResolvedValue({ insight: 'rule', source: 'RULE_BASED' });

    await store.analyzeChart({ ...base, useAi: false });

    expect(analyzeChart.mock.calls[0]![0]).not.toHaveProperty('useAi');
  });

  it('the explicit AI click sends useAi: true and syncs the credits it cost', async () => {
    const store = useAiStore();
    setCredits(100);
    analyzeChart.mockResolvedValue({
      insight: 'ai',
      source: 'LLM',
      creditsCharged: 5,
      creditsRemaining: 95,
    });

    await store.analyzeChart({ ...base, useAi: true });

    expect(analyzeChart.mock.calls[0]![0]).toMatchObject({ useAi: true });
    expect(store.credits).toBe(95);
  });

  it('a rule-based answer leaves the balance alone', async () => {
    const store = useAiStore();
    setCredits(100);
    analyzeChart.mockResolvedValue({ insight: 'rule', source: 'RULE_BASED' });

    await store.analyzeChart(base);

    expect(store.credits).toBe(100);
  });
});

describe('chart insight: errors and the balance after a charge', () => {
  const base = { key: 'k', portfolioType: 'TRADER' as const, chartType: 'x', data: {}, useAi: true };

  const serverError = (message: string[] | string, status = 400) =>
    Object.assign(new Error('Request failed'), {
      response: { status, data: { message, error: 'Bad Request', statusCode: status } },
    });

  it('a 400 is caught (not thrown), toasts the server message, and clears the loading state', async () => {
    const store = useAiStore();
    analyzeChart.mockRejectedValue(serverError(['property data should not exist']));

    await expect(store.analyzeChart(base)).resolves.toBeNull();

    expect(notifyAiError).toHaveBeenCalledWith('property data should not exist');
    expect(store.error).toBe('property data should not exist');
    expect(store.loadingInsight.k).toBe(false);
    expect(store.insights.k).toBeUndefined();
  });

  it('a 402 marks insufficient credits and still toasts the server message', async () => {
    const store = useAiStore();
    analyzeChart.mockRejectedValue(serverError('You need at least 5 AI tokens to run this.', 402));

    await store.analyzeChart(base);

    expect(store.insufficientCredits).toBe(true);
    expect(notifyAiError).toHaveBeenCalledWith('You need at least 5 AI tokens to run this.');
  });

  it('shows the loading state while the request is in flight', async () => {
    const store = useAiStore();
    let release: (value: unknown) => void = () => undefined;
    analyzeChart.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const pending = store.analyzeChart(base);
    expect(store.loadingInsight.k).toBe(true);

    release({ insight: 'ai', source: 'LLM', creditsRemaining: 95 });
    await pending;
    expect(store.loadingInsight.k).toBe(false);
  });

  it('after an AI charge the balance is re-read from the server', async () => {
    const store = useAiStore();
    setCredits(100);
    analyzeChart.mockResolvedValue({ insight: 'ai', source: 'LLM', creditsRemaining: 95 });
    getCredits.mockResolvedValue({ balance: 94, minBalance: 20 });

    await store.analyzeChart(base);
    await vi.waitFor(() => expect(store.credits).toBe(94));

    expect(getCredits).toHaveBeenCalledTimes(1);
    expect(notifyAiError).not.toHaveBeenCalled();
  });

  it('a failed balance re-read is silent (the charge response already synced it)', async () => {
    const store = useAiStore();
    setCredits(100);
    analyzeChart.mockResolvedValue({ insight: 'ai', source: 'LLM', creditsRemaining: 95 });
    getCredits.mockRejectedValue(new Error('offline'));

    await store.analyzeChart(base);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.credits).toBe(95);
    expect(store.error).toBeNull();
  });

  it('a free rule-based answer does not re-read the balance', async () => {
    const store = useAiStore();
    analyzeChart.mockResolvedValue({ insight: 'rule', source: 'RULE_BASED' });

    await store.analyzeChart({ ...base, useAi: false });

    expect(getCredits).not.toHaveBeenCalled();
  });
});

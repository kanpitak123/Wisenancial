import { NewsImportance, NewsSentiment } from '@prisma/client';
import { NewsEnrichmentService } from './news-enrichment.service';

/**
 * Chunk A — first-pass classifier (Claude FAST): the NEWS_CLASSIFIER_ENABLED-gated
 * branch in enrichWithFallback(). Covers: classifier serves; classifier fails ->
 * legacy enrichment prompt; malformed output -> legacy prompt; flag off -> unchanged
 * legacy behavior; the removed Gemini-only flag no longer switches anything on;
 * importance/confidence persisted.
 */

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: 'ECB rate decision',
    country: 'EUR',
    impact: 'High',
    forecast: null,
    previous: null,
    actual: null,
    date: new Date('2026-09-24T08:00:00.000Z'),
    ...overrides,
  };
}

const LEGACY_CHAIN_RESULT = {
  aiSummary: 'Legacy-chain summary',
  aiTrend: 'SIDEWAY',
  aiImpactProbability: 50,
  stockImpactAnalysis: 'Legacy-chain analysis',
  sector: 'General',
  importance: NewsImportance.MEDIUM,
  sentiment: NewsSentiment.NEUTRAL,
  aiTranslatedSummary: undefined,
  fromFallback: false,
};

const CLASSIFIER_RESULT = {
  aiSummary: 'Classifier summary',
  aiTrend: 'UP',
  aiImpactProbability: 75,
  stockImpactAnalysis: 'Classifier analysis',
  sector: 'Macro / Rates',
  importance: NewsImportance.HIGH,
  sentiment: NewsSentiment.BULLISH,
  aiTranslatedSummary: undefined,
  fromFallback: false,
  confidence: 0.88,
};

function makeService(row: ReturnType<typeof makeRow>) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const update = jest.fn().mockResolvedValue({ ...row, id: row.id });
  const enrichNewsArticle = jest.fn().mockResolvedValue(LEGACY_CHAIN_RESULT);
  const classify = jest.fn().mockResolvedValue(CLASSIFIER_RESULT);
  const broadcastNewsUpdate = jest.fn();

  const service = new NewsEnrichmentService(
    { news: { findUnique, update } } as never,
    { enrichNewsArticle } as never,
    { broadcastNewsUpdate } as never,
    { classify } as never,
  );

  return { service, findUnique, update, enrichNewsArticle, classify };
}

describe('NewsEnrichmentService — Chunk A classifier fallback wiring', () => {
  const ORIGINAL_FLAG = process.env.NEWS_CLASSIFIER_ENABLED;
  const ORIGINAL_LEGACY_FLAG = process.env.GEMINI_NEWS_ENRICHMENT_ENABLED;

  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  afterEach(() => {
    restore('NEWS_CLASSIFIER_ENABLED', ORIGINAL_FLAG);
    restore('GEMINI_NEWS_ENRICHMENT_ENABLED', ORIGINAL_LEGACY_FLAG);
  });

  it('the removed GEMINI_NEWS_ENRICHMENT_ENABLED flag no longer switches the classifier on', async () => {
    delete process.env.NEWS_CLASSIFIER_ENABLED;
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = 'true';
    const { service, enrichNewsArticle, classify } = makeService(makeRow());

    await service.enrichTraderNews(1, 'en');

    expect(classify).not.toHaveBeenCalled();
    expect(enrichNewsArticle).toHaveBeenCalledTimes(1);
  });

  it('flag off: behaves exactly as before — legacy chain only, classifier never called, ai_confidence null', async () => {
    process.env.NEWS_CLASSIFIER_ENABLED = 'false';
    const row = makeRow();
    const { service, update, enrichNewsArticle, classify } = makeService(row);

    await service.enrichTraderNews(1, 'en');

    expect(classify).not.toHaveBeenCalled();
    expect(enrichNewsArticle).toHaveBeenCalledTimes(1);
    expect(enrichNewsArticle).toHaveBeenCalledWith(
      row.title,
      expect.any(String),
      expect.any(String),
      'en',
    );

    const [{ data }] = update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.ai_confidence).toBeNull();
    expect(data.ai_summary).toBe('Legacy-chain summary');
  });

  it('flag on, classifier succeeds: served by the classifier, no fallback call, importance + confidence persisted', async () => {
    process.env.NEWS_CLASSIFIER_ENABLED = 'true';
    const row = makeRow();
    const { service, update, enrichNewsArticle, classify } = makeService(row);

    await service.enrichTraderNews(1, 'en');

    expect(classify).toHaveBeenCalledTimes(1);
    expect(enrichNewsArticle).not.toHaveBeenCalled();

    const [{ data }] = update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.importance).toBe(NewsImportance.HIGH);
    expect(data.ai_confidence).toBe(0.88);
    expect(data.ai_summary).toBe('Classifier summary');
  });

  it('flag on, classifier fails (network/timeout): falls back to the legacy enrichment prompt', async () => {
    process.env.NEWS_CLASSIFIER_ENABLED = 'true';
    const row = makeRow();
    const { service, update, enrichNewsArticle, classify } = makeService(row);
    classify.mockRejectedValueOnce(
      new Error('Anthropic request failed: network timeout'),
    );

    await service.enrichTraderNews(1, 'en');

    expect(classify).toHaveBeenCalledTimes(1);
    expect(enrichNewsArticle).toHaveBeenCalledTimes(1);
    // no provider is excluded any more: only AI_PROVIDERS decides who may answer
    expect(enrichNewsArticle.mock.calls[0]).toHaveLength(4);

    const [{ data }] = update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.ai_confidence).toBeNull();
    expect(data.ai_summary).toBe('Legacy-chain summary');
  });

  it('flag on, classifier returns malformed/invalid output: falls back to the legacy enrichment prompt', async () => {
    process.env.NEWS_CLASSIFIER_ENABLED = 'true';
    const row = makeRow();
    const { service, update, enrichNewsArticle, classify } = makeService(row);
    classify.mockRejectedValueOnce(
      new Error(
        'NewsClassificationValidationError: importance "CRITICAL" is not one of HIGH/MEDIUM/LOW',
      ),
    );

    await service.enrichTraderNews(1, 'en');

    expect(classify).toHaveBeenCalledTimes(1);
    expect(enrichNewsArticle).toHaveBeenCalledTimes(1);
    // no provider is excluded any more: only AI_PROVIDERS decides who may answer
    expect(enrichNewsArticle.mock.calls[0]).toHaveLength(4);

    const [{ data }] = update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.ai_confidence).toBeNull();
  });

  it('enrichInvestorArticle (market_news path) also carries confidence through when the classifier serves', async () => {
    process.env.NEWS_CLASSIFIER_ENABLED = 'true';
    const row = makeRow();
    const { service, classify } = makeService(row);

    const result = await service.enrichInvestorArticle({
      title: 'Company beats earnings estimates',
      summary: 'Quarterly results exceeded consensus.',
      language: 'en',
    });

    expect(classify).toHaveBeenCalledTimes(1);
    expect(result.confidence).toBe(0.88);
    expect(result.servedBy).toBe('classifier');
    expect(result.importance).toBe(NewsImportance.HIGH);
  });
});

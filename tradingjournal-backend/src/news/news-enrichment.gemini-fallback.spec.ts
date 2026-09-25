import { NewsImportance, NewsSentiment } from '@prisma/client';
import { NewsEnrichmentService } from './news-enrichment.service';

/**
 * Chunk A — Gemini first-pass enrichment: the GEMINI_NEWS_ENRICHMENT_ENABLED-gated
 * branch in enrichWithFallback(). Covers the 5 required scenarios: Gemini serves;
 * Gemini fails -> fallback chain (Gemini excluded); malformed output -> fallback
 * chain; flag off -> unchanged legacy behavior; importance/confidence persisted.
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

const GEMINI_RESULT = {
  aiSummary: 'Gemini summary',
  aiTrend: 'UP',
  aiImpactProbability: 75,
  stockImpactAnalysis: 'Gemini analysis',
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
  const classify = jest.fn().mockResolvedValue(GEMINI_RESULT);
  const broadcastNewsUpdate = jest.fn();

  const service = new NewsEnrichmentService(
    { news: { findUnique, update } } as never,
    { enrichNewsArticle } as never,
    { broadcastNewsUpdate } as never,
    { classify } as never,
  );

  return { service, findUnique, update, enrichNewsArticle, classify };
}

describe('NewsEnrichmentService — Chunk A Gemini fallback wiring', () => {
  const ORIGINAL_FLAG = process.env.GEMINI_NEWS_ENRICHMENT_ENABLED;

  afterEach(() => {
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = ORIGINAL_FLAG;
  });

  it('flag off: behaves exactly as before — legacy chain only, Gemini never called, ai_confidence null', async () => {
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = 'false';
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

  it('flag on, Gemini succeeds: served by Gemini, no fallback call, importance + confidence persisted', async () => {
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = 'true';
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
    expect(data.ai_summary).toBe('Gemini summary');
  });

  it('flag on, Gemini fails (network/timeout): falls back to the existing chain with Gemini excluded', async () => {
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = 'true';
    const row = makeRow();
    const { service, update, enrichNewsArticle, classify } = makeService(row);
    classify.mockRejectedValueOnce(
      new Error('Gemini request failed: network timeout'),
    );

    await service.enrichTraderNews(1, 'en');

    expect(classify).toHaveBeenCalledTimes(1);
    expect(enrichNewsArticle).toHaveBeenCalledTimes(1);
    const [, , , , options] = enrichNewsArticle.mock.calls[0] as [
      string,
      string,
      string,
      string,
      { excludeProviders?: string[] } | undefined,
    ];
    expect(options?.excludeProviders).toEqual(['gemini']);

    const [{ data }] = update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.ai_confidence).toBeNull();
    expect(data.ai_summary).toBe('Legacy-chain summary');
  });

  it('flag on, Gemini returns malformed/invalid output: falls back to the existing chain with Gemini excluded', async () => {
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = 'true';
    const row = makeRow();
    const { service, update, enrichNewsArticle, classify } = makeService(row);
    classify.mockRejectedValueOnce(
      new Error(
        'GeminiClassificationValidationError: importance "CRITICAL" is not one of HIGH/MEDIUM/LOW',
      ),
    );

    await service.enrichTraderNews(1, 'en');

    expect(classify).toHaveBeenCalledTimes(1);
    expect(enrichNewsArticle).toHaveBeenCalledTimes(1);
    const [, , , , options] = enrichNewsArticle.mock.calls[0] as [
      string,
      string,
      string,
      string,
      { excludeProviders?: string[] } | undefined,
    ];
    expect(options?.excludeProviders).toEqual(['gemini']);

    const [{ data }] = update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.ai_confidence).toBeNull();
  });

  it('enrichInvestorArticle (market_news path) also carries confidence through when Gemini serves', async () => {
    process.env.GEMINI_NEWS_ENRICHMENT_ENABLED = 'true';
    const row = makeRow();
    const { service, classify } = makeService(row);

    const result = await service.enrichInvestorArticle({
      title: 'Company beats earnings estimates',
      summary: 'Quarterly results exceeded consensus.',
      language: 'en',
    });

    expect(classify).toHaveBeenCalledTimes(1);
    expect(result.confidence).toBe(0.88);
    expect(result.servedBy).toBe('gemini');
    expect(result.importance).toBe(NewsImportance.HIGH);
  });
});

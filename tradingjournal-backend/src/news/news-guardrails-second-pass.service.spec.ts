import { NewsImportance } from '@prisma/client';
import { GUARDRAILS_MODEL_ID } from '../ai/news-guardrails.executor';
import { NewsGuardrailsSecondPassService } from './news-guardrails-second-pass.service';
import { loadNewsGuardrailsConfig } from './news-guardrails.config';

/**
 * Shadow guardrails second pass — all mocked, no provider key needed. The vendored
 * NewsAnalysisService runs for real against a fake AiManagerService, so these tests
 * also prove what the wrapped executor sends to the AI layer.
 */

const NOW = new Date('2026-09-29T12:00:00.000Z');

const LONG_CONTENT =
  'Kestrel Microdevices reported second-quarter 2026 revenue of $4.2 billion, above the ' +
  'analyst consensus of $3.9 billion, and adjusted EPS of $1.12 versus the $1.05 expected. ' +
  'Gross margin was 51.3%. However, the company guided third-quarter revenue to $4.0-4.1 ' +
  'billion, below the $4.5 billion analysts had expected, citing inventory adjustments at ' +
  'several large customers.';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    title:
      'Kestrel Microdevices tops Q2 estimates but third-quarter forecast disappoints',
    content: LONG_CONTENT,
    source: 'Global Wire',
    url: 'https://example.test/kstl',
    importance: NewsImportance.HIGH,
    ai_confidence: 0.6,
    sector: 'Technology',
    stock_symbols: ['KSTL'],
    published_at: new Date('2026-09-29T09:00:00.000Z'),
    ...overrides,
  };
}

/** A guardrail-clean model answer citing the article's own source id. */
function llmOutput(sourceId: string) {
  const ref = `src:${sourceId}`;
  return {
    status: 'success',
    confidence: 0.76,
    confidenceReason: 'Reported by the company; single source.',
    warnings: [],
    data: {
      headline:
        'Kestrel Microdevices กำไรไตรมาส 2/2026 เหนือคาด แต่แนวโน้มไตรมาส 3 ต่ำกว่าคาด',
      summary: [
        'Kestrel Microdevices รายงานรายได้ไตรมาส 2/2026 เหนือคาด',
        'แต่แนวโน้มไตรมาส 3 ต่ำกว่าคาดจากการปรับสต็อกของลูกค้ารายใหญ่',
        'ควรติดตามแนวโน้มรายได้เต็มปีที่บริษัทยังไม่ให้ไว้',
      ],
      positiveFactors: [
        {
          factor: 'รายได้ไตรมาส 2 เหนือคาด',
          reason: 'บริษัทรายงานรายได้ไตรมาส 2 สูงกว่าคาดการณ์ของนักวิเคราะห์',
          basis: 'fact',
          evidenceRefs: [ref],
        },
      ],
      negativeFactors: [
        {
          factor: 'แนวโน้มไตรมาส 3 ต่ำกว่าคาด',
          reason: 'บริษัทให้แนวโน้มรายได้ไตรมาส 3 ต่ำกว่าที่นักวิเคราะห์คาดไว้',
          basis: 'fact',
          evidenceRefs: [ref],
        },
      ],
      counterpointNote: null,
      newsTone: 'mixed',
      sentiment: 'mixed_negative',
      sentimentReason:
        'ผลประกอบการไตรมาส 2 เหนือคาด แต่แนวโน้มไตรมาส 3 ต่ำกว่าคาดในสัดส่วนที่มากกว่า',
      impact: {
        shortTerm: {
          direction: 'negative',
          strength: 'medium',
          rationale:
            'แนวโน้มไตรมาส 3 ที่ต่ำกว่าคาดอาจมีน้ำหนักมากกว่าผลประกอบการไตรมาส 2',
          uncertainty: 'medium',
        },
        mediumTerm: null,
        longTerm: null,
      },
      affected: [
        {
          name: 'Kestrel Microdevices',
          symbol: 'KSTL',
          kind: 'asset',
          relation: 'direct',
          mechanism: 'ผลประกอบการไตรมาส 2 และแนวโน้มไตรมาส 3 ของบริษัทโดยตรง',
          confidence: 0.78,
        },
      ],
      claimStatus: 'confirmed',
      conflicts: [],
      missingContext: ['แนวโน้มรายได้เต็มปี 2026'],
    },
  };
}

const ENV_KEYS = [
  'NEWS_GUARDRAILS_ENABLED',
  'NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD',
  'NEWS_GUARDRAILS_DAILY_BUDGET',
  'NEWS_GUARDRAILS_BATCH_SIZE',
  'NEWS_GUARDRAILS_MAX_AGE_HOURS',
] as const;

function makeHarness(
  opts: {
    rows?: ReturnType<typeof makeRow>[];
    usedToday?: number;
    managerImpl?: jest.Mock;
  } = {},
) {
  const rows = opts.rows ?? [makeRow()];
  const count = jest.fn().mockResolvedValue(opts.usedToday ?? 0);
  const findMany = jest.fn().mockResolvedValue(rows);
  const update = jest.fn().mockResolvedValue({});
  const executeSystemAiRequest =
    opts.managerImpl ??
    jest.fn().mockImplementation(({ prompt }: { prompt: string }) => {
      const id = /mn-\d+/.exec(prompt)?.[0] ?? 'mn-7';
      return Promise.resolve({
        data: llmOutput(id),
        model: 'claude-sonnet-5',
        usage: { inputTokens: 2000, outputTokens: 5700 },
      });
    });
  // Present only so the tests can prove the user-paid entry point is never used.
  const executeAiRequest = jest.fn();

  const service = new NewsGuardrailsSecondPassService(
    { market_news: { count, findMany, update } } as never,
    { executeSystemAiRequest, executeAiRequest } as never,
  );
  return {
    service,
    count,
    findMany,
    update,
    executeSystemAiRequest,
    executeAiRequest,
  };
}

describe('NewsGuardrailsSecondPassService', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('does nothing at all when the flag is off (default)', async () => {
    const h = makeHarness();

    const outcome = await h.service.runOnce(NOW);

    expect(outcome).toMatchObject({ skipped: 'disabled', analysed: 0 });
    expect(h.count).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.executeSystemAiRequest).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('selects HIGH importance OR low first-pass confidence, unanalysed and recent, newest first', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const h = makeHarness({ rows: [] });

    await h.service.runOnce(NOW);

    expect(h.findMany).toHaveBeenCalledTimes(1);
    const args = h.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(args.where).toEqual({
      ai_analysis_at: null,
      published_at: { gte: new Date('2026-09-27T12:00:00.000Z') }, // 48 h back
      OR: [{ importance: NewsImportance.HIGH }, { ai_confidence: { lt: 0.8 } }],
    });
    expect(args.orderBy).toEqual({ published_at: 'desc' });
    expect(args.take).toBe(3);
  });

  it('honours the configured threshold, batch size and max age', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    process.env.NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD = '0.65';
    process.env.NEWS_GUARDRAILS_BATCH_SIZE = '5';
    process.env.NEWS_GUARDRAILS_MAX_AGE_HOURS = '12';
    const h = makeHarness({ rows: [] });

    await h.service.runOnce(NOW);

    const args = h.findMany.mock.calls[0][0] as {
      where: { OR: unknown[]; published_at: { gte: Date } };
      take: number;
    };
    expect(args.where.OR).toContainEqual({ ai_confidence: { lt: 0.65 } });
    expect(args.where.published_at.gte).toEqual(
      new Date('2026-09-29T00:00:00.000Z'),
    );
    expect(args.take).toBe(5);
  });

  it('counts today (UTC) from stamped rows and caps the batch at the remaining budget', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    process.env.NEWS_GUARDRAILS_DAILY_BUDGET = '10';
    const h = makeHarness({ usedToday: 9, rows: [] });

    await h.service.runOnce(NOW);

    expect(h.count).toHaveBeenCalledWith({
      where: { ai_analysis_at: { gte: new Date('2026-09-29T00:00:00.000Z') } },
    });
    expect((h.findMany.mock.calls[0][0] as { take: number }).take).toBe(1);
  });

  it('stops without selecting or calling any provider once the daily budget is spent', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    process.env.NEWS_GUARDRAILS_DAILY_BUDGET = '10';
    const h = makeHarness({ usedToday: 10 });

    const outcome = await h.service.runOnce(NOW);

    expect(outcome.skipped).toBe('budget-exhausted');
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.executeSystemAiRequest).not.toHaveBeenCalled();
  });

  it('a budget of 0 disables analysis even with the flag on', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    process.env.NEWS_GUARDRAILS_DAILY_BUDGET = '0';
    const h = makeHarness();

    const outcome = await h.service.runOnce(NOW);

    expect(outcome.skipped).toBe('budget-exhausted');
    expect(h.executeSystemAiRequest).not.toHaveBeenCalled();
  });

  it('is system-paid and Claude-only: preferredOnly, forced model id, never the user-paid entry point', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const h = makeHarness();

    await h.service.runOnce(NOW);

    expect(h.executeSystemAiRequest).toHaveBeenCalled();
    for (const [request] of h.executeSystemAiRequest.mock.calls as [
      Record<string, unknown>,
    ][]) {
      expect(request.modelId).toBe(GUARDRAILS_MODEL_ID);
      expect(request.modelId).toBe('claude-sonnet-5');
      expect(request.preferredOnly).toBe(true);
      expect(request).not.toHaveProperty('userId');
    }
    expect(h.executeAiRequest).not.toHaveBeenCalled();
  });

  it('shadow mode: persists only ai_analysis + ai_analysis_at, never the visible columns', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const h = makeHarness();

    const outcome = await h.service.runOnce(NOW);

    expect(outcome).toMatchObject({ selected: 1, analysed: 1 });
    expect(h.update).toHaveBeenCalledTimes(1);
    const args = h.update.mock.calls[0][0] as {
      where: { id: number };
      data: Record<string, unknown>;
    };
    expect(args.where).toEqual({ id: 7 });
    expect(Object.keys(args.data).sort()).toEqual([
      'ai_analysis',
      'ai_analysis_at',
    ]);
    const stored = args.data.ai_analysis as {
      selected_by: string[];
      envelope: { status: string; feature: string; request_id: string };
      usage: { inputTokens: number; outputTokens: number };
      first_pass_confidence: number;
    };
    expect(stored.envelope).toMatchObject({
      status: 'success',
      feature: 'news_analysis',
      request_id: 'market_news:7',
    });
    expect(stored.selected_by).toEqual(['importance', 'low_confidence']);
    expect(stored.first_pass_confidence).toBe(0.6);
    expect(stored.usage).toEqual({ inputTokens: 2000, outputTokens: 5700 });
    expect(args.data.ai_analysis_at).toBeInstanceOf(Date);
  });

  it('stops the tick and persists nothing when the provider call throws (e.g. no Anthropic key)', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const managerImpl = jest
      .fn()
      .mockRejectedValue(
        new Error('No AI provider is configured on this server.'),
      );
    const h = makeHarness({
      rows: [makeRow({ id: 7 }), makeRow({ id: 8 })],
      managerImpl,
    });

    const outcome = await h.service.runOnce(NOW);

    expect(outcome).toMatchObject({
      selected: 2,
      analysed: 0,
      providerFailure: true,
    });
    expect(h.update).not.toHaveBeenCalled();
    // Only the first row was tried (and the module does not retry a thrown call), so
    // the second was not burned against a dead provider.
    expect(managerImpl).toHaveBeenCalledTimes(1);
  });

  it('persists an error envelope when the model answers but fails validation twice, so it is not re-selected forever', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const managerImpl = jest.fn().mockResolvedValue({
      data: { nonsense: true },
      model: 'claude-sonnet-5',
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    const h = makeHarness({ managerImpl });

    const outcome = await h.service.runOnce(NOW);

    expect(outcome).toMatchObject({ analysed: 1, providerFailure: false });
    expect(managerImpl).toHaveBeenCalledTimes(2); // first try + one retry with feedback
    const stored = (
      h.update.mock.calls[0][0] as {
        data: { ai_analysis: { envelope: { status: string } } };
      }
    ).data.ai_analysis;
    expect(stored.envelope.status).toBe('error');
  });

  it('does not start a second run while one is in flight', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const managerImpl = jest.fn().mockImplementation(async () => {
      await gate;
      return {
        data: llmOutput('mn-7'),
        model: 'claude-sonnet-5',
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });
    const h = makeHarness({ managerImpl });

    const first = h.service.runOnce(NOW);
    await new Promise((resolve) => setImmediate(resolve));
    const second = await h.service.runOnce(NOW);
    release();
    await first;

    expect(second.skipped).toBe('already-running');
    expect(h.count).toHaveBeenCalledTimes(1);
  });

  it('a thrown cron error is swallowed by scheduledRun', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const h = makeHarness();
    h.count.mockRejectedValue(new Error('db down'));

    await expect(h.service.scheduledRun()).resolves.toBeUndefined();
  });
});

describe('loadNewsGuardrailsConfig', () => {
  it('defaults: off, 0.80 threshold, small budget, small batch, 48 h', () => {
    expect(loadNewsGuardrailsConfig({})).toEqual({
      enabled: false,
      confidenceThreshold: 0.8,
      dailyBudget: 20,
      batchSize: 3,
      maxAgeHours: 48,
    });
  });

  it('only the literal string "true" enables it', () => {
    expect(
      loadNewsGuardrailsConfig({ NEWS_GUARDRAILS_ENABLED: '1' }).enabled,
    ).toBe(false);
    expect(
      loadNewsGuardrailsConfig({ NEWS_GUARDRAILS_ENABLED: 'true' }).enabled,
    ).toBe(true);
  });

  it('falls back to safe defaults on malformed or out-of-range values', () => {
    const config = loadNewsGuardrailsConfig({
      NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD: '1.5',
      NEWS_GUARDRAILS_DAILY_BUDGET: 'lots',
      NEWS_GUARDRAILS_BATCH_SIZE: '-2',
      NEWS_GUARDRAILS_MAX_AGE_HOURS: '0',
    });
    expect(config).toMatchObject({
      confidenceThreshold: 0.8,
      dailyBudget: 20,
      batchSize: 3,
      maxAgeHours: 48,
    });
  });

  it('clamps the batch size', () => {
    expect(
      loadNewsGuardrailsConfig({ NEWS_GUARDRAILS_BATCH_SIZE: '99' }).batchSize,
    ).toBe(10);
  });
});

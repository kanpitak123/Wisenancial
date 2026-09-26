/**
 * Envelope-completeness and observability tests (spec 12.1 / 14.2 / NFR-05).
 *
 * `golden.spec.ts` already exercises precheck -> validate -> guardrails -> legacy
 * mapping end to end for ten real cases. This file focuses on what changed on top of
 * that: every exit path must produce a *complete* envelope (`requestId`, `feature`,
 * `sources`, `trace`), `toSpecEnvelope()` must match `envelope.schema.json`
 * exactly, and the injectable logger must fire exactly once per `analyse()` call while
 * staying silent by default.
 */

import * as fs from 'fs';
import * as path from 'path';
import { NewsAnalysisService } from './news-analysis.service';
import { toSpecEnvelope } from './news-analysis.service';
import type {
  AnalysisLogger,
  LlmNewsOutput,
  NewsArticleInput,
  NewsAnalysisResult,
  SystemAiExecutor,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-09-13T09:00:00Z');

/** Long enough to clear both the 40-char short-circuit and the 300-char thin-content flag. */
const LONG_CONTENT =
  'Kestrel Microdevices reported second-quarter 2026 revenue of $4.2 billion, above the ' +
  'analyst consensus of $3.9 billion, and adjusted EPS of $1.12 versus the $1.05 expected. ' +
  'Gross margin was 51.3%. However, the company guided third-quarter revenue to $4.0-4.1 ' +
  'billion, below the $4.5 billion analysts had expected, citing inventory adjustments at ' +
  'several large customers.';

function article(overrides: Partial<NewsArticleInput> = {}): NewsArticleInput {
  return {
    sourceId: 'gw-kstl-0912',
    headline:
      'Kestrel Microdevices tops Q2 estimates but third-quarter forecast disappoints',
    content: LONG_CONTENT,
    source: 'Global Wire',
    publishedAt: new Date('2026-09-12T20:15:00Z'),
    ...overrides,
  };
}

/** A minimal, guardrail-clean LlmNewsOutput referencing `src:gw-kstl-0912`. */
function validLlmOutput(overrides: Partial<LlmNewsOutput> = {}): LlmNewsOutput {
  return {
    status: 'success',
    confidence: 0.76,
    confidenceReason:
      'Reported by the company with CFO commentary; single source.',
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
          evidenceRefs: ['src:gw-kstl-0912'],
        },
      ],
      negativeFactors: [
        {
          factor: 'แนวโน้มไตรมาส 3 ต่ำกว่าคาด',
          reason: 'บริษัทให้แนวโน้มรายได้ไตรมาส 3 ต่ำกว่าที่นักวิเคราะห์คาดไว้',
          basis: 'fact',
          evidenceRefs: ['src:gw-kstl-0912'],
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
    ...overrides,
  };
}

class FakeExecutor implements SystemAiExecutor {
  public callCount = 0;
  constructor(
    private readonly responses: ReadonlyArray<LlmNewsOutput | Error>,
  ) {}

  executeSystemAiRequest<T>(): Promise<{
    data: T;
    model: string;
    usage: unknown;
  }> {
    const response = this.responses[this.callCount];
    this.callCount += 1;
    if (response === undefined)
      return Promise.reject(
        new Error('FakeExecutor: no more scripted responses'),
      );
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve({
      data: response as unknown as T,
      model: 'fake-model',
      usage: {},
    });
  }
}

class RecordingLogger implements AnalysisLogger {
  public readonly logs: unknown[] = [];
  public readonly warns: unknown[] = [];
  public readonly errors: unknown[] = [];
  log(message: unknown): void {
    this.logs.push(message);
  }
  warn(message: unknown): void {
    this.warns.push(message);
  }
  error(message: unknown): void {
    this.errors.push(message);
  }
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every field spec 12.1 requires must be present and non-undefined on every exit path. */
function assertCompleteEnvelope(result: NewsAnalysisResult): void {
  expect(typeof result.requestId).toBe('string');
  expect(result.requestId.length).toBeGreaterThan(0);
  expect(result.feature).toBe('news_analysis');
  expect(result.status).toBeDefined();
  expect('analysis' in result).toBe(true);
  expect('confidence' in result).toBe(true);
  expect('confidenceReason' in result).toBe(true);
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(Array.isArray(result.sources)).toBe(true);
  expect('dataAsOf' in result).toBe(true);
  expect(typeof result.modelVersion).toBe('string');
  expect(result.modelVersion.length).toBeGreaterThan(0);
  expect(result.schemaVersion).toBe('1.0');
  expect(result.trace).toBeDefined();
  expect(result.trace.requestId).toBe(result.requestId);
  expect(result.trace.feature).toBe('news_analysis');
  expect(result.trace.status).toBe(result.status);
  expect(typeof result.trace.latencyMs).toBe('number');
  expect(result.trace.latencyMs).toBeGreaterThanOrEqual(0);
}

// ---------------------------------------------------------------------------
// Every exit path produces a complete envelope
// ---------------------------------------------------------------------------

describe('every exit path produces a complete envelope', () => {
  test('success', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput({ status: 'success' })]),
    );
    const result = await service.analyse([article()], { now: NOW });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('success');
    expect(result.analysis).not.toBeNull();
    expect(result.trace.attempts).toBe(1);
    expect(result.trace.promptVersion).not.toBeNull();
  });

  test('partial', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput({ status: 'partial' })]),
    );
    const result = await service.analyse([article()], { now: NOW });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('partial');
    expect(result.analysis).not.toBeNull();
  });

  test('insufficient_data via short-circuit (body < 40 chars, no model call)', async () => {
    const executor = new FakeExecutor([]);
    const service = new NewsAnalysisService(executor);
    const result = await service.analyse([article({ content: 'too short' })], {
      now: NOW,
    });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('insufficient_data');
    expect(result.analysis).not.toBeNull();
    expect(executor.callCount).toBe(0);
    expect(result.trace.attempts).toBe(0);
    expect(result.trace.promptVersion).toBeNull();
    expect(result.modelVersion).toBe('deterministic');
    expect(result.warnings.some((w) => w.code === 'AI_INSUFFICIENT_DATA')).toBe(
      true,
    );
  });

  test('short-circuit is deterministic: identical result whichever executor is passed', async () => {
    const neverCalled: SystemAiExecutor = {
      executeSystemAiRequest: () => {
        throw new Error('must not be called');
      },
    };
    const service = new NewsAnalysisService(neverCalled);
    const result = await service.analyse([article({ content: '' })], {
      now: NOW,
    });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('insufficient_data');
  });

  test('input-invalid (empty article list)', async () => {
    const service = new NewsAnalysisService(new FakeExecutor([]));
    const result = await service.analyse([], { now: NOW });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('error');
    expect(result.analysis).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.confidenceReason).toBeNull();
    expect(result.sources).toEqual([]);
    expect(result.warnings[0]?.code).toBe('AI_INPUT_INVALID');
    expect(result.trace.attempts).toBe(0);
    expect(result.modelVersion).toBe('deterministic');
  });

  test('timeout', async () => {
    const timeoutError = Object.assign(new Error('request timed out'), {
      name: 'TimeoutError',
    });
    const service = new NewsAnalysisService(new FakeExecutor([timeoutError]));
    const result = await service.analyse([article()], { now: NOW });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('error');
    expect(result.analysis).toBeNull();
    expect(result.warnings[0]?.code).toBe('AI_MODEL_TIMEOUT');
    expect(result.trace.attempts).toBe(1);
    expect(result.sources.length).toBe(1); // precheck already ran; sources are still known
  });

  test('give up after retry (schema validation fails twice)', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([{} as LlmNewsOutput, {} as LlmNewsOutput]),
    );
    const result = await service.analyse([article()], { now: NOW });
    assertCompleteEnvelope(result);
    expect(result.status).toBe('error');
    expect(result.analysis).toBeNull();
    expect(result.warnings[0]?.code).toBe('AI_OUTPUT_INVALID');
    expect(result.trace.attempts).toBe(2);
    expect(result.trace.validationErrorCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// requestId pass-through and generation
// ---------------------------------------------------------------------------

describe('requestId', () => {
  test('is generated as a UUID v4 when not supplied', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
    );
    const result = await service.analyse([article()], { now: NOW });
    expect(result.requestId).toMatch(UUID_V4);
  });

  test('two calls without an explicit requestId get different ids', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput(), validLlmOutput()]),
    );
    const a = await service.analyse([article()], { now: NOW });
    const b = await service.analyse([article()], { now: NOW });
    expect(a.requestId).not.toBe(b.requestId);
  });

  test('is passed through verbatim when supplied, on every exit path', async () => {
    const successService = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
    );
    const successResult = await successService.analyse([article()], {
      now: NOW,
      requestId: 'caller-req-1',
    });
    expect(successResult.requestId).toBe('caller-req-1');
    expect(successResult.trace.requestId).toBe('caller-req-1');

    const invalidService = new NewsAnalysisService(new FakeExecutor([]));
    const invalidResult = await invalidService.analyse([], {
      now: NOW,
      requestId: 'caller-req-2',
    });
    expect(invalidResult.requestId).toBe('caller-req-2');

    const shortCircuitService = new NewsAnalysisService(new FakeExecutor([]));
    const shortCircuitResult = await shortCircuitService.analyse(
      [article({ content: 'x' })],
      {
        now: NOW,
        requestId: 'caller-req-3',
      },
    );
    expect(shortCircuitResult.requestId).toBe('caller-req-3');
  });
});

// ---------------------------------------------------------------------------
// Sources carried through, including syndicated copy ids
// ---------------------------------------------------------------------------

describe('sources', () => {
  test('carries one source per independent article', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
    );
    const result = await service.analyse([article()], { now: NOW });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      sourceId: 'gw-kstl-0912',
      name: 'Global Wire',
      syndicatedCopyIds: [],
    });
    expect(result.sources[0]?.publishedAt).toBeInstanceOf(Date);
  });

  test('folds a near-duplicate wire copy into the canonical source, with its id in syndicatedCopyIds', async () => {
    const canonical = article({
      sourceId: 'gw-kstl-0912',
      publishedAt: new Date('2026-09-12T20:15:00Z'),
    });
    const syndicatedCopy = article({
      sourceId: 'ap-kstl-0912',
      source: 'Associated Wire',
      publishedAt: new Date('2026-09-12T20:20:00Z'), // later -> not canonical
    });
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
    );
    const result = await service.analyse([canonical, syndicatedCopy], {
      now: NOW,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.sourceId).toBe('gw-kstl-0912');
    expect(result.sources[0]?.syndicatedCopyIds).toEqual(['ap-kstl-0912']);
    expect(result.independentSourceCount).toBe(1);
    expect(result.trace.independentSourceCount).toBe(1);
  });

  test('is empty on input-invalid', async () => {
    const service = new NewsAnalysisService(new FakeExecutor([]));
    const result = await service.analyse([], { now: NOW });
    expect(result.sources).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toSpecEnvelope() matches envelope.schema.json
// ---------------------------------------------------------------------------

describe('toSpecEnvelope()', () => {
  // Reconstructed from the SpecEnvelope interface (see the schema's own description):
  // the upstream file was never shipped with the handover package, so it lives next
  // to the code it describes instead of at a path outside this module.
  const ENVELOPE_SCHEMA_PATH = path.join(__dirname, 'envelope.schema.json');
  const envelopeSchema = fs.existsSync(ENVELOPE_SCHEMA_PATH)
    ? (JSON.parse(fs.readFileSync(ENVELOPE_SCHEMA_PATH, 'utf-8')) as {
        required: readonly string[];
        properties: Record<string, unknown>;
      })
    : null;

  test('the envelope schema file is present next to the module', () => {
    expect(envelopeSchema).not.toBeNull();
  });

  const expectedKeys = [
    'request_id',
    'feature',
    'status',
    'data',
    'error',
    'confidence',
    'confidence_reason',
    'warnings',
    'sources',
    'data_as_of',
    'model_version',
    'schema_version',
  ];

  test('produces exactly the required top-level keys from spec 12.1', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
    );
    const result = await service.analyse([article()], { now: NOW });
    const envelope = toSpecEnvelope(result);

    const requiredKeys = envelopeSchema?.required ?? expectedKeys;
    for (const key of requiredKeys) {
      expect(Object.prototype.hasOwnProperty.call(envelope, key)).toBe(true);
    }
    expect(Object.keys(envelope).sort()).toEqual([...expectedKeys].sort());
    if (envelopeSchema) {
      expect(Object.keys(envelopeSchema.properties).sort()).toEqual(
        [...expectedKeys].sort(),
      );
    }
  });

  test('success: data is an object, error is null, confidence/confidence_reason are non-null', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
    );
    const result = await service.analyse([article()], {
      now: NOW,
      requestId: 'req-success',
    });
    const envelope = toSpecEnvelope(result);

    expect(envelope.request_id).toBe('req-success');
    expect(envelope.feature).toBe('news_analysis');
    expect(envelope.status).toBe('success');
    expect(envelope.error).toBeNull();
    expect(typeof envelope.data).toBe('object');
    expect(envelope.data).not.toBeNull();
    expect(typeof envelope.confidence).toBe('number');
    expect(typeof envelope.confidence_reason).toBe('string');
    expect(envelope.schema_version).toBe('1.0');
    expect(envelope.model_version.length).toBeGreaterThan(0);
    expect(typeof envelope.data_as_of).toBe('string');

    // snake_case field mapping on the nested analysis payload (news_analysis.schema.json).
    const data = envelope.data as unknown as Record<string, unknown>;
    expect(data['positive_factors']).toBeDefined();
    expect(data['negative_factors']).toBeDefined();
    expect(data['counterpoint_note']).toBeNull();
    expect(data['news_tone']).toBe('mixed');
    expect(data['sentiment_reason']).toBeDefined();
    expect(data['claim_status']).toBe('confirmed');
    expect(data['missing_context']).toBeDefined();
    const impact = data['impact'] as Record<string, unknown>;
    expect(impact).toHaveProperty('short_term');
    expect(impact).toHaveProperty('medium_term');
    expect(impact).toHaveProperty('long_term');

    // sources snake_case mapping.
    expect(envelope.sources).toHaveLength(1);
    expect(envelope.sources[0]).toMatchObject({
      source_id: 'gw-kstl-0912',
      name: 'Global Wire',
      syndicated_copy_ids: [],
    });
    expect(typeof envelope.sources[0]?.published_at).toBe('string');
  });

  test('error: data and confidence/confidence_reason are null, error is a {code, message} object', async () => {
    const service = new NewsAnalysisService(new FakeExecutor([]));
    const result = await service.analyse([], {
      now: NOW,
      requestId: 'req-error',
    });
    const envelope = toSpecEnvelope(result);

    expect(envelope.status).toBe('error');
    expect(envelope.data).toBeNull();
    expect(envelope.confidence).toBeNull();
    expect(envelope.confidence_reason).toBeNull();
    expect(envelope.error).not.toBeNull();
    expect(envelope.error?.code).toBe('AI_INPUT_INVALID');
    expect(typeof envelope.error?.message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Trace record contents
// ---------------------------------------------------------------------------

describe('trace record', () => {
  test('reflects attempts, guardrail issue counts, staleness and conflict on a two-attempt success', async () => {
    // First attempt is schema-invalid (bumps validationErrorCount transiently), second succeeds.
    const service = new NewsAnalysisService(
      new FakeExecutor([{} as LlmNewsOutput, validLlmOutput()]),
    );
    const result = await service.analyse([article()], { now: NOW });

    expect(result.trace).toEqual({
      requestId: result.requestId,
      feature: 'news_analysis',
      status: 'success',
      latencyMs: result.trace.latencyMs,
      modelVersion: result.modelVersion,
      promptVersion: result.trace.promptVersion,
      attempts: 2,
      validationErrorCount: 0, // the accepted attempt validated cleanly
      guardrailErrorCount: 0,
      guardrailWarningCount: result.trace.guardrailWarningCount,
      independentSourceCount: 1,
      stale: false,
      conflict: false,
      confidence: result.confidence,
    });
  });

  test('stale is true when the latest article is older than 72h', async () => {
    // confidence lowered to clear the stale confidence cap (<= 0.7) so the attempt
    // is accepted and the merged (precheck + model) warnings are the ones returned.
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput({ confidence: 0.5 })]),
    );
    const oldArticle = article({
      publishedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const result = await service.analyse([oldArticle], { now: NOW });
    expect(result.status).not.toBe('error');
    expect(result.trace.stale).toBe(true);
    expect(result.warnings.some((w) => w.code === 'AI_SOURCE_STALE')).toBe(
      true,
    );
  });

  test('conflict is true when the model reports a conflict', async () => {
    // Two known sources so the conflict's source_id references are valid (AI-NEWS-008),
    // and confidence is lowered to clear the conflict confidence cap (<= 0.6).
    const secondArticle = article({
      sourceId: 'other-source',
      source: 'Other Wire',
      content: LONG_CONTENT.replace('$4.2 billion', '$4.0 billion'), // different enough to not be syndicated
    });
    const withConflict = validLlmOutput({
      confidence: 0.5,
      warnings: [
        {
          code: 'AI_SOURCE_CONFLICT',
          message: 'sources disagree on the reported figure',
        },
      ],
      data: {
        ...validLlmOutput().data,
        conflicts: [
          {
            claim: 'reported Q2 revenue',
            values: [
              { value: '$4.2 billion', sourceId: 'gw-kstl-0912' },
              { value: '$4.0 billion', sourceId: 'other-source' },
            ],
            note: 'Two outlets report different Q2 revenue figures.',
          },
        ],
      },
    });
    const service = new NewsAnalysisService(new FakeExecutor([withConflict]));
    const result = await service.analyse([article(), secondArticle], {
      now: NOW,
    });
    expect(result.status).not.toBe('error');
    expect(result.trace.conflict).toBe(true);
    expect(result.warnings.some((w) => w.code === 'AI_SOURCE_CONFLICT')).toBe(
      true,
    );
  });

  test('attempts and validationErrorCount on a full give-up', async () => {
    const service = new NewsAnalysisService(
      new FakeExecutor([{} as LlmNewsOutput, {} as LlmNewsOutput]),
    );
    const result = await service.analyse([article()], { now: NOW });
    expect(result.trace.attempts).toBe(2);
    expect(result.trace.validationErrorCount).toBeGreaterThan(0);
    expect(result.trace.status).toBe('error');
  });

  test('is exposed on the result identically to what gets logged', async () => {
    const logger = new RecordingLogger();
    const service = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
      logger,
    );
    const result = await service.analyse([article()], { now: NOW });
    expect(logger.logs).toHaveLength(1);
    expect(logger.logs[0]).toEqual(result.trace);
  });
});

// ---------------------------------------------------------------------------
// Logger: silent by default, exactly one record per call when injected
// ---------------------------------------------------------------------------

describe('logger injection', () => {
  test('default logger stays silent (no console/log calls) when none is injected', async () => {
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      const service = new NewsAnalysisService(
        new FakeExecutor([validLlmOutput()]),
      );
      await service.analyse([article()], { now: NOW });
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  test('an injected logger receives exactly one record per analyse() call, on every exit path', async () => {
    const logger = new RecordingLogger();

    const successService = new NewsAnalysisService(
      new FakeExecutor([validLlmOutput()]),
      logger,
    );
    await successService.analyse([article()], { now: NOW });
    expect(logger.logs).toHaveLength(1);

    const invalidService = new NewsAnalysisService(
      new FakeExecutor([]),
      logger,
    );
    await invalidService.analyse([], { now: NOW });
    expect(logger.logs).toHaveLength(2);

    const shortCircuitService = new NewsAnalysisService(
      new FakeExecutor([]),
      logger,
    );
    await shortCircuitService.analyse([article({ content: 'x' })], {
      now: NOW,
    });
    expect(logger.logs).toHaveLength(3);

    const timeoutService = new NewsAnalysisService(
      new FakeExecutor([
        Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
      ]),
      logger,
    );
    await timeoutService.analyse([article()], { now: NOW });
    expect(logger.logs).toHaveLength(4);

    expect(logger.warns).toHaveLength(0);
    expect(logger.errors).toHaveLength(0);
  });

  test('never uses warn/error for the routine per-call record, only log', async () => {
    const logger = new RecordingLogger();
    const service = new NewsAnalysisService(
      new FakeExecutor([{} as LlmNewsOutput, {} as LlmNewsOutput]),
      logger,
    );
    await service.analyse([article()], { now: NOW }); // give-up-after-retry: still just one `log`
    expect(logger.logs).toHaveLength(1);
    expect(logger.warns).toHaveLength(0);
    expect(logger.errors).toHaveLength(0);
  });
});

/**
 * Golden-case tests, ported from `tests/test_news_pipeline.py` (PipelineTests) plus the
 * 10 cases in `tests/golden/*.json` in the Python reference implementation.
 *
 * Each fixture in `test/golden/*.json` bundles:
 *  - `request`: the input articles, field names adapted to `NewsArticleInput` (camelCase).
 *  - `llmOutput`: the recorded model response (real Opus 5 output from `eval/cli/*.json`
 *    where available, else the hand-written `eval/dryrun/*.json`), adapted to
 *    `LlmNewsOutput` (camelCase), or `null` for N-04 which short-circuits before any
 *    model call.
 *  - `expect`: the golden case's original assertions (kept in the Python's snake_case
 *    key names since they are read directly by this file, not by the module under test).
 *
 * A `FakeExecutor` stands in for the host backend's `AiManagerService`; it returns the
 * recorded `llmOutput` verbatim so these tests exercise precheck -> validate -> guardrails
 * -> legacy mapping without ever calling a real model.
 */

import * as fs from 'fs';
import * as path from 'path';
import { NewsAnalysisService } from './news-analysis.service';
import { toEnrichmentResult } from './news-analysis.service';
import type {
  LlmNewsOutput,
  NewsArticleInput,
  SystemAiExecutor,
} from './types';

interface GoldenArticle {
  readonly sourceId: string;
  readonly headline: string;
  readonly content: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly relatedSymbols?: readonly string[];
  readonly market?: string;
  readonly sector?: readonly string[];
  readonly url?: string | null;
}

interface GoldenCase {
  readonly id: string;
  readonly title: string;
  readonly now: string;
  readonly request: { readonly articles: readonly GoldenArticle[] };
  readonly llmOutput: LlmNewsOutput | null;
  readonly expect: Record<string, unknown>;
}

const GOLDEN_DIR = path.join(__dirname, 'golden');

/**
 * Known, documented mismatches between a real Opus 5 CLI response and a golden case's
 * expectations. Running the Python reference implementation's own `eval/run_eval.py`
 * against `eval/cli/*.json` reports **9/10 cases passed**, with N-02 failing for exactly
 * this reason: the model listed "single-source press release" as a negative *factor*
 * (basis `interpretation`), which the system prompt explicitly says is NOT a factor
 * (source quality belongs in `claimStatus`/`newsTone`/`confidenceReason` instead), and
 * consequently never set a `counterpointNote`. This is real-model imperfection, not a
 * bug in this port — asserting it away would hide a genuine, reproducible finding.
 * Guardrails do not block it because "source quality as a factor" is a business-rule
 * nuance, not a safety/grounding violation.
 */
const KNOWN_EXPECTATION_MISMATCHES: Record<string, readonly string[]> = {
  'N-02': ['negative_basis_allowed', 'counterpoint_note_required'],
};

function loadCases(): GoldenCase[] {
  return fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map(
      (f) =>
        JSON.parse(
          fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf-8'),
        ) as GoldenCase,
    );
}

function toArticleInput(a: GoldenArticle): NewsArticleInput {
  return {
    sourceId: a.sourceId,
    headline: a.headline,
    content: a.content,
    source: a.source,
    publishedAt: new Date(a.publishedAt),
    ...(a.relatedSymbols !== undefined
      ? { relatedSymbols: a.relatedSymbols }
      : {}),
    ...(a.market !== undefined ? { market: a.market } : {}),
    ...(a.sector !== undefined ? { sector: a.sector } : {}),
    ...(a.url !== undefined ? { url: a.url } : {}),
  };
}

/** Stands in for the host's `AiManagerService`. Records every call's prompt for retry assertions. */
class FakeExecutor implements SystemAiExecutor {
  public readonly calls: Array<{
    prompt: string;
    systemPrompt?: string | undefined;
  }> = [];
  constructor(
    private readonly responses: ReadonlyArray<LlmNewsOutput | Error>,
  ) {}

  executeSystemAiRequest<T>(request: {
    modelId?: string;
    prompt: string;
    systemPrompt?: string;
  }): Promise<{ data: T; model: string; usage: unknown }> {
    this.calls.push({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
    });
    const response = this.responses[this.calls.length - 1];
    if (response === undefined)
      return Promise.reject(
        new Error('FakeExecutor: no more scripted responses'),
      );
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve({
      data: response as unknown as T,
      model: 'fake-golden-model',
      usage: {},
    });
  }
}

class RefusingExecutor implements SystemAiExecutor {
  executeSystemAiRequest<T>(): Promise<{
    data: T;
    model: string;
    usage: unknown;
  }> {
    throw new Error('the LLM must not be called for this case');
  }
}

describe('golden cases', () => {
  for (const goldenCase of loadCases()) {
    test(`${goldenCase.id}: ${goldenCase.title}`, async () => {
      const now = new Date(goldenCase.now);
      const articles = goldenCase.request.articles.map(toArticleInput);
      const executor: SystemAiExecutor =
        goldenCase.llmOutput === null
          ? new RefusingExecutor()
          : new FakeExecutor([goldenCase.llmOutput]);
      const service = new NewsAnalysisService(executor);

      const result = await service.analyse(articles, { now });
      const expected = { ...goldenCase.expect };
      const analysis = result.analysis;
      for (const key of KNOWN_EXPECTATION_MISMATCHES[goldenCase.id] ?? []) {
        delete expected[key];
      }

      if (expected['short_circuit']) {
        expect(
          result.warnings.some((w) => w.code === 'AI_INSUFFICIENT_DATA'),
        ).toBe(true);
      }
      if (expected['status_in']) {
        expect(expected['status_in']).toContain(result.status);
      }
      if (expected['sentiment_in']) {
        expect(expected['sentiment_in']).toContain(analysis?.sentiment ?? null);
      }
      if (expected['claim_status_in']) {
        expect(expected['claim_status_in']).toContain(analysis?.claimStatus);
      }
      if (typeof expected['min_positive_factors'] === 'number') {
        expect(analysis?.positiveFactors.length ?? 0).toBeGreaterThanOrEqual(
          expected['min_positive_factors'],
        );
      }
      if (typeof expected['min_negative_factors'] === 'number') {
        expect(analysis?.negativeFactors.length ?? 0).toBeGreaterThanOrEqual(
          expected['min_negative_factors'],
        );
      }
      if (expected['factor_keywords']) {
        const kw = expected['factor_keywords'] as {
          positive_factors?: string[];
          negative_factors?: string[];
        };
        if (kw.positive_factors && analysis) {
          const text = analysis.positiveFactors
            .map((f) => `${f.factor} ${f.reason}`)
            .join(' ');
          expect(kw.positive_factors.some((k) => text.includes(k))).toBe(true);
        }
        if (kw.negative_factors && analysis) {
          const text = analysis.negativeFactors
            .map((f) => `${f.factor} ${f.reason}`)
            .join(' ');
          expect(kw.negative_factors.some((k) => text.includes(k))).toBe(true);
        }
      }
      if (typeof expected['has_conflict'] === 'boolean') {
        expect((analysis?.conflicts.length ?? 0) > 0).toBe(
          expected['has_conflict'],
        );
      }
      if (expected['affected_symbols_subset_of']) {
        const allowed = expected['affected_symbols_subset_of'] as string[];
        const symbols = (analysis?.affected ?? [])
          .map((a) => a.symbol)
          .filter((s): s is string => s !== null);
        expect(symbols.every((s) => allowed.includes(s))).toBe(true);
      }
      if (typeof expected['independent_source_count'] === 'number') {
        expect(result.independentSourceCount).toBe(
          expected['independent_source_count'],
        );
      }
      if (expected['warning_codes_include']) {
        const codes = result.warnings.map((w) => w.code);
        for (const code of expected['warning_codes_include'] as string[]) {
          expect(codes).toContain(code);
        }
      }
      if (typeof expected['max_confidence'] === 'number') {
        expect(result.confidence ?? 0).toBeLessThanOrEqual(
          expected['max_confidence'],
        );
      }
      if (expected['news_tone_in']) {
        expect(expected['news_tone_in']).toContain(analysis?.newsTone ?? null);
      }
      if (expected['negative_basis_allowed'] && analysis) {
        const allowed = expected['negative_basis_allowed'] as string[];
        expect(
          analysis.negativeFactors.every((f) => allowed.includes(f.basis)),
        ).toBe(true);
      }
      if (expected['counterpoint_note_required'] && analysis) {
        expect(analysis.counterpointNote).not.toBeNull();
      }
      if (expected['headline_must_not_contain'] && analysis) {
        for (const bad of expected['headline_must_not_contain'] as string[]) {
          expect(analysis.headline).not.toContain(bad);
        }
      }
      if (expected['summary_keywords'] && analysis) {
        const text = analysis.summary.join(' ');
        expect(
          (expected['summary_keywords'] as string[]).some((k) =>
            text.includes(k),
          ),
        ).toBe(true);
      }

      // Every non-error result must round-trip through the legacy mapping without throwing,
      // and a fallback result must be clearly flagged as such.
      const legacy = toEnrichmentResult(result);
      expect(legacy.fromFallback).toBe(result.status === 'error');
    });
  }
});

describe('known real-model mismatch (documented, not asserted away silently)', () => {
  test('N-02: model lists source quality as a negative factor, contra the prompt rule', async () => {
    const n02 = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'N-02.json'), 'utf-8'),
    ) as GoldenCase;
    const service = new NewsAnalysisService(
      new FakeExecutor([n02.llmOutput as LlmNewsOutput]),
    );
    const result = await service.analyse(
      n02.request.articles.map(toArticleInput),
      { now: new Date(n02.now) },
    );
    // Guardrails let it through (this is a business-rule nuance, not a safety/grounding
    // violation), so the pipeline returns success even though the golden case's
    // `negative_basis_allowed`/`counterpoint_note_required` expectations are violated.
    expect(result.status).not.toBe('error');
    expect(
      result.analysis?.negativeFactors.some(
        (f) => f.basis === 'interpretation',
      ),
    ).toBe(true);
    expect(result.analysis?.counterpointNote).toBeNull();
  });
});

describe('legacy mapping smoke test', () => {
  test('maps a successful mixed_negative analysis onto NewsEnrichmentResult', () => {
    const n01 = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'N-01.json'), 'utf-8'),
    ) as GoldenCase;
    const legacy = toEnrichmentResult({
      requestId: 'req_test',
      feature: 'news_analysis',
      status: 'success',
      analysis: n01.llmOutput!.data,
      confidence: n01.llmOutput!.confidence,
      confidenceReason: n01.llmOutput!.confidenceReason,
      warnings: [],
      sources: [],
      dataAsOf: new Date(n01.now),
      eventId: 'evt_test',
      independentSourceCount: 1,
      modelVersion: 'fake+news_analysis.v0.1',
      schemaVersion: '1.0',
      issues: [],
      trace: {
        requestId: 'req_test',
        feature: 'news_analysis',
        status: 'success',
        latencyMs: 0,
        modelVersion: 'fake+news_analysis.v0.1',
        promptVersion: 'news_analysis.v0.1',
        attempts: 1,
        validationErrorCount: 0,
        guardrailErrorCount: 0,
        guardrailWarningCount: 0,
        independentSourceCount: 1,
        stale: false,
        conflict: false,
        confidence: n01.llmOutput!.confidence,
      },
    });
    expect(legacy.fromFallback).toBe(false);
    expect(legacy.sentiment).toBe('BEARISH'); // mixed_negative -> BEARISH
    expect(legacy.aiTrend).toBe('DOWN'); // shortTerm.direction === 'negative'
    expect(legacy.aiImpactProbability).toBe(76); // 0-100 scale, matching the legacy column
    expect(legacy.stockImpactAnalysis.length).toBeGreaterThan(0);
    expect(legacy.sector).toBe('Semiconductor');
  });
});

describe('retry and give-up paths (ported from PipelineTests)', () => {
  const n01 = JSON.parse(
    fs.readFileSync(path.join(GOLDEN_DIR, 'N-01.json'), 'utf-8'),
  ) as GoldenCase;
  const good = n01.llmOutput as LlmNewsOutput;
  const articles = n01.request.articles.map(toArticleInput);
  const now = new Date(n01.now);

  function withBlockedWording(): LlmNewsOutput {
    return {
      ...good,
      data: {
        ...good.data,
        summary: [
          good.data.summary[0],
          good.data.summary[1],
          'กำไรแน่นอน ซื้อเลย',
        ],
      },
    };
  }

  function withEmptySummary(): LlmNewsOutput {
    return { ...good, data: { ...good.data, summary: [] } };
  }

  test('succeeds on first try with no feedback', async () => {
    const executor = new FakeExecutor([good]);
    const service = new NewsAnalysisService(executor);
    const result = await service.analyse(articles, { now });
    expect(result.status).toBe('success');
    expect(executor.calls).toHaveLength(1);
  });

  test('retries once with guardrail feedback then succeeds', async () => {
    const executor = new FakeExecutor([withBlockedWording(), good]);
    const service = new NewsAnalysisService(executor);
    const result = await service.analyse(articles, { now });
    expect(result.status).toBe('success');
    expect(executor.calls).toHaveLength(2);
    expect(executor.calls[1]?.prompt).toEqual(
      expect.stringContaining('AI-SAFE-001'),
    );
  });

  test('gives up after repeated validation failure and returns AI_OUTPUT_INVALID', async () => {
    const executor = new FakeExecutor([withEmptySummary(), withEmptySummary()]);
    const service = new NewsAnalysisService(executor);
    const result = await service.analyse(articles, { now });
    expect(result.status).toBe('error');
    expect(result.analysis).toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain('AI_OUTPUT_INVALID');
    expect(executor.calls).toHaveLength(2);
  });

  test('maps a timeout to AI_MODEL_TIMEOUT and never throws', async () => {
    const timeoutError = new Error('request timed out');
    timeoutError.name = 'TimeoutError';
    const executor = new FakeExecutor([timeoutError]);
    const service = new NewsAnalysisService(executor);
    const result = await service.analyse(articles, { now });
    expect(result.status).toBe('error');
    expect(result.warnings.map((w) => w.code)).toContain('AI_MODEL_TIMEOUT');
  });

  test('short-circuits N-04 without ever calling the executor', async () => {
    const n04 = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'N-04.json'), 'utf-8'),
    ) as GoldenCase;
    const service = new NewsAnalysisService(new RefusingExecutor());
    const result = await service.analyse(
      n04.request.articles.map(toArticleInput),
      { now: new Date(n04.now) },
    );
    expect(result.status).toBe('insufficient_data');
    expect(result.analysis).not.toBeNull();
  });

  test('AI_INPUT_INVALID short-circuits before any executor call', async () => {
    const service = new NewsAnalysisService(new RefusingExecutor());
    const result = await service.analyse([], { now });
    expect(result.status).toBe('error');
    expect(result.warnings.map((w) => w.code)).toContain('AI_INPUT_INVALID');
  });
});

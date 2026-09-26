/**
 * Orchestrates: pre-check -> short-circuit? -> LLM -> validate -> guardrails ->
 * retry once with feedback -> envelope | AI_OUTPUT_INVALID fallback.
 *
 * Ported from `ai_core/pipeline.py`, adapted to a NestJS-injectable service that
 * calls the host backend's `AiManagerService.executeSystemAiRequest` (structurally,
 * via the `SystemAiExecutor` interface / `SYSTEM_AI_EXECUTOR` token) instead of a
 * bespoke `call_llm` callback.
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import * as precheck from './precheck';
import { systemPrompt, userMessage, PROMPT_VERSION } from './prompt';
import { validateLlmOutput } from './validate';
import { checkAnalysis, blocking, type GuardrailContext } from './guardrails';
import {
  FEATURE,
  NEWS_ANALYSIS_LOGGER,
  NOOP_LOGGER,
  SCHEMA_VERSION,
  SYSTEM_AI_EXECUTOR,
  type AffectedItem,
  type AiTrend,
  type AnalysisLogger,
  type AnalysisSentiment,
  type AnalysisTrace,
  type Factor,
  type GuardrailIssue,
  type ImpactDirection,
  type ImpactHorizon,
  type LlmNewsOutput,
  type NewsAnalysis,
  type NewsArticleInput,
  type NewsAnalysisResult,
  type NewsEnrichmentResult,
  type NewsSentiment,
  type NewsSource,
  type SourceConflict,
  type SystemAiExecutor,
  type WarningCode,
} from './types';

const MAX_ATTEMPTS = 2; // first try + one retry with validation feedback

export interface AnalyseOptions {
  /** Injected "current time" for stale detection. Defaults to `new Date()`. */
  readonly now?: Date;
  /** Forwarded to the executor as `modelId`; falls back to the executor's own default. */
  readonly modelId?: string;
  /** Caller-supplied request id (spec 4 `request_id`); a UUID v4 is generated when omitted. */
  readonly requestId?: string;
}

/** Bag of everything needed to finish a `NewsAnalysisResult` and its trace, regardless of exit path. */
interface ExitContext {
  readonly requestId: string;
  readonly startedAt: number;
  readonly sources: readonly NewsSource[];
  readonly independentSourceCount: number;
  readonly stale: boolean;
  readonly attempts: number;
  readonly validationErrorCount: number;
}

@Injectable()
export class NewsAnalysisService {
  constructor(
    @Inject(SYSTEM_AI_EXECUTOR)
    private readonly executor: SystemAiExecutor,
    @Optional()
    @Inject(NEWS_ANALYSIS_LOGGER)
    private readonly logger: AnalysisLogger = NOOP_LOGGER,
  ) {}

  async analyse(
    articles: readonly NewsArticleInput[],
    opts?: AnalyseOptions,
  ): Promise<NewsAnalysisResult> {
    const startedAt = Date.now();
    const requestId = opts?.requestId ?? randomUUID();
    const now = opts?.now ?? new Date();
    const pre = precheck.run(articles, now);

    if (!pre.ok) {
      return this.finish(
        {
          status: 'error',
          analysis: null,
          confidence: null,
          confidenceReason: null,
          warnings: [
            { code: 'AI_INPUT_INVALID', message: pre.inputErrors.join('; ') },
          ],
          dataAsOf: null,
          eventId: null,
          independentSourceCount: 0,
          modelVersion: 'deterministic',
          schemaVersion: SCHEMA_VERSION,
          issues: [],
        },
        {
          requestId,
          startedAt,
          sources: [],
          independentSourceCount: 0,
          stale: false,
          attempts: 0,
          validationErrorCount: 0,
        },
      );
    }

    const sources = toNewsSources(pre.sources);
    const baseCtx = {
      requestId,
      startedAt,
      sources,
      independentSourceCount: pre.independentSourceCount,
      stale: pre.stale,
    };

    if (pre.shortCircuit) {
      return this.finish(
        this.toResult(pre.shortCircuit, pre, 'deterministic', []),
        {
          ...baseCtx,
          attempts: 0,
          validationErrorCount: 0,
        },
      );
    }

    const system = systemPrompt();
    const baseUser = userMessage(pre);
    const context: GuardrailContext = {
      sourceText: pre.sourceText,
      knownSourceIds: new Set(pre.knownSourceIds),
      stale: pre.stale,
    };

    let feedback: readonly string[] = [];
    let issues: readonly GuardrailIssue[] = [];
    let lastModel = opts?.modelId ?? 'unknown';
    let validationErrorCount = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const user =
        feedback.length === 0
          ? baseUser
          : `${baseUser}\n\nYour previous attempt failed validation. Fix every issue below and answer again as a single JSON object:\n${feedback.map((f) => `- ${f}`).join('\n')}`;

      let response: { data: unknown; model: string };
      try {
        response = await this.executor.executeSystemAiRequest<unknown>({
          ...(opts?.modelId !== undefined ? { modelId: opts.modelId } : {}),
          prompt: user,
          systemPrompt: system,
          temperature: 0.2,
        });
      } catch (err) {
        const code = classifyExecutorError(err);
        return this.finish(
          {
            status: 'error',
            analysis: null,
            confidence: null,
            confidenceReason: null,
            warnings: [{ code, message: errorMessage(err) }],
            dataAsOf: pre.dataAsOf,
            eventId: pre.eventId,
            independentSourceCount: pre.independentSourceCount,
            modelVersion: `${lastModel}+${PROMPT_VERSION}`,
            schemaVersion: SCHEMA_VERSION,
            issues: [],
          },
          { ...baseCtx, attempts: attempt + 1, validationErrorCount },
        );
      }

      lastModel = response.model;
      const validated = validateLlmOutput(response.data);
      if (!validated.ok) {
        feedback = validated.errors;
        validationErrorCount = validated.errors.length;
        issues = validated.errors.map((message) => ({
          level: 'error' as const,
          rule: 'SCHEMA',
          message,
        }));
        continue;
      }

      validationErrorCount = 0;
      issues = checkAnalysis(validated.value, context);
      const blockingIssues = blocking(issues);
      if (blockingIssues.length === 0) {
        return this.finish(
          this.toResult(
            validated.value,
            pre,
            `${lastModel}+${PROMPT_VERSION}`,
            issues,
          ),
          {
            ...baseCtx,
            attempts: attempt + 1,
            validationErrorCount: 0,
          },
        );
      }
      feedback = blockingIssues.map((i) => `[${i.rule}] ${i.message}`);
    }

    // Never shown malformed or unsafe output: give up after MAX_ATTEMPTS.
    return this.finish(
      {
        status: 'error',
        analysis: null,
        confidence: null,
        confidenceReason: null,
        warnings: [
          {
            code: 'AI_OUTPUT_INVALID',
            message: 'analysis failed validation after retry',
          },
        ],
        dataAsOf: pre.dataAsOf,
        eventId: pre.eventId,
        independentSourceCount: pre.independentSourceCount,
        modelVersion: `${lastModel}+${PROMPT_VERSION}`,
        schemaVersion: SCHEMA_VERSION,
        issues,
      },
      { ...baseCtx, attempts: MAX_ATTEMPTS, validationErrorCount },
    );
  }

  private toResult(
    output: LlmNewsOutput,
    pre: precheck.PrecheckResult,
    modelVersion: string,
    issues: readonly GuardrailIssue[],
  ): Omit<NewsAnalysisResult, 'requestId' | 'feature' | 'sources' | 'trace'> {
    // Merge precheck warnings (AI_SOURCE_STALE, AI_INSUFFICIENT_DATA) with the
    // model's own warnings (AI_SOURCE_CONFLICT), precheck's taking precedence on
    // code collision, mirroring `pipeline.build_envelope`'s dict-based merge.
    const byCode = new Map<
      WarningCode,
      { code: WarningCode; message: string }
    >();
    for (const w of pre.warnings) byCode.set(w.code, w);
    for (const w of output.warnings)
      if (!byCode.has(w.code)) byCode.set(w.code, w);

    return {
      status: output.status,
      analysis: output.data,
      confidence: output.confidence,
      confidenceReason: output.confidenceReason,
      warnings: Array.from(byCode.values()),
      dataAsOf: pre.dataAsOf,
      eventId: pre.eventId,
      independentSourceCount: pre.independentSourceCount,
      modelVersion,
      schemaVersion: SCHEMA_VERSION,
      issues,
    };
  }

  /**
   * Completes every exit path into a full envelope: attaches `requestId`, `feature`,
   * `sources` and a `trace` record, logs that same record once (spec 14.2), and returns
   * the result. This is the single place every `return` in `analyse()` funnels through,
   * so no exit path can produce an incomplete envelope or skip the log line.
   */
  private finish(
    partial: Omit<
      NewsAnalysisResult,
      'requestId' | 'feature' | 'sources' | 'trace'
    >,
    ctx: ExitContext,
  ): NewsAnalysisResult {
    const conflict = partial.warnings.some(
      (w) => w.code === 'AI_SOURCE_CONFLICT',
    );
    const guardrailErrorCount = partial.issues.filter(
      (i) => i.level === 'error',
    ).length;
    const guardrailWarningCount = partial.issues.filter(
      (i) => i.level === 'warning',
    ).length;

    const trace: AnalysisTrace = {
      requestId: ctx.requestId,
      feature: FEATURE,
      status: partial.status,
      latencyMs: Date.now() - ctx.startedAt,
      modelVersion: partial.modelVersion,
      promptVersion: ctx.attempts > 0 ? PROMPT_VERSION : null,
      attempts: ctx.attempts,
      validationErrorCount: ctx.validationErrorCount,
      guardrailErrorCount,
      guardrailWarningCount,
      independentSourceCount: ctx.independentSourceCount,
      stale: ctx.stale,
      conflict,
      confidence: partial.confidence,
    };

    this.logger.log(trace, 'NewsAnalysisService');

    return {
      ...partial,
      requestId: ctx.requestId,
      feature: FEATURE,
      sources: ctx.sources,
      trace,
    };
  }
}

function toNewsSources(
  sources: readonly precheck.PrecheckSource[],
): readonly NewsSource[] {
  return sources.map((s) => ({
    sourceId: s.sourceId,
    name: s.name,
    publishedAt: s.publishedAt,
    url: s.url,
    syndicatedCopyIds: s.syndicatedCopyIds,
  }));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Best-effort classification: we cannot import the backend's `AiFailureKind`
 *  taxonomy (that would create a hard dependency this module must not have),
 *  so we recognise the conventional signals a timeout surfaces with. */
function classifyExecutorError(err: unknown): WarningCode {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || /timeout|timed out/i.test(err.message)) {
      return 'AI_MODEL_TIMEOUT';
    }
  }
  return 'AI_OUTPUT_INVALID';
}

// ---------------------------------------------------------------------------
// Spec 12.1 literal envelope: NewsAnalysisResult -> snake_case wire shape
// ---------------------------------------------------------------------------

/** `common.defs.schema.json#/$defs/source`. */
export interface SpecSource {
  readonly source_id: string;
  readonly name: string;
  readonly published_at: string;
  readonly url: string | null;
  readonly syndicated_copy_ids: readonly string[];
}

/** `common.defs.schema.json#/$defs/error` / `#/$defs/warning`. */
export interface SpecCodeMessage {
  readonly code: WarningCode;
  readonly message: string;
}

/** `news_analysis.schema.json`. */
export interface SpecNewsAnalysis {
  readonly headline: string;
  readonly summary: readonly string[];
  readonly positive_factors: readonly SpecFactor[];
  readonly negative_factors: readonly SpecFactor[];
  readonly counterpoint_note: string | null;
  readonly news_tone: NewsAnalysis['newsTone'];
  readonly sentiment: NewsAnalysis['sentiment'];
  readonly sentiment_reason: string | null;
  readonly impact: {
    readonly short_term: SpecHorizon | null;
    readonly medium_term: SpecHorizon | null;
    readonly long_term: SpecHorizon | null;
  };
  readonly affected: readonly SpecAffectedItem[];
  readonly claim_status: NewsAnalysis['claimStatus'];
  readonly conflicts: readonly SpecConflict[];
  readonly missing_context: readonly string[];
}

interface SpecFactor {
  readonly factor: string;
  readonly reason: string;
  readonly basis: Factor['basis'];
  readonly evidence_refs: readonly string[];
}

interface SpecHorizon {
  readonly direction: ImpactHorizon['direction'];
  readonly strength: ImpactHorizon['strength'];
  readonly rationale: string;
  readonly uncertainty: ImpactHorizon['uncertainty'];
}

interface SpecAffectedItem {
  readonly name: string;
  readonly symbol: string | null;
  readonly kind: AffectedItem['kind'];
  readonly relation: AffectedItem['relation'];
  readonly mechanism: string;
  readonly confidence: number;
}

interface SpecConflict {
  readonly claim: string;
  readonly values: ReadonlyArray<{ value: string; source_id: string }>;
  readonly note: string;
}

/** `envelope.schema.json` (spec 12.1) — the literal snake_case shape for teams that want it as-is. */
export interface SpecEnvelope {
  readonly request_id: string;
  readonly feature: typeof FEATURE;
  readonly status: NewsAnalysisResult['status'];
  readonly data: SpecNewsAnalysis | null;
  readonly error: SpecCodeMessage | null;
  readonly confidence: number | null;
  readonly confidence_reason: string | null;
  readonly warnings: readonly SpecCodeMessage[];
  readonly sources: readonly SpecSource[];
  readonly data_as_of: string | null;
  readonly model_version: string;
  readonly schema_version: string;
}

/**
 * Projects the camelCase `NewsAnalysisResult` onto the exact snake_case envelope from
 * spec 12.1 / `schemas/envelope.schema.json`. See `INTEGRATION.md` for the full
 * camelCase <-> snake_case field mapping. This is the only place in the module that
 * produces snake_case; everything else stays TypeScript-conventional camelCase.
 */
export function toSpecEnvelope(result: NewsAnalysisResult): SpecEnvelope {
  const isError = result.status === 'error';
  const firstWarning = result.warnings[0];

  return {
    request_id: result.requestId,
    feature: result.feature,
    status: result.status,
    data:
      isError || result.analysis === null
        ? null
        : toSpecAnalysis(result.analysis),
    error: isError
      ? {
          code: firstWarning?.code ?? 'AI_OUTPUT_INVALID',
          message: firstWarning?.message ?? 'unknown error',
        }
      : null,
    confidence: isError ? null : result.confidence,
    confidence_reason: isError ? null : (result.confidenceReason ?? ''),
    warnings: result.warnings.map((w) => ({
      code: w.code,
      message: w.message,
    })),
    sources: result.sources.map(toSpecSource),
    data_as_of: result.dataAsOf ? result.dataAsOf.toISOString() : null,
    model_version: result.modelVersion,
    schema_version: result.schemaVersion,
  };
}

function toSpecSource(source: NewsSource): SpecSource {
  return {
    source_id: source.sourceId,
    name: source.name,
    published_at: source.publishedAt.toISOString(),
    url: source.url,
    syndicated_copy_ids: source.syndicatedCopyIds,
  };
}

function toSpecAnalysis(analysis: NewsAnalysis): SpecNewsAnalysis {
  return {
    headline: analysis.headline,
    summary: analysis.summary,
    positive_factors: analysis.positiveFactors.map(toSpecFactor),
    negative_factors: analysis.negativeFactors.map(toSpecFactor),
    counterpoint_note: analysis.counterpointNote,
    news_tone: analysis.newsTone,
    sentiment: analysis.sentiment,
    sentiment_reason: analysis.sentimentReason,
    impact: {
      short_term: analysis.impact.shortTerm
        ? toSpecHorizon(analysis.impact.shortTerm)
        : null,
      medium_term: analysis.impact.mediumTerm
        ? toSpecHorizon(analysis.impact.mediumTerm)
        : null,
      long_term: analysis.impact.longTerm
        ? toSpecHorizon(analysis.impact.longTerm)
        : null,
    },
    affected: analysis.affected.map(toSpecAffectedItem),
    claim_status: analysis.claimStatus,
    conflicts: analysis.conflicts.map(toSpecConflict),
    missing_context: analysis.missingContext,
  };
}

function toSpecFactor(factor: Factor): SpecFactor {
  return {
    factor: factor.factor,
    reason: factor.reason,
    basis: factor.basis,
    evidence_refs: factor.evidenceRefs,
  };
}

function toSpecHorizon(horizon: ImpactHorizon): SpecHorizon {
  return {
    direction: horizon.direction,
    strength: horizon.strength,
    rationale: horizon.rationale,
    uncertainty: horizon.uncertainty,
  };
}

function toSpecAffectedItem(item: AffectedItem): SpecAffectedItem {
  return {
    name: item.name,
    symbol: item.symbol,
    kind: item.kind,
    relation: item.relation,
    mechanism: item.mechanism,
    confidence: item.confidence,
  };
}

function toSpecConflict(conflict: SourceConflict): SpecConflict {
  return {
    claim: conflict.claim,
    values: conflict.values.map((v) => ({
      value: v.value,
      source_id: v.sourceId,
    })),
    note: conflict.note,
  };
}

// ---------------------------------------------------------------------------
// Legacy mapping: NewsAnalysisResult -> NewsEnrichmentResult
// ---------------------------------------------------------------------------

/**
 * Maps our richer, two-sided analysis onto the EXISTING backend contract so
 * current callers (`news-enrichment.service.ts`) and the `news`/`market_news`
 * prisma columns keep working with zero backend changes.
 *
 * This is a lossy, one-way projection. Every decision is documented inline;
 * see INTEGRATION.md for the worked before/after example.
 */
export function toEnrichmentResult(
  result: NewsAnalysisResult,
): NewsEnrichmentResult {
  const fromFallback = result.status === 'error' || result.analysis === null;

  if (fromFallback || result.analysis === null) {
    // No usable analysis (input invalid / short-circuited to a still-null case /
    // gave up after retry). The legacy contract has no "no data" representation,
    // so we return an explicitly neutral, zero-confidence stand-in and flag it
    // via `fromFallback: true`, which is the one signal the legacy shape gives
    // callers to distinguish "an AI ran" from "nothing to show".
    return {
      aiSummary:
        result.warnings[0]?.message ?? 'ไม่สามารถวิเคราะห์ข่าวนี้ได้ในขณะนี้',
      aiTrend: 'SIDEWAY',
      aiImpactProbability: 0,
      stockImpactAnalysis:
        'ไม่มีการวิเคราะห์ผลกระทบ เนื่องจากข้อมูลไม่เพียงพอหรือการวิเคราะห์ไม่ผ่านการตรวจสอบ',
      sector: 'Unknown',
      importance: 'LOW',
      sentiment: 'NEUTRAL',
      fromFallback: true,
    };
  }

  const analysis = result.analysis;

  // sentiment: our 8-value AnalysisSentiment collapses to the legacy 3-value
  // NewsSentiment. Information lost: the strength distinction between
  // "positive" and "strong_positive" (and negative/mixed_* equivalents) is
  // gone; a caller reading only `sentiment` cannot tell "mixed_positive" from
  // "strong_positive" any more, only that both are now BULLISH. `sentiment`
  // is null only for `insufficient_data`; we map that to NEUTRAL since the
  // legacy enum is not nullable.
  const sentiment = mapSentiment(analysis.sentiment);

  // aiTrend: the legacy schema has one directional trend, we have three
  // independent time horizons. We prefer shortTerm (closest to what a trend
  // badge implies), falling back to mediumTerm then longTerm, and finally to
  // sentiment when no horizon has a basis to say anything (all null). This
  // necessarily discards the multi-horizon view and the `strength`/
  // `uncertainty` qualifiers on whichever horizon we pick.
  const chosenHorizon =
    analysis.impact.shortTerm ??
    analysis.impact.mediumTerm ??
    analysis.impact.longTerm ??
    null;
  const aiTrend = mapTrend(
    chosenHorizon?.direction ?? null,
    analysis.sentiment,
  );

  // aiImpactProbability: semantic mismatch, not just a lossy mapping. Our
  // `confidence` is "how sound/sufficient is THIS analysis" (0-1), explicitly
  // NOT a probability of price movement (see prompt.ts). The legacy field
  // name implies the latter. We pass `confidence` through as the closest
  // available number because the legacy UI only has room for one 0-1 value,
  // but callers should not read it as a price-move probability — that
  // interpretation was never true, even for the analyses this module
  // replaces (nothing computed a real price-move probability before either).
  // The legacy column is populated on a 0-100 scale by the backend's own pipeline
  // (see ai.service.ts), so scale to match or the UI renders 0.76 as 0.76%.
  // The semantic caveat above still stands: this is analysis quality, not a price probability.
  const aiImpactProbability = Math.round((result.confidence ?? 0) * 100);

  // sector: legacy schema wants a single sector string; we track affected
  // items with kind 'asset' | 'sector' | 'theme' | 'asset_class' across
  // multiple relations. We take the first `sector`-kind affected item's name,
  // then fall back to the first `direct` item's name, then 'Unknown'.
  // Multiple affected sectors (see `analysis.affected`) are not representable
  // in the legacy single-string field.
  const sectorItem =
    analysis.affected.find((a) => a.kind === 'sector') ??
    analysis.affected.find((a) => a.relation === 'direct');
  const sector = sectorItem?.name ?? 'Unknown';

  // importance: the legacy schema has no equivalent concept at all in
  // `NewsAnalysis`. We approximate it from independent source count and the
  // strength/uncertainty of the chosen horizon, since those are the closest
  // available signals of how significant/well-corroborated the event is.
  // This is a genuinely new heuristic, not a port of anything from the
  // Python reference (which never produced `importance` either).
  const importance = deriveImportance(
    result.independentSourceCount,
    chosenHorizon,
  );

  // aiSummary: legacy wants one string; we produce up to 3 Thai lines
  // (what happened / why it matters / what to watch). We join them so no
  // sentence is dropped, at the cost of losing the line-by-line structure.
  const aiSummary = analysis.summary.join(' ');

  // stockImpactAnalysis: a readable two-sided digest built from the top
  // factor per side and the chosen horizon's rationale. This is the field
  // that most directly benefits from the module's neutral, two-sided
  // analysis, so we surface both sides plus the counterpoint note when the
  // model recorded one, rather than compressing to a single verdict.
  const stockImpactAnalysis = buildStockImpactAnalysis(analysis, chosenHorizon);

  // aiTranslatedSummary: the module only produces Thai output (per the
  // system prompt's language rules), so we never populate this optional
  // English/Thai pair. Existing callers that read it will see it absent,
  // same as today when a provider doesn't return translations.
  return {
    aiSummary,
    aiTrend,
    aiImpactProbability,
    stockImpactAnalysis,
    sector,
    importance,
    sentiment,
    fromFallback: false,
  };
}

function mapSentiment(sentiment: AnalysisSentiment | null): NewsSentiment {
  switch (sentiment) {
    case 'strong_positive':
    case 'positive':
    case 'mixed_positive':
      return 'BULLISH';
    case 'strong_negative':
    case 'negative':
    case 'mixed_negative':
      return 'BEARISH';
    case 'mixed':
    case 'neutral':
    case null:
      return 'NEUTRAL';
    default: {
      const _exhaustive: never = sentiment;
      return _exhaustive;
    }
  }
}

function mapTrend(
  direction: ImpactDirection | null,
  sentiment: AnalysisSentiment | null,
): AiTrend {
  switch (direction) {
    case 'positive':
    case 'mixed_positive':
      return 'UP';
    case 'negative':
    case 'mixed_negative':
      return 'DOWN';
    case 'mixed':
    case 'neutral':
    case 'uncertain':
    case null:
      // No horizon had a basis to say anything: fall back to the overall
      // sentiment rather than defaulting blindly to SIDEWAY.
      return mapSentimentToTrendFallback(sentiment);
    default: {
      const _exhaustive: never = direction;
      return _exhaustive;
    }
  }
}

function mapSentimentToTrendFallback(
  sentiment: AnalysisSentiment | null,
): AiTrend {
  switch (sentiment) {
    case 'strong_positive':
    case 'positive':
    case 'mixed_positive':
      return 'UP';
    case 'strong_negative':
    case 'negative':
    case 'mixed_negative':
      return 'DOWN';
    default:
      return 'SIDEWAY';
  }
}

function deriveImportance(
  independentSourceCount: number,
  horizon: ImpactHorizon | null,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const strong = horizon?.strength === 'high';
  const corroborated = independentSourceCount >= 2;
  if (strong && corroborated) return 'HIGH';
  if (strong || corroborated || horizon?.strength === 'medium') return 'MEDIUM';
  return 'LOW';
}

function buildStockImpactAnalysis(
  analysis: NewsAnalysis,
  horizon: ImpactHorizon | null,
): string {
  const topPositive = analysis.positiveFactors[0]?.reason;
  const topNegative = analysis.negativeFactors[0]?.reason;
  const parts: string[] = [];
  if (topPositive) parts.push(`ปัจจัยบวก: ${topPositive}`);
  if (topNegative) parts.push(`ปัจจัยลบ: ${topNegative}`);
  if (analysis.counterpointNote) parts.push(analysis.counterpointNote);
  if (horizon) parts.push(horizon.rationale);
  if (parts.length === 0) return analysis.sentimentReason ?? '';
  return parts.join(' ');
}

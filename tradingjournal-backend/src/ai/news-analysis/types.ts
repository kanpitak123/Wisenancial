/**
 * Contract for Wisenancial news analysis.
 *
 * Two rules drive every decision here:
 *  1. The existing backend contract (`NewsEnrichmentResult` in `src/ai/ai-news.types.ts`)
 *     must keep working unchanged — `toEnrichmentResult()` maps our richer analysis
 *     back onto it, so the current news cards and prisma columns keep functioning
 *     with no backend edits.
 *  2. Everything new is additive and optional. If the backend never stores it,
 *     the analysis is still returned to the caller.
 */

// ---------------------------------------------------------------------------
// Existing backend contract (copied verbatim from tradingjournal-backend/src/ai/ai-news.types.ts).
// Keep in sync; do not "improve" these names.
// ---------------------------------------------------------------------------

export type AiTrend = 'UP' | 'DOWN' | 'SIDEWAY';
export type NewsImportance = 'HIGH' | 'MEDIUM' | 'LOW';
export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface NewsEnrichmentInput {
  headline: string;
  summary: string;
  content?: string;
  language?: 'en' | 'th';
}

export interface NewsEnrichmentResult {
  aiSummary: string;
  aiTrend: AiTrend;
  aiImpactProbability: number;
  stockImpactAnalysis: string;
  sector: string;
  importance: NewsImportance;
  sentiment: NewsSentiment;
  aiTranslatedSummary?: { en: string; th: string };
  fromFallback: boolean;
}

// ---------------------------------------------------------------------------
// New analysis contract (Phase 1 News Intelligence spec).
// ---------------------------------------------------------------------------

/** Market implication, decided AFTER factor analysis (AI-NEWS-004). */
export type AnalysisSentiment =
  | 'strong_positive'
  | 'positive'
  | 'mixed_positive'
  | 'mixed'
  | 'neutral'
  | 'mixed_negative'
  | 'negative'
  | 'strong_negative';

/** How the article itself is written — kept separate from market implication. */
export type NewsTone =
  'positive' | 'negative' | 'mixed' | 'neutral' | 'promotional' | 'sensational';

/** fact = stated in source; interpretation = direct reasoning from stated facts;
 *  scenario = plausible but not stated (must use conditional wording). */
export type FactorBasis = 'fact' | 'interpretation' | 'scenario';

export type ClaimStatus = 'confirmed' | 'unconfirmed' | 'rumor';

export type ImpactDirection =
  | 'positive'
  | 'mixed_positive'
  | 'mixed'
  | 'neutral'
  | 'mixed_negative'
  | 'negative'
  | 'uncertain';

export type Strength = 'low' | 'medium' | 'high';
export type Uncertainty = 'low' | 'medium' | 'high';
export type AnalysisStatus = 'success' | 'partial' | 'insufficient_data';

export interface Factor {
  readonly factor: string;
  readonly reason: string;
  readonly basis: FactorBasis;
  /** `src:<source_id>` of the article(s) supporting this factor. */
  readonly evidenceRefs: readonly string[];
}

export interface ImpactHorizon {
  readonly direction: ImpactDirection;
  readonly strength: Strength | null;
  readonly rationale: string;
  readonly uncertainty: Uncertainty;
}

export interface AffectedItem {
  readonly name: string;
  readonly symbol: string | null;
  readonly kind: 'asset' | 'sector' | 'theme' | 'asset_class';
  readonly relation: 'direct' | 'related' | 'second_order';
  readonly mechanism: string;
  readonly confidence: number;
}

export interface SourceConflict {
  readonly claim: string;
  readonly values: ReadonlyArray<{ value: string; sourceId: string }>;
  readonly note: string;
}

export interface NewsAnalysis {
  readonly headline: string;
  /** [0] what happened, [1] why it matters, [2] what to watch. Max 3. */
  readonly summary: readonly string[];
  readonly positiveFactors: readonly Factor[];
  readonly negativeFactors: readonly Factor[];
  /** Required when a side has no fact/interpretation factor (AI-GEN-002). */
  readonly counterpointNote: string | null;
  readonly newsTone: NewsTone | null;
  /** null only when status is insufficient_data. */
  readonly sentiment: AnalysisSentiment | null;
  readonly sentimentReason: string | null;
  readonly impact: {
    readonly shortTerm: ImpactHorizon | null;
    readonly mediumTerm: ImpactHorizon | null;
    readonly longTerm: ImpactHorizon | null;
  };
  readonly affected: readonly AffectedItem[];
  readonly claimStatus: ClaimStatus;
  readonly conflicts: readonly SourceConflict[];
  readonly missingContext: readonly string[];
}

/** What the model returns; the service wraps it into NewsAnalysisResult. */
export interface LlmNewsOutput {
  readonly status: AnalysisStatus;
  readonly data: NewsAnalysis;
  /** Quality/sufficiency of the analysis, 0-1. NOT a probability of price movement. */
  readonly confidence: number;
  readonly confidenceReason: string;
  readonly warnings: ReadonlyArray<{ code: WarningCode; message: string }>;
}

export type WarningCode =
  | 'AI_INPUT_INVALID'
  | 'AI_INSUFFICIENT_DATA'
  | 'AI_SOURCE_CONFLICT'
  | 'AI_SOURCE_STALE'
  | 'AI_MODEL_TIMEOUT'
  | 'AI_OUTPUT_INVALID';

/** One article as handed to the analyser. */
export interface NewsArticleInput {
  readonly sourceId: string;
  readonly headline: string;
  readonly content: string;
  readonly source: string;
  readonly publishedAt: Date;
  readonly relatedSymbols?: readonly string[];
  readonly market?: string;
  readonly sector?: readonly string[];
  readonly url?: string | null;
}

/** Feature name for this module, per spec 12.1 (`feature` field of the response envelope). */
export const FEATURE = 'news_analysis' as const;

/** One source article as reported back to the caller (spec 4 `source_ids`, spec 12.1 `sources[]`). */
export interface NewsSource {
  readonly sourceId: string;
  readonly name: string;
  readonly publishedAt: Date;
  readonly url: string | null;
  /** Other source_ids carrying the same text; not counted as independent evidence (AI-NEWS-007). */
  readonly syndicatedCopyIds: readonly string[];
}

/**
 * One structured record per `analyse()` call (spec 14.2 Production Monitoring, NFR-05).
 * No article text and no secrets — only counts, ids, and enums, so it's safe to log
 * or persist as-is.
 */
export interface AnalysisTrace {
  readonly requestId: string;
  readonly feature: typeof FEATURE;
  readonly status: AnalysisStatus | 'error';
  readonly latencyMs: number;
  readonly modelVersion: string;
  /** null when no model call was made (input-invalid / short-circuit). */
  readonly promptVersion: string | null;
  /** Number of LLM calls made: 0 (short-circuit/input-invalid), 1, or 2 (one retry). */
  readonly attempts: number;
  /** Schema-validation errors on the last attempt (0 unless the model's JSON failed validation). */
  readonly validationErrorCount: number;
  readonly guardrailErrorCount: number;
  readonly guardrailWarningCount: number;
  readonly independentSourceCount: number;
  readonly stale: boolean;
  readonly conflict: boolean;
  readonly confidence: number | null;
}

/**
 * Structurally compatible with NestJS's `Logger` (and with `console`), but the module
 * never assumes either — any object shaped like this works. Inject one via
 * `NewsAnalysisModule.forRoot({ logger })` / `forRootAsync({ logger / loggerFactory })`.
 */
export interface AnalysisLogger {
  log(message: unknown, context?: string): void;
  warn(message: unknown, context?: string): void;
  error(message: unknown, context?: string): void;
}

export const NEWS_ANALYSIS_LOGGER = Symbol('NEWS_ANALYSIS_LOGGER');

/** Default: stays completely silent unless the host app injects its own logger. */
export const NOOP_LOGGER: AnalysisLogger = {
  log(): void {
    /* no-op */
  },
  warn(): void {
    /* no-op */
  },
  error(): void {
    /* no-op */
  },
};

/** Full result: rich analysis plus the legacy-shaped fields. */
export interface NewsAnalysisResult {
  /** Caller-supplied or generated (UUID v4) request identifier (spec 4, spec 12.1). */
  readonly requestId: string;
  readonly feature: typeof FEATURE;
  readonly status: AnalysisStatus | 'error';
  readonly analysis: NewsAnalysis | null;
  readonly confidence: number | null;
  readonly confidenceReason: string | null;
  readonly warnings: ReadonlyArray<{ code: WarningCode; message: string }>;
  /** Sources considered, including syndicated copies folded into each canonical entry. */
  readonly sources: readonly NewsSource[];
  readonly dataAsOf: Date | null;
  readonly eventId: string | null;
  readonly independentSourceCount: number;
  readonly modelVersion: string;
  readonly schemaVersion: string;
  /** Validation issues from the accepted attempt; warnings only (errors trigger retry). */
  readonly issues: readonly GuardrailIssue[];
  /** Same information as the log record emitted for this call; safe to persist directly. */
  readonly trace: AnalysisTrace;
}

export interface GuardrailIssue {
  readonly level: 'error' | 'warning';
  /** Spec id, e.g. AI-SAFE-002. */
  readonly rule: string;
  readonly message: string;
}

/** Minimal slice of the backend's AiManagerService that this module depends on.
 *  The real service satisfies this structurally — no import from the backend needed. */
export interface SystemAiExecutor {
  executeSystemAiRequest<T>(request: {
    modelId?: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<{ data: T; model: string; usage: unknown }>;
}

export const SYSTEM_AI_EXECUTOR = Symbol('SYSTEM_AI_EXECUTOR');
export const SCHEMA_VERSION = '1.0';

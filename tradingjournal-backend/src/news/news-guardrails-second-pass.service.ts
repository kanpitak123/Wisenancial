import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NewsImportance, Prisma } from '@prisma/client';
import {
  ClaudeOnlySystemExecutor,
  GUARDRAILS_MODEL_ID,
} from '../ai/news-guardrails.executor';
import { AiManagerService } from '../ai/ai-manager.service';
import {
  NewsAnalysisService,
  toSpecEnvelope,
} from '../ai/news-analysis/news-analysis.service';
import type { NewsArticleInput } from '../ai/news-analysis/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  loadNewsGuardrailsConfig,
  type NewsGuardrailsConfig,
} from './news-guardrails.config';

export type SecondPassSkipReason =
  'disabled' | 'already-running' | 'budget-exhausted';

export interface SecondPassOutcome {
  skipped?: SecondPassSkipReason;
  /** Rows picked by the selector this tick. */
  selected: number;
  /** Envelopes persisted to market_news.ai_analysis. */
  analysed: number;
  /** True when a provider call failed and the tick stopped early. */
  providerFailure: boolean;
}

type MarketNewsRow = {
  id: number;
  title: string;
  content: string | null;
  source: string | null;
  url: string | null;
  importance: NewsImportance;
  ai_confidence: number | null;
  sector: string | null;
  stock_symbols: string[];
  published_at: Date;
};

const SELECT_FIELDS = {
  id: true,
  title: true,
  content: true,
  source: true,
  url: true,
  importance: true,
  ai_confidence: true,
  sector: true,
  stock_symbols: true,
  published_at: true,
} as const;

/**
 * SHADOW second pass on market_news: the vendored two-sided guardrails analysis
 * (src/ai/news-analysis, Claude) runs on the small slice of articles the first pass
 * flagged, and its result is stored in market_news.ai_analysis — nothing user-visible
 * is overwritten and no page reads it yet.
 *
 * Why a separate cron and not part of the sync: ~47 s per article on Claude, so it can
 * never sit in a request path or in runInvestorSync's sequential loop.
 *
 * Cost controls, all default-safe:
 *  - NEWS_GUARDRAILS_ENABLED=false by default;
 *  - system-paid only, Claude only (ClaudeOnlySystemExecutor) — never user credits,
 *    never a silent Groq fallback;
 *  - selector = importance HIGH OR first-pass ai_confidence < threshold (so roughly the
 *    top ~10% of items once the threshold is calibrated), newest first;
 *  - hard daily budget counted from rows already stamped ai_analysis_at today (UTC), so
 *    it survives restarts and cannot be reset by redeploying.
 */
@Injectable()
export class NewsGuardrailsSecondPassService {
  private readonly logger = new Logger(NewsGuardrailsSecondPassService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: AiManagerService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledRun(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(
        'News guardrails second pass failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async runOnce(now: Date = new Date()): Promise<SecondPassOutcome> {
    const config = loadNewsGuardrailsConfig();
    const outcome: SecondPassOutcome = {
      selected: 0,
      analysed: 0,
      providerFailure: false,
    };

    if (!config.enabled) return { ...outcome, skipped: 'disabled' };
    // A round can outlast the 10-minute tick (~47 s per article): never overlap.
    if (this.running) return { ...outcome, skipped: 'already-running' };

    this.running = true;
    try {
      const usedToday = await this.prisma.market_news.count({
        where: { ai_analysis_at: { gte: this.startOfUtcDay(now) } },
      });
      const remaining = config.dailyBudget - usedToday;
      if (remaining <= 0) return { ...outcome, skipped: 'budget-exhausted' };

      const rows: MarketNewsRow[] = await this.prisma.market_news.findMany({
        where: this.selectionWhere(config, now),
        orderBy: { published_at: 'desc' },
        take: Math.min(config.batchSize, remaining),
        select: SELECT_FIELDS,
      });
      outcome.selected = rows.length;

      for (const row of rows) {
        const persisted = await this.analyseRow(row, config, now);
        if (!persisted) {
          // Provider is down/unconfigured/rejecting: stop the tick instead of burning
          // through the batch. Rows stay unstamped, so the next tick retries them.
          outcome.providerFailure = true;
          break;
        }
        outcome.analysed += 1;
      }

      this.logger.log(
        `[news-guardrails] selected=${outcome.selected} analysed=${outcome.analysed} usedToday=${usedToday + outcome.analysed}/${config.dailyBudget}`,
      );
      return outcome;
    } finally {
      this.running = false;
    }
  }

  private selectionWhere(
    config: NewsGuardrailsConfig,
    now: Date,
  ): Prisma.market_newsWhereInput {
    return {
      ai_analysis_at: null,
      published_at: {
        gte: new Date(now.getTime() - config.maxAgeHours * 3_600_000),
      },
      // `lt` never matches NULL, so rows served by the legacy chain (no confidence
      // score at all) are not treated as "low confidence".
      OR: [
        { importance: NewsImportance.HIGH },
        { ai_confidence: { lt: config.confidenceThreshold } },
      ],
    };
  }

  /** Returns false when the provider call itself failed (nothing persisted). */
  private async analyseRow(
    row: MarketNewsRow,
    config: NewsGuardrailsConfig,
    now: Date,
  ): Promise<boolean> {
    const executor = new ClaudeOnlySystemExecutor(this.manager);
    const analyser = new NewsAnalysisService(
      executor,
      new Logger('NewsAnalysis'),
    );

    const result = await analyser.analyse([this.toArticle(row)], {
      modelId: GUARDRAILS_MODEL_ID,
      requestId: `market_news:${row.id}`,
      now,
    });

    if (executor.failed) {
      const reason =
        executor.failure instanceof Error
          ? executor.failure.message
          : String(executor.failure);
      this.logger.warn(
        `[news-guardrails] provider call failed for market_news ${row.id} (${reason}) — leaving it for the next tick`,
      );
      return false;
    }

    const selectedBy: string[] = [];
    if (row.importance === NewsImportance.HIGH) selectedBy.push('importance');
    if (
      row.ai_confidence !== null &&
      row.ai_confidence < config.confidenceThreshold
    ) {
      selectedBy.push('low_confidence');
    }

    // Persist error envelopes too (validation failed twice, insufficient data...):
    // they cost tokens already, and re-selecting them every tick would loop forever.
    const stored = {
      selected_by: selectedBy,
      threshold: config.confidenceThreshold,
      first_pass_confidence: row.ai_confidence,
      envelope: toSpecEnvelope(result),
      trace: result.trace,
      usage: executor.totalUsage,
    };

    await this.prisma.market_news.update({
      where: { id: row.id },
      data: {
        ai_analysis: stored as unknown as Prisma.InputJsonValue,
        ai_analysis_at: new Date(),
      },
    });
    return true;
  }

  private toArticle(row: MarketNewsRow): NewsArticleInput {
    return {
      sourceId: `mn-${row.id}`,
      headline: row.title,
      content: row.content ?? '',
      source: row.source ?? 'Unknown',
      publishedAt: row.published_at,
      ...(row.stock_symbols.length > 0
        ? { relatedSymbols: row.stock_symbols }
        : {}),
      ...(row.sector ? { sector: [row.sector] } : {}),
      ...(row.url ? { url: row.url } : {}),
    };
  }

  private startOfUtcDay(now: Date): Date {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
}

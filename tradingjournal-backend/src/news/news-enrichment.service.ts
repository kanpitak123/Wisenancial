import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NewsImportance, NewsSentiment, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import type { NewsEnrichmentOutcome } from '../ai/ai-news.types';
import { GeminiNewsClassifierService } from '../ai/gemini-news-classifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { NewsScope } from './dto/news-query.dto';
import { NewsGateway } from './news.gateway';

@Injectable()
export class NewsEnrichmentService {
  private readonly logger = new Logger(NewsEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly gateway: NewsGateway,
    private readonly geminiClassifier?: GeminiNewsClassifierService,
  ) {}

  async enrichTraderNews(id: number, language: 'en' | 'th') {
    const row = await this.prisma.news.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบข่าว Trader');

    const context = this.buildEconomicContext(row);
    const analysis = await this.enrichWithFallback(
      row.title,
      context,
      context,
      language,
    );

    const updated = await this.prisma.news.update({
      where: { id },
      data: {
        importance: analysis.importance ?? NewsImportance.MEDIUM,
        sentiment: analysis.sentiment ?? NewsSentiment.NEUTRAL,
        ai_summary: analysis.aiSummary || row.title,
        market_impact_analysis: analysis.stockImpactAnalysis || null,
        ai_trend: analysis.aiTrend ?? null,
        ai_impact_probability: analysis.aiImpactProbability ?? null,
        ai_confidence: analysis.confidence,
        ai_translated_summary:
          (analysis.aiTranslatedSummary as Prisma.InputJsonValue) ??
          Prisma.JsonNull,
        related_symbols: this.inferTraderSymbols(row.country),
        ai_analyzed_at: new Date(),
      },
    });

    this.gateway.broadcastNewsUpdate(
      'news_ai_enriched',
      NewsScope.TRADER,
      updated,
    );

    return updated;
  }

  enrichInvestorArticle(input: {
    title: string;
    summary: string;
    language: 'en' | 'th';
  }): Promise<NewsEnrichmentOutcome> {
    return this.enrichWithFallback(
      input.title,
      input.summary,
      input.summary,
      input.language,
    );
  }

  /**
   * Chunk A — Gemini first-pass enrichment, gated by GEMINI_NEWS_ENRICHMENT_ENABLED
   * (default OFF, unchanged behavior). When on: try Gemini alone; on any failure
   * (network/timeout, or GeminiClassificationValidationError for malformed/
   * non-compliant output) fall back to the existing multi-provider chain with Gemini
   * excluded, since it just failed. Never throws — enrichNewsArticle() already has its
   * own final static fallback, so this always resolves.
   */
  private async enrichWithFallback(
    headline: string,
    summary: string,
    content: string,
    language: 'en' | 'th',
  ): Promise<NewsEnrichmentOutcome> {
    if (!this.isGeminiEnrichmentEnabled() || !this.geminiClassifier) {
      const result = await this.ai.enrichNewsArticle(
        headline,
        summary,
        content,
        language,
      );
      return { ...result, confidence: null, servedBy: 'legacy-chain' };
    }

    try {
      const result = await this.geminiClassifier.classify({
        headline,
        summary,
        content,
        language,
      });
      this.logger.log('[news-enrichment] served by gemini');
      return { ...result, servedBy: 'gemini' };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[news-enrichment] gemini classification failed (${reason}) — falling back to existing chain`,
      );
      const result = await this.ai.enrichNewsArticle(
        headline,
        summary,
        content,
        language,
        { excludeProviders: ['gemini'] },
      );
      return { ...result, confidence: null, servedBy: 'fallback-chain' };
    }
  }

  private isGeminiEnrichmentEnabled(): boolean {
    return process.env.GEMINI_NEWS_ENRICHMENT_ENABLED === 'true';
  }

  private buildEconomicContext(row: {
    title: string;
    country: string | null;
    impact: string | null;
    forecast: string | null;
    previous: string | null;
    actual: string | null;
    date: Date;
  }) {
    return [
      `Economic event: ${row.title}`,
      `Country/Currency: ${row.country ?? 'Unknown'}`,
      `Scheduled at: ${row.date.toISOString()}`,
      `Impact level: ${row.impact ?? 'Unknown'}`,
      `Forecast: ${row.forecast ?? 'N/A'}`,
      `Previous: ${row.previous ?? 'N/A'}`,
      `Actual: ${row.actual ?? 'Not released'}`,
      'Analyze likely impact on currencies, gold, crypto and major indices. Do not provide investment instructions.',
    ].join('\n');
  }

  private inferTraderSymbols(country: string | null): string[] {
    const code = country?.trim().toUpperCase();
    const map: Record<string, string[]> = {
      USD: [
        'XAU/USD',
        'EUR/USD',
        'GBP/USD',
        'USD/JPY',
        'BTC/USD',
        'NAS100',
        'SPX500',
        'US30',
      ],
      EUR: ['EUR/USD'],
      GBP: ['GBP/USD'],
      JPY: ['USD/JPY'],
      CHF: ['USD/CHF'],
      ALL: ['XAU/USD', 'BTC/USD', 'NAS100', 'SPX500', 'US30'],
    };
    return map[code ?? ''] ?? [];
  }
}

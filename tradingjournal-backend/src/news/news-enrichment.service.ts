import { Injectable, NotFoundException } from '@nestjs/common';
import { AiTrend, NewsImportance, NewsSentiment, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { NewsScope } from './dto/news-query.dto';
import { NewsGateway } from './news.gateway';

@Injectable()
export class NewsEnrichmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly gateway: NewsGateway,
  ) {}

  async enrichTraderNews(id: number, language: 'en' | 'th') {
    const row = await this.prisma.news.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('ไม่พบข่าว Trader');

    const context = this.buildEconomicContext(row);
    const analysis = await this.ai.enrichNewsArticle(
      row.title,
      context,
      context,
      language,
    );

    const updated = await this.prisma.news.update({
      where: { id },
      data: {
        content: context,
        importance:
          (analysis.importance as NewsImportance) ?? NewsImportance.MEDIUM,
        sentiment:
          (analysis.sentiment as NewsSentiment) ?? NewsSentiment.NEUTRAL,
        ai_summary: analysis.aiSummary || row.title,
        market_impact_analysis: analysis.stockImpactAnalysis || null,
        ai_trend: (analysis.aiTrend as AiTrend) ?? null,
        ai_impact_probability: analysis.aiImpactProbability ?? null,
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
  }) {
    return this.ai.enrichNewsArticle(
      input.title,
      input.summary,
      input.summary,
      input.language,
    );
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
      USD: ['XAU/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'NAS100', 'SPX500', 'US30'],
      EUR: ['EUR/USD'],
      GBP: ['GBP/USD'],
      JPY: ['USD/JPY'],
      CHF: ['USD/CHF'],
      ALL: ['XAU/USD', 'BTC/USD', 'NAS100', 'SPX500', 'US30'],
    };
    return map[code ?? ''] ?? [];
  }
}

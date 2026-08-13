import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiTrend, NewsImportance, NewsSentiment, Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { NewsScope } from './dto/news-query.dto';
import { NewsEnrichmentService } from './news-enrichment.service';
import { NewsGateway } from './news.gateway';

@Injectable()
export class NewsSyncService {
  private readonly logger = new Logger(NewsSyncService.name);
  private readonly finnhubApiKey = process.env.FINNHUB_API_KEY;
  private readonly newsApiKey = process.env.NEWS_API_KEY;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichment: NewsEnrichmentService,
    private readonly gateway: NewsGateway,
  ) {}

  async sync(scope: NewsScope, language: 'en' | 'th') {
    const result: Record<string, unknown> = {};
    if (scope === NewsScope.ALL || scope === NewsScope.TRADER) {
      result.trader = await this.syncForexCalendar(language);
    }
    if (scope === NewsScope.ALL || scope === NewsScope.INVESTOR) {
      result.investor = await this.syncInvestorMarketNews(language);
    }
    return { success: true, ...result };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledTraderSync() {
    try {
      await this.syncForexCalendar('th');
    } catch (error) {
      this.logger.error(
        'Trader news cron failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async syncForexCalendar(language: 'en' | 'th' = 'th') {
    const response = await axios.get(
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      { timeout: 10_000 },
    );
    const items = Array.isArray(response.data) ? response.data : [];
    let created = 0;
    let updated = 0;
    let enriched = 0;

    for (const item of items) {
      if (!item?.title || !item?.date) continue;
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) continue;

      const existing = await this.prisma.news.findUnique({
        where: { title_date: { title: item.title, date } },
      });
      const actualChanged = Boolean(
        existing && existing.actual !== (item.actual || null),
      );

      const saved = await this.prisma.news.upsert({
        where: { title_date: { title: item.title, date } },
        update: {
          country: item.country || null,
          impact: item.impact || null,
          forecast: item.forecast || null,
          previous: item.previous || null,
          actual: item.actual || null,
          source: 'Forex Factory',
        },
        create: {
          title: item.title,
          country: item.country || null,
          impact: item.impact || null,
          forecast: item.forecast || null,
          previous: item.previous || null,
          actual: item.actual || null,
          date,
          source: 'Forex Factory',
        },
      });

      existing ? updated++ : created++;

      if (!existing || actualChanged || !saved.ai_analyzed_at) {
        try {
          await this.enrichment.enrichTraderNews(saved.id, language);
          enriched++;
        } catch (error) {
          this.logger.warn(
            `AI enrichment failed for trader news ${saved.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (!existing) {
        this.gateway.broadcastNewsUpdate('new_news', NewsScope.TRADER, saved);
      } else if (actualChanged) {
        this.gateway.broadcastNewsUpdate(
          'news_data_changed',
          NewsScope.TRADER,
          saved,
        );
      }
    }

    return { created, updated, enriched };
  }

  async analyzePendingTraderNews(language: 'en' | 'th' = 'th', limit = 50) {
    const rows = await this.prisma.news.findMany({
      where: { ai_analyzed_at: null },
      orderBy: { date: 'desc' },
      take: limit,
      select: { id: true },
    });

    const results = await Promise.allSettled(
      rows.map((row) => this.enrichment.enrichTraderNews(row.id, language)),
    );

    return {
      requested: rows.length,
      analyzed: results.filter((item) => item.status === 'fulfilled').length,
      failed: results.filter((item) => item.status === 'rejected').length,
    };
  }

  private async syncInvestorMarketNews(language: 'en' | 'th') {
    if (!this.finnhubApiKey && !this.newsApiKey) {
      return { fetched: 0, persisted: 0, warning: 'No news API key configured' };
    }

    const raw: any[] = [];

    if (this.finnhubApiKey) {
      const response = await axios.get('https://finnhub.io/api/v1/news', {
        params: { category: 'general', token: this.finnhubApiKey },
        timeout: 10_000,
      });
      raw.push(...(Array.isArray(response.data) ? response.data : []));
    }

    if (this.newsApiKey) {
      const response = await axios.get(
        'https://newsapi.org/v2/top-headlines',
        {
          params: {
            country: 'us',
            category: 'business',
            apiKey: this.newsApiKey,
          },
          timeout: 10_000,
        },
      );

      for (const article of response.data?.articles ?? []) {
        raw.push({
          headline: article.title,
          summary: article.description,
          source: article.source?.name,
          url: article.url,
          datetime: Math.floor(new Date(article.publishedAt).getTime() / 1000),
          related: [],
        });
      }
    }

    const deduped = this.removeDuplicates(raw).slice(0, 20);
    let persisted = 0;

    for (const article of deduped) {
      const title = String(article.headline || article.title || '').trim();
      const url = String(article.url || '').trim();
      if (!title || !url) continue;

      const summary = String(article.summary || '').trim();
      const analysis = await this.enrichment.enrichInvestorArticle({
        title,
        summary,
        language,
      });

      const relatedValues: unknown[] =
        Array.isArray(article.related)
          ? article.related
          : [];

      const stockSymbols = [
        ...new Set<string>(
          relatedValues
            .map((value) =>
              String(value)
                .trim()
                .toUpperCase(),
            )
            .filter(
              (value): value is string =>
                value.length > 0,
            ),
        ),
      ];

      const data: Prisma.market_newsUncheckedCreateInput = {
        title: title.slice(0, 255),
        content: summary || null,
        source: String(article.source || 'Unknown').slice(0, 100),
        url,
        importance:
          (analysis.importance as NewsImportance) ?? NewsImportance.MEDIUM,
        sentiment:
          (analysis.sentiment as NewsSentiment) ?? NewsSentiment.NEUTRAL,
        ai_summary: analysis.aiSummary || title,
        stock_impact_analysis: analysis.stockImpactAnalysis || null,
        ai_trend: (analysis.aiTrend as AiTrend) ?? null,
        ai_impact_probability: analysis.aiImpactProbability ?? null,
        ai_translated_summary:
          (analysis.aiTranslatedSummary as Prisma.InputJsonValue) ??
          Prisma.JsonNull,
        sector: analysis.sector || null,
        stock_symbols: stockSymbols,
        published_at: new Date(
          (article.datetime || Date.now() / 1000) * 1000,
        ),
      };

      const existing = await this.prisma.market_news.findFirst({
        where: { url },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.market_news.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.market_news.create({ data });
      }

      persisted++;
    }

    return { fetched: deduped.length, persisted };
  }

  private removeDuplicates(items: any[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = String(item.url || item.headline || item.title || '')
        .trim()
        .toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

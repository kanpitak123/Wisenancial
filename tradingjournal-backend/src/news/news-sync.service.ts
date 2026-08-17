import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiTrend, NewsImportance, NewsSentiment, Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { NewsScope } from './dto/news-query.dto';
import { NewsEnrichmentService } from './news-enrichment.service';
import { NewsGateway } from './news.gateway';

/**
 * 10 วิสั้นเกินไปสำหรับ endpoint ข่าวภายนอก — Finnhub/NewsAPI ตอบช้ากว่านั้นได้บ่อย
 * ตอน US market open ทำให้ cron ตาย timeout ทั้งรอบทั้งที่ปลายทางยังตอบอยู่
 */
const NEWS_HTTP_TIMEOUT_MS = 30_000;
const NEWS_HTTP_MAX_ATTEMPTS = 3;
const NEWS_HTTP_BASE_BACKOFF_MS = 1_000;

@Injectable()
export class NewsSyncService {
  private readonly logger = new Logger(NewsSyncService.name);
  private readonly finnhubApiKey = process.env.FINNHUB_API_KEY;
  private readonly newsApiKey = process.env.NEWS_API_KEY;

  /**
   * ยิง HTTP พร้อม retry แบบ exponential backoff
   *
   * ลองใหม่เฉพาะความล้มเหลวชั่วคราว (timeout / network / 5xx / 429) — ส่วน 4xx อื่น
   * เช่น key ผิดหรือ param ผิด ลองกี่ครั้งก็ได้ผลเดิม จึงโยนออกทันทีไม่ต้องเสียเวลา
   */
  private async fetchWithRetry<T>(
    label: string,
    url: string,
    config: Parameters<typeof axios.get>[1],
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= NEWS_HTTP_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.get<T>(url, {
          ...config,
          timeout: NEWS_HTTP_TIMEOUT_MS,
        });

        return response.data;
      } catch (error) {
        lastError = error;

        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        const retryable =
          status === undefined || status === 429 || status >= 500;

        if (!retryable || attempt === NEWS_HTTP_MAX_ATTEMPTS) {
          break;
        }

        const delay = NEWS_HTTP_BASE_BACKOFF_MS * 2 ** (attempt - 1);

        this.logger.warn(
          `${label} attempt ${attempt}/${NEWS_HTTP_MAX_ATTEMPTS} failed (${this.describeHttpError(error)}); retrying in ${delay}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`${label} failed: ${this.describeHttpError(lastError)}`);
  }

  /** ข้อความ error ที่บอกได้จริงว่าพังเพราะอะไร ไม่ใช่แค่ "request failed" */
  private describeHttpError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const code = error.code ?? 'no-code';
      const body =
        typeof error.response?.data === 'string'
          ? error.response.data.slice(0, 200)
          : JSON.stringify(error.response?.data ?? {}).slice(0, 200);

      return `status=${status ?? 'none'} code=${code} message=${error.message} body=${body}`;
    }

    return error instanceof Error ? error.message : String(error);
  }

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
      result.investor = await this.runInvestorSync(language);
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

  /**
   * ข่าวหุ้นซิงก์ชั่วโมงละครั้ง ไม่ใช่ทุก 5 นาทีแบบฝั่ง Forex เพราะ:
   *   - NewsAPI free tier จำกัด 100 request/วัน — ทุก 5 นาทีคือ 288 ครั้ง เกินโควตาแน่
   *   - แต่ละรอบเรียก enrichInvestorArticle() 20 ครั้ง = 20 AI call ทุก 5 นาทีคือ
   *     ~240 call/ชม. ซึ่งชนเพดาน TPM ของ Groq free tier ที่เจอ 429 อยู่แล้ว
   *   - ข่าวหุ้นทั่วไปไม่ได้เปลี่ยนทุก 5 นาที ต่างจากปฏิทินเศรษฐกิจที่ actual
   *     ทยอยประกาศระหว่างวัน
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledInvestorSync() {
    try {
      await this.runInvestorSync('th');
    } catch (error) {
      this.logger.error(
        'Investor news cron failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * กันรอบซ้อนกัน — รอบหนึ่งใช้เวลา ~50 วินาที (AI enrich ทีละบทความ) และถ้า
   * provider ช้าอาจลากยาวข้ามชั่วโมงจนชนรอบถัดไป สองรอบพร้อมกันจะยิง NewsAPI
   * และ AI ซ้ำสองเท่าโดยได้ข่าวชุดเดิม
   *
   * ธงนี้ครอบทั้ง cron และ POST /news/sync/:scope เพื่อไม่ให้กดมือชนกับรอบอัตโนมัติ
   */
  private investorSyncRunning = false;

  private async runInvestorSync(language: 'en' | 'th') {
    if (this.investorSyncRunning) {
      this.logger.warn(
        'Investor news sync already running; skipping this run',
      );

      return {
        fetched: 0,
        persisted: 0,
        skipped: true,
        reason: 'sync already running',
      };
    }

    this.investorSyncRunning = true;

    try {
      return await this.syncInvestorMarketNews(language);
    } finally {
      this.investorSyncRunning = false;
    }
  }

  /** กันรอบซ้อนแบบเดียวกับฝั่ง investor — รอบ 5 นาทีชนกันได้ถ้าปลายทางช้า */
  private forexSyncRunning = false;

  async syncForexCalendar(language: 'en' | 'th' = 'th') {
    if (this.forexSyncRunning) {
      this.logger.warn('Forex calendar sync already running; skipping this run');

      return { created: 0, updated: 0, enriched: 0, skipped: true };
    }

    this.forexSyncRunning = true;

    try {
      return await this.runForexCalendarSync(language);
    } finally {
      this.forexSyncRunning = false;
    }
  }

  private async runForexCalendarSync(language: 'en' | 'th' = 'th') {
    const data = await this.fetchWithRetry<unknown>(
      'ForexFactory calendar',
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      {},
    );
    const items = Array.isArray(data) ? data : [];
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

    // สองแหล่งนี้ต้องแยกขาดจากกัน — ของเดิม Finnhub พังแล้ว throw ออกทั้งเมธอด
    // ทำให้ NewsAPI ไม่ถูกเรียกเลยทั้งที่ยังใช้ได้ ผลคือรอบนั้นได้ข่าว 0 ข่าว
    if (this.finnhubApiKey) {
      try {
        const data = await this.fetchWithRetry<unknown>(
          'Finnhub news',
          'https://finnhub.io/api/v1/news',
          { params: { category: 'general', token: this.finnhubApiKey } },
        );

        raw.push(...(Array.isArray(data) ? data : []));
      } catch (error) {
        this.logger.error(
          `Finnhub news source failed; continuing with remaining sources: ${this.describeHttpError(error)}`,
        );
      }
    }

    if (this.newsApiKey) {
      try {
        const data = await this.fetchWithRetry<{ articles?: any[] }>(
          'NewsAPI top-headlines',
          'https://newsapi.org/v2/top-headlines',
          {
            params: {
              country: 'us',
              category: 'business',
              apiKey: this.newsApiKey,
            },
          },
        );

        for (const article of data?.articles ?? []) {
          raw.push({
            headline: article.title,
            summary: article.description,
            source: article.source?.name,
            url: article.url,
            datetime: Math.floor(new Date(article.publishedAt).getTime() / 1000),
            related: [],
          });
        }
      } catch (error) {
        this.logger.error(
          `NewsAPI source failed; continuing with remaining sources: ${this.describeHttpError(error)}`,
        );
      }
    }

    if (raw.length === 0) {
      this.logger.warn('Investor news sync fetched 0 articles from all sources');
      return { fetched: 0, persisted: 0, warning: 'All news sources failed' };
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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiTrend, NewsImportance, NewsSentiment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NewsQueryDto, NewsScope } from './dto/news-query.dto';

type UnifiedNewsItem = {
  id: string;
  sourceId: number;
  scope: 'TRADER' | 'INVESTOR';
  kind: 'ECONOMIC_EVENT' | 'MARKET_ARTICLE';
  title: string;
  summary: string;
  source: string | null;
  url: string | null;
  importance: NewsImportance;
  sentiment: NewsSentiment;
  aiSummary: string | null;
  impactAnalysis: string | null;
  aiTrend: AiTrend | null;
  aiImpactProbability: number | null;
  translatedSummary: Prisma.JsonValue | null;
  relatedSymbols: string[];
  country: string | null;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  sector: string | null;
  publishedAt: Date;
  isPinned: boolean;
};

@Injectable()
export class NewsFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getUnifiedFeed(userId: number, query: NewsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));

    if (query.scope === NewsScope.TRADER) {
      return this.getTraderFeed(userId, query, page, limit);
    }
    if (query.scope === NewsScope.INVESTOR) {
      return this.getInvestorFeed(userId, query, page, limit);
    }

    const fetchSize = Math.min(100, page * limit);
    const [trader, investor] = await Promise.all([
      this.getTraderItems(userId, query, fetchSize),
      this.getInvestorItems(userId, query, fetchSize),
    ]);

    const merged = [...trader.items, ...investor.items].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });

    const start = (page - 1) * limit;
    return this.wrapResponse(
      merged.slice(start, start + limit),
      trader.total + investor.total,
      page,
      limit,
      NewsScope.ALL,
    );
  }

  async togglePin(userId: number, scope: NewsScope, newsId: number) {
    if (scope === NewsScope.ALL) {
      throw new BadRequestException('กรุณาระบุ TRADER หรือ INVESTOR');
    }

    if (scope === NewsScope.TRADER) {
      const exists = await this.prisma.news.findUnique({
        where: { id: newsId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('ไม่พบข่าว Trader');

      const pin = await this.prisma.user_pinned_news.findUnique({
        where: { user_id_news_id: { user_id: userId, news_id: newsId } },
      });
      if (pin) {
        await this.prisma.user_pinned_news.delete({ where: { id: pin.id } });
        return { pinned: false };
      }
      await this.prisma.user_pinned_news.create({
        data: { user_id: userId, news_id: newsId },
      });
      return { pinned: true };
    }

    const exists = await this.prisma.market_news.findUnique({
      where: { id: newsId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('ไม่พบข่าว Investor');

    const pin = await this.prisma.user_pinned_market_news.findUnique({
      where: {
        user_id_market_news_id: {
          user_id: userId,
          market_news_id: newsId,
        },
      },
    });
    if (pin) {
      await this.prisma.user_pinned_market_news.delete({ where: { id: pin.id } });
      return { pinned: false };
    }
    await this.prisma.user_pinned_market_news.create({
      data: { user_id: userId, market_news_id: newsId },
    });
    return { pinned: true };
  }

  private async getTraderFeed(userId: number, query: NewsQueryDto, page: number, limit: number) {
    const result = await this.getTraderItems(userId, query, limit, (page - 1) * limit);
    return this.wrapResponse(result.items, result.total, page, limit, NewsScope.TRADER);
  }

  private async getInvestorFeed(userId: number, query: NewsQueryDto, page: number, limit: number) {
    const result = await this.getInvestorItems(userId, query, limit, (page - 1) * limit);
    return this.wrapResponse(result.items, result.total, page, limit, NewsScope.INVESTOR);
  }

  private async getTraderItems(userId: number, query: NewsQueryDto, take: number, skip = 0) {
    const where: Prisma.newsWhereInput = {
      ...(query.country && { country: query.country.toUpperCase() }),
      ...(query.impact && { impact: query.impact }),
      ...(query.sentiment && {
        sentiment: query.sentiment.toUpperCase() as NewsSentiment,
      }),
      ...(query.symbol && { related_symbols: { has: query.symbol } }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.news.count({ where }),
      this.prisma.news.findMany({
        where,
        include: {
          pinned_by: { where: { user_id: userId }, select: { id: true } },
        },
        orderBy: [{ date: 'desc' }],
        skip,
        take,
      }),
    ]);

    return {
      total,
      items: rows.map<UnifiedNewsItem>((row) => ({
        id: `TRADER:${row.id}`,
        sourceId: row.id,
        scope: 'TRADER',
        kind: 'ECONOMIC_EVENT',
        title: row.title,
        summary: row.content ?? '',
        source: row.source,
        url: row.url,
        importance: row.importance,
        sentiment: row.sentiment,
        aiSummary: row.ai_summary,
        impactAnalysis: row.market_impact_analysis,
        aiTrend: row.ai_trend,
        aiImpactProbability: row.ai_impact_probability,
        translatedSummary: row.ai_translated_summary,
        relatedSymbols: row.related_symbols,
        country: row.country,
        impact: row.impact,
        forecast: row.forecast,
        previous: row.previous,
        actual: row.actual,
        sector: null,
        publishedAt: row.date,
        isPinned: row.pinned_by.length > 0,
      })),
    };
  }

  private async getInvestorItems(userId: number, query: NewsQueryDto, take: number, skip = 0) {
    const where: Prisma.market_newsWhereInput = {
      ...(query.sector && { sector: query.sector }),
      ...(query.sentiment && {
        sentiment: query.sentiment.toUpperCase() as NewsSentiment,
      }),
      ...(query.symbol && { stock_symbols: { has: query.symbol } }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.market_news.count({ where }),
      this.prisma.market_news.findMany({
        where,
        include: {
          pinned_by: { where: { user_id: userId }, select: { id: true } },
        },
        orderBy: [{ published_at: 'desc' }],
        skip,
        take,
      }),
    ]);

    return {
      total,
      items: rows.map<UnifiedNewsItem>((row) => ({
        id: `INVESTOR:${row.id}`,
        sourceId: row.id,
        scope: 'INVESTOR',
        kind: 'MARKET_ARTICLE',
        title: row.title,
        summary: row.content ?? '',
        source: row.source,
        url: row.url,
        importance: row.importance,
        sentiment: row.sentiment,
        aiSummary: row.ai_summary,
        impactAnalysis: row.stock_impact_analysis,
        aiTrend: row.ai_trend,
        aiImpactProbability: row.ai_impact_probability,
        translatedSummary: row.ai_translated_summary,
        relatedSymbols: row.stock_symbols,
        country: null,
        impact: null,
        forecast: null,
        previous: null,
        actual: null,
        sector: row.sector,
        publishedAt: row.published_at,
        isPinned: row.pinned_by.length > 0,
      })),
    };
  }

  private wrapResponse(
    data: UnifiedNewsItem[],
    total: number,
    page: number,
    limit: number,
    scope: NewsScope,
  ) {
    return {
      success: true,
      scope,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

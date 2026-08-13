import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { StockPurchasesService } from '../stock-purchases/stock-purchases.service';
import { AiManagerService } from './ai-manager.service';
import { AiRuleEngineService } from './ai-rule-engine.service';
import type {
  AnalyzeChartDto,
  ChartInsightResponse,
  InvestorReviewResult,
  TraderReviewResult,
  UnifiedPortfolioReviewResponse,
} from './ai.types';
import type { NewsEnrichmentResult } from './ai-news.types';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: AiManagerService,
    private readonly rules: AiRuleEngineService,
    private readonly analytics: AnalyticsService,
    private readonly holdings: StockPurchasesService,
  ) {}

  async analyzeChart(
    userId: number,
    dto: AnalyzeChartDto,
  ): Promise<ChartInsightResponse> {
    if (dto.useRuleBased || !dto.modelId) {
      return {
        insight: this.rules.analyze(dto.chartType, dto.data),
        source: 'RULE_BASED',
      };
    }

    const result = await this.manager.executeAiRequest<{ insight: string }>({
      userId,
      modelId: dto.modelId,
      systemPrompt:
        'You are a professional financial analytics coach. Reply in Thai as valid JSON only: {"insight":"concise actionable analysis grounded only in supplied data"}.',
      prompt: JSON.stringify({
        portfolioType: dto.portfolioType,
        chartType: dto.chartType,
        data: dto.data,
        extraContext: dto.extraContext ?? {},
      }),
      maxOutputTokens: 800,
    });

    return {
      insight: result.data.insight,
      source: 'LLM',
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
    };
  }

  async reviewPortfolio(
    userId: number,
    portfolioId: number,
    modelId: string,
    suppliedItems?: unknown[],
    suppliedAnalytics?: Record<string, unknown>,
  ): Promise<
    UnifiedPortfolioReviewResponse<TraderReviewResult | InvestorReviewResult>
  > {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId },
      select: { portfolio_type: true },
    });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    if (portfolio.portfolio_type === PortfolioType.TRADER) {
      const analytics =
        suppliedAnalytics ??
        ((await this.analytics.overview(
          userId,
          portfolioId,
        )) as Record<string, unknown>);

      const result =
        await this.manager.executeAiRequest<TraderReviewResult>({
          userId,
          modelId,
          systemPrompt:
            'You are a disciplined trading coach. Return valid JSON only.',
          prompt: JSON.stringify({
            task: 'Review trader performance and journal behavior',
            requiredShape: {
              summary: 'string',
              strengths: ['string'],
              weaknesses: ['string'],
              riskWarnings: ['string'],
              actionableRecommendations: ['string'],
              disciplineScore: 'number 0-100',
            },
            trades: suppliedItems ?? [],
            analytics,
          }),
          maxOutputTokens: 1400,
        });

      return {
        portfolioType: 'TRADER',
        data: result.data,
        model: result.model,
        creditsCharged: result.creditsCharged,
        creditsRemaining: result.creditsRemaining,
      };
    }

    if (portfolio.portfolio_type !== PortfolioType.INVESTOR) {
      throw new BadRequestException('Unsupported portfolio type');
    }

    const holdings =
      suppliedItems ??
      (await this.holdings.getHoldings(portfolioId, userId));
    const analytics =
      suppliedAnalytics ??
      ((await this.analytics.overview(
        userId,
        portfolioId,
      )) as Record<string, unknown>);

    const result =
      await this.manager.executeAiRequest<InvestorReviewResult>({
        userId,
        modelId,
        systemPrompt:
          'You are a professional portfolio advisor. Do not predict prices. Return valid JSON only.',
        prompt: JSON.stringify({
          task: 'Review investor portfolio health, diversification, and risk',
          requiredShape: {
            summary: 'string',
            diversificationScore: 'number 0-100',
            riskProfile: 'CONSERVATIVE|MODERATE|AGGRESSIVE',
            concentrationRisks: ['string'],
            strengths: ['string'],
            actionableRecommendations: ['string'],
          },
          holdings,
          analytics,
        }),
        maxOutputTokens: 1400,
      });

    return {
      portfolioType: 'INVESTOR',
      data: result.data,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
    };
  }

  /**
   * Legacy/system-compatible signature used by NewsService and cron jobs.
   * It does not debit any user's credits.
   */
  async enrichNewsArticle(
    headline: string,
    summary: string,
    content = '',
    language: 'en' | 'th' = 'en',
  ): Promise<NewsEnrichmentResult> {
    const fallback = this.buildFallback(headline, language);

    try {
      const result =
        await this.manager.executeSystemAiRequest<
          Omit<NewsEnrichmentResult, 'fromFallback'>
        >({
          prompt: JSON.stringify({
            language,
            headline: headline.slice(0, 300),
            summary: summary.slice(0, 800),
            content: content.slice(0, 1500),
          }),
          systemPrompt:
            'You are a financial news analyst. Return valid JSON only with aiSummary, aiTrend, aiImpactProbability, stockImpactAnalysis, sector, importance, sentiment and aiTranslatedSummary.',
          maxOutputTokens: 1000,
        });

      return this.normalizeNewsResult(result.data, fallback);
    } catch {
      return fallback;
    }
  }

  /** User-triggered enrichment that is billed to the selected model. */
  async enrichUserNewsArticle(
    userId: number,
    modelId: string,
    headline: string,
    summary: string,
    content = '',
    language: 'en' | 'th' = 'en',
  ) {
    const fallback = this.buildFallback(headline, language);

    const result = await this.manager.executeAiRequest<
      Omit<NewsEnrichmentResult, 'fromFallback'>
    >({
      userId,
      modelId,
      prompt: JSON.stringify({
        language,
        headline: headline.slice(0, 300),
        summary: summary.slice(0, 800),
        content: content.slice(0, 1500),
      }),
      systemPrompt:
        'You are a financial news analyst. Return valid JSON only with aiSummary, aiTrend, aiImpactProbability, stockImpactAnalysis, sector, importance, sentiment and aiTranslatedSummary.',
      maxOutputTokens: 1000,
    });

    return {
      data: this.normalizeNewsResult(result.data, fallback),
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
    };
  }

  buildFallback(
    headline: string,
    language: 'en' | 'th' = 'en',
  ): NewsEnrichmentResult {
    return {
      aiSummary: `• ${headline.slice(0, 120)}`,
      aiTrend: 'SIDEWAY',
      aiImpactProbability: 50,
      stockImpactAnalysis:
        language === 'th'
          ? 'ยังไม่มีข้อมูลเพียงพอสำหรับสรุปผลกระทบ'
          : 'Insufficient information to assess market impact.',
      sector: 'General',
      importance: 'MEDIUM',
      sentiment: 'NEUTRAL',
      fromFallback: true,
    };
  }

  private normalizeNewsResult(
    data: Omit<NewsEnrichmentResult, 'fromFallback'>,
    fallback: NewsEnrichmentResult,
  ): NewsEnrichmentResult {
    const probability = Number(data?.aiImpactProbability);
    return {
      aiSummary: String(data?.aiSummary ?? fallback.aiSummary),
      aiTrend:
        data?.aiTrend === 'UP' ||
        data?.aiTrend === 'DOWN' ||
        data?.aiTrend === 'SIDEWAY'
          ? data.aiTrend
          : fallback.aiTrend,
      aiImpactProbability: Number.isFinite(probability)
        ? Math.max(0, Math.min(100, probability <= 1 ? probability * 100 : probability))
        : fallback.aiImpactProbability,
      stockImpactAnalysis: String(
        data?.stockImpactAnalysis ?? fallback.stockImpactAnalysis,
      ),
      sector: String(data?.sector ?? fallback.sector),
      importance:
        data?.importance === 'HIGH' ||
        data?.importance === 'MEDIUM' ||
        data?.importance === 'LOW'
          ? data.importance
          : fallback.importance,
      sentiment:
        data?.sentiment === 'BULLISH' ||
        data?.sentiment === 'BEARISH' ||
        data?.sentiment === 'NEUTRAL'
          ? data.sentiment
          : fallback.sentiment,
      aiTranslatedSummary: data?.aiTranslatedSummary,
      fromFallback: false,
    };
  }
}

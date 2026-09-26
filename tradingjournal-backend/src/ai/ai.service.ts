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
import type { AiProviderId } from './ai.models';
import { AiRuleEngineService } from './ai-rule-engine.service';
import type {
  AnalyzeChartDto,
  ChartInsightResponse,
  InvestorReviewResult,
  TraderReviewResult,
  UnifiedPortfolioReviewResponse,
} from './ai.types';
import type { NewsEnrichmentResult } from './ai-news.types';
import {
  buildInvestorReviewMetrics,
  buildTraderReviewMetrics,
} from './portfolio-review-metrics';
import {
  concisenessRule,
  investmentGuardrail,
  newsLanguageRule,
  numberQuotingRule,
  outputLanguageRule,
  resolveOutputLanguage,
  withLanguage,
} from './ai-prompt.shared';

/**
 * system prompt ของงาน enrich ข่าว — ใช้ร่วมกันทั้งรอบอัตโนมัติและรอบที่ผู้ใช้กดเอง
 * (สองจุดนี้ต้องเหมือนกันเสมอ ไม่งั้นข่าวเดียวกันจะได้ผลต่างกันแล้วแต่ว่าใครสั่ง)
 *
 * ภาษาไม่ได้ใช้ outputLanguageRule เหมือนจุดอื่น เพราะที่นี่มี field `language`
 * เดินทางมากับตัวข่าวอยู่แล้ว และมีสองฟิลด์ที่ต้องการภาษาคนละทางกัน:
 * aiSummary/stockImpactAnalysis ตามภาษาข่าว ส่วน aiTranslatedSummary ต้องเป็นไทย
 * เสมอ (เป็นตัวสำรองให้คนไทยอ่านข่าวภาษาอังกฤษ) ของเดิมส่ง `language` เข้าไปเฉย ๆ
 * โดยไม่มีคำสั่งให้ทำตามเลย
 *
 * ค่าที่รับได้ของ aiTrend/importance/sentiment เขียนไว้ตรงนี้ด้วย ของเดิมบอกแค่
 * "ชื่อ" ฟิลด์ แล้วปล่อยให้ normalizeNewsResult() เงียบ ๆ แทนค่าที่โมเดลตอบนอกชุด
 * ด้วยค่า fallback — ผู้ใช้ไม่มีทางรู้ว่าข้อมูลถูกกลืนไป
 */
const NEWS_ENRICHMENT_SYSTEM_PROMPT = [
  'You are a financial news analyst summarizing news for Thai retail investors.',
  'Base your analysis strictly on the headline/summary/content provided — do not use outside knowledge about the company beyond this article.',
  investmentGuardrail(),
  concisenessRule(),
  'Write aiSummary and stockImpactAnalysis in the language given by "language" ("th" or "en") — this is a hard requirement, not a suggestion.',
  'aiTranslatedSummary must always be in Thai, regardless of "language" (used as a Thai fallback when the article itself is in English).',
  'Return valid JSON only, matching exactly:',
  '{',
  '  "aiSummary": string,',
  '  "aiTrend": "UP" | "DOWN" | "SIDEWAY",',
  '  "aiImpactProbability": number (0-100),',
  '  "stockImpactAnalysis": string,',
  '  "sector": string,',
  '  "importance": "HIGH" | "MEDIUM" | "LOW",',
  '  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",',
  '  "aiTranslatedSummary": string',
  '}',
  'If uncertain about impact, prefer a value near 50 and say so in stockImpactAnalysis rather than guessing confidently.',
].join('\n');

/** ระบุภาษาตามภาษาของข่าวตรง ๆ ท้าย prompt — ดู newsLanguageRule() */
const newsEnrichmentSystemPrompt = (language: 'en' | 'th') =>
  `${NEWS_ENRICHMENT_SYSTEM_PROMPT}\n${newsLanguageRule(language)}`;

/** เฉพาะฟิลด์ที่ต้องเป็นภาษาของข่าว (aiTranslatedSummary เป็นไทยเสมอ ไม่ตรวจ) */
const newsLanguageProbe = (data: Partial<NewsEnrichmentResult> | undefined) => [
  data?.aiSummary,
  data?.stockImpactAnalysis,
];

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
    // ฟรีเฉพาะเมื่อขอแบบ rule-based ตรง ๆ — ไม่มีการเลือกโมเดลแล้ว ค่าเริ่มต้นคือ AI (คิดเครดิต)
    if (dto.useRuleBased === true) {
      return {
        insight: this.rules.analyze(dto.chartType, dto.data),
        source: 'RULE_BASED',
      };
    }

    const outputLanguage = resolveOutputLanguage(dto.outputLanguage);

    // ตัวเลขที่ insight อ้างได้มีเฉพาะที่อยู่ใน payload นี้ (groundedIn) — ห้ามคำนวณค่าเฉลี่ย/ผลรวมใหม่
    const payload = withLanguage(
      {
        portfolioType: dto.portfolioType,
        chartType: dto.chartType,
        data: dto.data,
        extraContext: dto.extraContext ?? {},
      },
      outputLanguage,
    );

    const result = await this.manager.executeAiRequest<{ insight: string }>({
      userId,
      feature: 'chart_insight',
      systemPrompt: [
        'You are a professional financial analytics coach.',
        outputLanguageRule(outputLanguage),
        investmentGuardrail(),
        numberQuotingRule(['data', 'extraContext'], false),
        concisenessRule(),
        'Return valid JSON only: {"insight":"concise actionable analysis grounded only in supplied data"}.',
      ].join('\n'),
      prompt: JSON.stringify(payload),
      maxOutputTokens: 1200,
      expectedLanguage: outputLanguage,
      languageProbe: (data) => data?.insight,
      groundedIn: payload,
      rejectKeyNames: true,
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
    suppliedItems?: unknown[],
    suppliedAnalytics?: Record<string, unknown>,
    requestedLanguage?: string,
  ): Promise<
    UnifiedPortfolioReviewResponse<TraderReviewResult | InvestorReviewResult>
  > {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId },
      select: { portfolio_type: true },
    });

    if (!portfolio) {
      throw new NotFoundException('ไม่พบ portfolio หรือคุณไม่มีสิทธิ์เข้าถึง');
    }

    const outputLanguage = resolveOutputLanguage(requestedLanguage);

    if (portfolio.portfolio_type === PortfolioType.TRADER) {
      const analytics =
        suppliedAnalytics ??
        (await this.analytics.overview(userId, portfolioId));

      // ตัวเลขทั้งหมดที่โมเดลเห็นอยู่ใน payload นี้ก้อนเดียว — และเป็นก้อนเดียวกับที่
      // manager ใช้ตรวจว่าคำตอบอ้างตัวเลขที่ไม่มีอยู่จริงหรือเปล่า (groundedIn)
      const payload = withLanguage(
        {
          task: 'Review trader performance and journal behavior',
          requiredShape: {
            summary: 'string',
            strengths: ['string'],
            weaknesses: ['string'],
            riskWarnings: ['string'],
            actionableRecommendations: ['string'],
            disciplineScore: 'number 0-100',
          },
          ...buildTraderReviewMetrics(analytics, outputLanguage),
          trades: suppliedItems ?? [],
        },
        outputLanguage,
      );

      const result = await this.manager.executeAiRequest<TraderReviewResult>({
        userId,
        feature: 'portfolio_review',
        systemPrompt: [
          'You are a disciplined trading coach.',
          outputLanguageRule(outputLanguage),
          investmentGuardrail(),
          numberQuotingRule(),
          concisenessRule(),
          'Return valid JSON only.',
        ].join('\n'),
        prompt: JSON.stringify(payload),
        maxOutputTokens: 1800,
        expectedLanguage: outputLanguage,
        groundedIn: payload,
        rejectKeyNames: true,
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
      suppliedItems ?? (await this.holdings.getHoldings(portfolioId, userId));
    const analytics =
      suppliedAnalytics ?? (await this.analytics.overview(userId, portfolioId));

    // แทนที่จะส่ง analytics overview + holdings ดิบ (มี holdings ซ้ำสองชุดและ recent_activity
    // ทั้งก้อน) ส่ง metrics ที่คำนวณแล้วติดป้ายหน่วยและคำนิยามไว้ ดู portfolio-review-metrics.ts
    const payload = withLanguage(
      {
        task: 'Review investor portfolio health, diversification, and risk',
        requiredShape: {
          summary: 'string',
          diversificationScore: 'number 0-100',
          riskProfile: 'CONSERVATIVE|MODERATE|AGGRESSIVE',
          concentrationRisks: ['string'],
          strengths: ['string'],
          actionableRecommendations: ['string'],
        },
        ...buildInvestorReviewMetrics(analytics, holdings, outputLanguage),
      },
      outputLanguage,
    );

    const result = await this.manager.executeAiRequest<InvestorReviewResult>({
      userId,
      feature: 'portfolio_review',
      systemPrompt: [
        'You are a professional portfolio advisor. Do not predict prices.',
        outputLanguageRule(outputLanguage),
        investmentGuardrail(),
        numberQuotingRule(),
        concisenessRule(),
        'Return valid JSON only.',
      ].join('\n'),
      prompt: JSON.stringify(payload),
      maxOutputTokens: 1800,
      expectedLanguage: outputLanguage,
      groundedIn: payload,
      rejectKeyNames: true,
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
    options?: { excludeProviders?: AiProviderId[] },
  ): Promise<NewsEnrichmentResult> {
    const fallback = this.buildFallback(headline, language);

    try {
      const result = await this.manager.executeSystemAiRequest<
        Omit<NewsEnrichmentResult, 'fromFallback'>
      >({
        prompt: JSON.stringify(
          withLanguage(
            {
              language,
              headline: headline.slice(0, 300),
              summary: summary.slice(0, 800),
              content: content.slice(0, 1500),
            },
            language,
          ),
        ),
        systemPrompt: newsEnrichmentSystemPrompt(language),
        maxOutputTokens: 1400,
        excludeProviders: options?.excludeProviders,
        expectedLanguage: language,
        languageProbe: newsLanguageProbe,
      });

      return this.normalizeNewsResult(result.data, fallback);
    } catch {
      return fallback;
    }
  }

  /** User-triggered enrichment that is billed to the selected model. */
  async enrichUserNewsArticle(
    userId: number,
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
      feature: 'news_enrich',
      prompt: JSON.stringify(
        withLanguage(
          {
            language,
            headline: headline.slice(0, 300),
            summary: summary.slice(0, 800),
            content: content.slice(0, 1500),
          },
          language,
        ),
      ),
      systemPrompt: newsEnrichmentSystemPrompt(language),
      maxOutputTokens: 1400,
      expectedLanguage: language,
      languageProbe: newsLanguageProbe,
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
        ? Math.max(
            0,
            Math.min(100, probability <= 1 ? probability * 100 : probability),
          )
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

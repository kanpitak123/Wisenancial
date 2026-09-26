import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { AiManagerService } from './ai-manager.service';
import { MIN_CREDIT_BALANCE, listFeaturePricing } from './ai-pricing.config';
import { AiService } from './ai.service';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiRiskService } from './ai-risk.service';
import { AiEducationService } from './ai-education.service';
import {
  AnalyzeChartDto,
  EnrichNewsDto,
  QuizDto,
  ReviewPortfolioDto,
  RiskAnalysisDto,
} from './dto/ai.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly manager: AiManagerService,
    private readonly ai: AiService,
    private readonly recommendations: AiRecommendationService,
    private readonly risk: AiRiskService,
    private readonly education: AiEducationService,
  ) {}

  /**
   * Flat price of every AI feature — the frontend shows these on the buttons, so the
   * numbers come from ai-pricing.config.ts and nowhere else. No model list: users do
   * not choose a model, each feature has a fixed tier.
   */
  @Get('pricing')
  getPricing() {
    return {
      features: listFeaturePricing(),
      minBalance: MIN_CREDIT_BALANCE,
    };
  }

  @Get('credits')
  async getCredits(@Request() req: any) {
    const balance = await this.manager.getBalance(req.user.userId);
    return { balance, minBalance: MIN_CREDIT_BALANCE };
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('analyze')
  analyzeChart(@Request() req: any, @Body() dto: AnalyzeChartDto) {
    return this.ai.analyzeChart(req.user.userId, dto);
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('portfolio/:portfolioId/review')
  reviewPortfolio(
    @Request() req: any,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Body() dto: ReviewPortfolioDto,
  ) {
    return this.ai.reviewPortfolio(
      req.user.userId,
      portfolioId,
      dto.items,
      dto.analytics,
      dto.outputLanguage,
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('portfolio/risk-analysis')
  riskAnalysis(@Request() req: any, @Body() dto: RiskAnalysisDto) {
    return this.risk.analyze(req.user.userId, dto.holdings, dto.outputLanguage);
  }

  /**
   * เป็น GET จึงไม่มี body ให้ใส่ outputLanguage — รับเป็น query string แทน
   * ค่าที่ไม่รู้จักถูก resolveOutputLanguage() ปัดเป็นค่าเริ่มต้นให้อยู่แล้ว
   */
  @UseGuards(VerifiedEmailGuard)
  @Get('recommendations/growth')
  growthRecommendations(
    @Request() req: any,
    @Query('outputLanguage') outputLanguage?: string,
  ) {
    return this.recommendations.getGrowthRecommendations(
      req.user.userId,
      outputLanguage,
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('education/quiz')
  generateQuiz(@Request() req: any, @Body() dto: QuizDto) {
    return this.education.generateQuiz(
      req.user.userId,
      dto.lessonTitle,
      dto.lessonDescription,
      dto.outputLanguage,
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('news/enrich')
  enrichNews(@Request() req: any, @Body() dto: EnrichNewsDto) {
    // always billed: the old "no modelId" branch ran the system-paid enrichment for
    // anyone who asked, which is free AI for every logged-in user
    return this.ai.enrichUserNewsArticle(
      req.user.userId,
      dto.headline,
      dto.summary,
      dto.content,
      dto.language,
    );
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiManagerService } from './ai-manager.service';
import { MIN_CREDIT_BALANCE } from './ai.models';
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

  @Get('models')
  listModels() {
    return {
      models: this.manager.listAvailableModels(),
      minBalance: MIN_CREDIT_BALANCE,
    };
  }

  @Get('credits')
  async getCredits(@Request() req: any) {
    const balance = await this.manager.getBalance(req.user.userId);
    return { balance, minBalance: MIN_CREDIT_BALANCE };
  }

  @Post('analyze')
  analyzeChart(
    @Request() req: any,
    @Body() dto: AnalyzeChartDto,
  ) {
    return this.ai.analyzeChart(req.user.userId, dto);
  }

  @Post('portfolio/:portfolioId/review')
  reviewPortfolio(
    @Request() req: any,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Body() dto: ReviewPortfolioDto,
  ) {
    return this.ai.reviewPortfolio(
      req.user.userId,
      portfolioId,
      dto.modelId,
      dto.items,
      dto.analytics,
    );
  }

  @Post('portfolio/risk-analysis')
  riskAnalysis(
    @Request() req: any,
    @Body() dto: RiskAnalysisDto,
  ) {
    return this.risk.analyze(
      req.user.userId,
      dto.holdings,
      dto.modelId,
    );
  }

  @Get('recommendations/growth')
  growthRecommendations(@Request() req: any) {
    return this.recommendations.getGrowthRecommendations(
      req.user.userId,
    );
  }

  @Post('education/quiz')
  generateQuiz(
    @Request() req: any,
    @Body() dto: QuizDto,
  ) {
    return this.education.generateQuiz(
      req.user.userId,
      dto.lessonTitle,
      dto.lessonDescription,
    );
  }

  @Post('news/enrich')
  enrichNews(
    @Request() req: any,
    @Body() dto: EnrichNewsDto,
  ) {
    if (!dto.modelId) {
      return this.ai.enrichNewsArticle(
        dto.headline,
        dto.summary,
        dto.content,
        dto.language,
      );
    }

    return this.ai.enrichUserNewsArticle(
      req.user.userId,
      dto.modelId,
      dto.headline,
      dto.summary,
      dto.content,
      dto.language,
    );
  }
}

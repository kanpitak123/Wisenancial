import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiRiskService } from './ai-risk.service';
import { AiEducationService } from './ai-education.service';
import { AiManagerService } from './ai-manager.service';
import {
  concisenessRule,
  investmentGuardrail,
  outputLanguageRule,
  resolveOutputLanguage,
  withLanguage,
} from './ai-prompt.shared';

@UseGuards(JwtAuthGuard)
@Controller('ai-advisor')
export class AiCompatibilityController {
  constructor(
    private readonly manager: AiManagerService,
    private readonly recommendations: AiRecommendationService,
    private readonly risk: AiRiskService,
    private readonly education: AiEducationService,
  ) {}

  @UseGuards(VerifiedEmailGuard)
  @Post('analyze')
  async analyzeLegacyPortfolio(
    @Request() req: any,
    @Body()
    body: {
      holdings: unknown[];
      outputLanguage?: string;
    },
  ) {
    const outputLanguage = resolveOutputLanguage(body.outputLanguage);

    const result = await this.manager.executeAiRequest({
      userId: req.user.userId,
      feature: 'portfolio_review',
      systemPrompt: [
        'You are a portfolio advisor.',
        outputLanguageRule(outputLanguage),
        investmentGuardrail(),
        concisenessRule(),
        'Return valid JSON only.',
      ].join('\n'),
      prompt: JSON.stringify(
        withLanguage(
          {
            task: 'Analyze holdings',
            requiredShape: {
              timeframeRecommendations: [
                {
                  symbol: 'string',
                  recommendation: 'LONG_TERM|SHORT_TERM',
                  reasoning: 'string',
                  confidence: 'number 0-100',
                },
              ],
              portfolioHealth: {
                diversificationScore: 'number 0-100',
                riskProfile: 'CONSERVATIVE|MODERATE|AGGRESSIVE',
                concentrationRisk: 'string',
                recommendations: ['string'],
              },
            },
            holdings: body.holdings,
          },
          outputLanguage,
        ),
      ),
      expectedLanguage: outputLanguage,
    });

    return {
      success: true,
      data: result.data,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(VerifiedEmailGuard)
  @Get('recommendations')
  async recommendationsLegacy(
    @Request() req: any,
    @Query('outputLanguage') outputLanguage?: string,
  ) {
    const result = await this.recommendations.getGrowthRecommendations(
      req.user.userId,
      outputLanguage,
    );

    return {
      success: true,
      data: result.data,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('analyze-risk')
  async riskLegacy(
    @Request() req: any,
    @Body()
    body: { holdings: any[]; outputLanguage?: string },
  ) {
    const result = await this.risk.analyze(
      req.user.userId,
      body.holdings,
      body.outputLanguage,
    );

    return {
      success: true,
      data: result.data,
      holdingsData: result.holdingsData,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(VerifiedEmailGuard)
  @Post('generate-quiz')
  async quizLegacy(
    @Request() req: any,
    @Body()
    body: {
      lessonTitle: string;
      lessonDescription: string;
      outputLanguage?: string;
    },
  ) {
    const result = await this.education.generateQuiz(
      req.user.userId,
      body.lessonTitle,
      body.lessonDescription,
      body.outputLanguage,
    );

    return {
      success: true,
      data: result.data,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
      timestamp: new Date().toISOString(),
    };
  }
}

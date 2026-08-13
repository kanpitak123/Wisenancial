import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiRiskService } from './ai-risk.service';
import { AiEducationService } from './ai-education.service';
import { AiManagerService } from './ai-manager.service';

@UseGuards(JwtAuthGuard)
@Controller('ai-advisor')
export class AiCompatibilityController {
  constructor(
    private readonly manager: AiManagerService,
    private readonly recommendations: AiRecommendationService,
    private readonly risk: AiRiskService,
    private readonly education: AiEducationService,
  ) {}

  @Post('analyze')
  async analyzeLegacyPortfolio(
    @Request() req: any,
    @Body()
    body: {
      holdings: unknown[];
      modelId: string;
    },
  ) {
    const result = await this.manager.executeAiRequest({
      userId: req.user.userId,
      modelId: body.modelId,
      systemPrompt:
        'You are a portfolio advisor. Return valid JSON only.',
      prompt: JSON.stringify({
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
      }),
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

  @Get('recommendations')
  async recommendationsLegacy(@Request() req: any) {
    const result =
      await this.recommendations.getGrowthRecommendations(
        req.user.userId,
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

  @Post('analyze-risk')
  async riskLegacy(
    @Request() req: any,
    @Body() body: { holdings: any[]; modelId: string },
  ) {
    const result = await this.risk.analyze(
      req.user.userId,
      body.holdings,
      body.modelId,
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

  @Post('generate-quiz')
  async quizLegacy(
    @Request() req: any,
    @Body()
    body: {
      lessonTitle: string;
      lessonDescription: string;
    },
  ) {
    const result = await this.education.generateQuiz(
      req.user.userId,
      body.lessonTitle,
      body.lessonDescription,
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

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { StockPurchasesModule } from '../stock-purchases/stock-purchases.module';
import { StocksModule } from '../stocks/stocks.module';
import { AiController } from './ai.controller';
import { AiCompatibilityController } from './ai-compatibility.controller';
import { AiService } from './ai.service';
import { AiManagerService } from './ai-manager.service';
import { AiRuleEngineService } from './ai-rule-engine.service';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiRiskService } from './ai-risk.service';
import { AiEducationService } from './ai-education.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [
    PrismaModule,
    AnalyticsModule,
    StockPurchasesModule,
    StocksModule,
  ],
  controllers: [
    AiController,
    AiCompatibilityController,
  ],
  providers: [
    AiService,
    AiManagerService,
    AiRuleEngineService,
    AiRecommendationService,
    AiRiskService,
    AiEducationService,
    GroqProvider,
    GeminiProvider,
    OpenAiProvider,
    AnthropicProvider,
  ],
  exports: [
    AiService,
    AiManagerService,
    AiRuleEngineService,
    AiRecommendationService,
    AiRiskService,
    AiEducationService,
  ],
})
export class AiModule {}

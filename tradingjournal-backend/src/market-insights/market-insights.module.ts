import { Module } from '@nestjs/common';
import { MarketInsightsController } from './market-insights.controller';
import { MarketInsightsService } from './market-insights.service';

@Module({
  controllers: [MarketInsightsController],
  providers: [MarketInsightsService],
  exports: [MarketInsightsService],
})
export class MarketInsightsModule {}

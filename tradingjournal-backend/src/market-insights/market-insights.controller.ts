import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaidTierGuard } from '../auth/paid-tier.guard';
import { MarketInsightsService } from './market-insights.service';
import type {
  HeatmapMarket,
  HeatmapResponse,
  MonthlyMoversResponse,
  SentimentResponse,
  VolatilityMarket,
} from './market-insights.service';

@Controller('market-insights')
@UseGuards(JwtAuthGuard, PaidTierGuard)
export class MarketInsightsController {
  constructor(private readonly service: MarketInsightsService) {}

  @Get('movers')
  getMovers(
    @Query('market') market?: string,
    @Query('limit') limit?: string,
  ): MonthlyMoversResponse {
    const normalizedMarket =
      market === 'TH' || market === 'GLOBAL'
        ? (market as VolatilityMarket)
        : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : 8;
    return this.service.getMonthlyMovers(
      normalizedMarket,
      Number.isFinite(parsedLimit) ? parsedLimit : 8,
    );
  }

  @Get('heatmap')
  getHeatmap(@Query('market') market?: string): HeatmapResponse {
    const normalizedMarket: HeatmapMarket = market === 'TH' ? 'TH' : 'GLOBAL';
    return this.service.getHeatmap(normalizedMarket);
  }

  @Get('sentiment')
  getSentiment(@Query('market') market?: string): SentimentResponse {
    const normalizedMarket: HeatmapMarket = market === 'TH' ? 'TH' : 'GLOBAL';
    return this.service.getSentiment(normalizedMarket);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaidTierGuard } from '../auth/paid-tier.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsTimeframe } from './analytics.types';
import { DcaSimulatorDto } from './dto/dca-simulator.dto';

@UseGuards(JwtAuthGuard, PaidTierGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('portfolio/:portfolioId/overview')
  overview(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.overview(
      user.userId,
      portfolioId,
      from,
      to,
    );
  }

  @Get('portfolio/:portfolioId/performance')
  performance(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('timeframe') timeframe: AnalyticsTimeframe = '1M',
  ) {
    return this.analytics.performance(
      user.userId,
      portfolioId,
      timeframe,
    );
  }

  @Get('portfolio/:portfolioId/daily-pnl')
  dailyPnl(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.dailyPnl(user.userId, portfolioId, from, to);
  }

  @Get('portfolio/:portfolioId/monthly-growth')
  monthlyGrowth(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.monthlyGrowth(
      user.userId,
      portfolioId,
      from,
      to,
    );
  }

  @Get('portfolio/:portfolioId/behavioral')
  behavioral(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.behavioral(user.userId, portfolioId, from, to);
  }

  @Get('portfolio/:portfolioId/win-rate')
  winRate(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.winRateBreakdown(
      user.userId,
      portfolioId,
      from,
      to,
    );
  }

  @Get('portfolio/:portfolioId/timeline')
  timeline(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.timeline(user.userId, portfolioId, from, to);
  }

  @Get('portfolio/:portfolioId/allocation')
  allocation(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.allocation(user.userId, portfolioId);
  }

  @Get('portfolio/:portfolioId/return-vs-benchmark')
  returnVsBenchmark(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('benchmark') benchmark = 'SET',
  ) {
    return this.analytics.returnVsBenchmark(
      user.userId,
      portfolioId,
      benchmark,
    );
  }

  @Get('portfolio/:portfolioId/time-weighted-return')
  timeWeightedReturn(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.timeWeightedReturn(user.userId, portfolioId);
  }

  @Get('portfolio/:portfolioId/monthly-heatmap')
  monthlyHeatmap(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.monthlyHeatmap(user.userId, portfolioId);
  }

  @Get('portfolio/:portfolioId/performers')
  performers(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.performers(user.userId, portfolioId);
  }

  @Get('portfolio/:portfolioId/holding-period')
  holdingPeriod(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.holdingPeriod(user.userId, portfolioId);
  }

  @Get('portfolio/:portfolioId/cash-flow')
  cashFlow(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.cashFlow(user.userId, portfolioId);
  }

  @Post('dca-simulator')
  simulateDca(@Body() dto: DcaSimulatorDto) {
    return this.analytics.simulateDca(dto);
  }

  // Compatibility: old GET /analytics/portfolio/:id
  @Get('portfolio/:portfolioId')
  legacyDashboard(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return Promise.all([
      this.analytics.overview(user.userId, portfolioId, startDate, endDate),
      this.analytics.performance(user.userId, portfolioId, '1M'),
    ]).then(([overview, performance]) => ({
      ...overview,
      chartData: {
        categories: performance.map((point) => point.date),
        series: [
          {
            name: 'Equity',
            data: performance.map((point) => point.value),
          },
        ],
      },
    }));
  }

  // Compatibility: old performance-chart
  @Get('portfolio/:portfolioId/performance-chart')
  legacyPerformanceChart(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('timeframe') timeframe: AnalyticsTimeframe = '1M',
  ) {
    return this.analytics.performance(
      user.userId,
      portfolioId,
      timeframe,
    );
  }

  // Compatibility: old winrate
  @Get('portfolio/:portfolioId/winrate')
  legacyWinRate(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.winRateBreakdown(
      user.userId,
      portfolioId,
      startDate,
      endDate,
    );
  }
}

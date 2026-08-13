import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EarningsCalendarService } from './earnings-calendar.service';
import { MarketService } from './market.service';
import type { HistoricalInterval } from './market.service';

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly earnings: EarningsCalendarService,
  ) {}

  @Get('prices')
  getPrices(@Query('symbols') symbols?: string) {
    if (!symbols?.trim()) return {};
    return this.market.getQuotes(
      symbols
        .split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean),
    );
  }

  @Get('history/:symbol')
  getHistoricalPrices(
    @Param('symbol') symbol: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval: HistoricalInterval = '1d',
  ) {
    return this.market.getHistoricalPrices(
      symbol,
      new Date(from),
      new Date(to),
      interval,
    );
  }

  @Get('earnings-calendar')
  getEarningsCalendar(@Query('daysAhead') daysAhead?: string) {
    const parsed = Number(daysAhead);
    const days =
      Number.isInteger(parsed) && parsed > 0 && parsed <= 365 ? parsed : 14;
    return this.earnings.getEarningsCalendar(days);
  }

  @Get('analysis/:symbol')
  getTechnicalAnalysis(@Param('symbol') symbol: string) {
    return this.market.getTechnicalAnalysis(symbol);
  }

  @Get('cache')
  getCacheStats() {
    return this.market.getCacheStats();
  }
}

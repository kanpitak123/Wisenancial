import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvestorAnalyticsService } from './investor-analytics.service';
import { TraderAnalyticsService } from './trader-analytics.service';
import type { AnalyticsTimeframe } from './analytics.types';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import type { DCASimulatorRequest } from './advanced-analytics.types';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trader: TraderAnalyticsService,
    private readonly investor: InvestorAnalyticsService,
    private readonly advanced: AdvancedAnalyticsService,
  ) {}

  async overview(
    userId: number,
    portfolioId: number,
    from?: string,
    to?: string,
  ) {
    const type = await this.portfolioType(
      portfolioId,
      userId,
    );

    return type === PortfolioType.TRADER
      ? this.trader.overview(
          portfolioId,
          userId,
          from,
          to,
        )
      : this.investor.overview(
          portfolioId,
          userId,
        );
  }

  async performance(
    userId: number,
    portfolioId: number,
    timeframe: AnalyticsTimeframe,
  ) {
    const type = await this.portfolioType(
      portfolioId,
      userId,
    );

    return type === PortfolioType.TRADER
      ? this.trader.performance(
          portfolioId,
          userId,
          timeframe,
        )
      : this.investor.performance(
          portfolioId,
          userId,
          timeframe,
        );
  }

  async dailyPnl(
    userId: number,
    portfolioId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertType(
      portfolioId,
      userId,
      PortfolioType.TRADER,
    );

    return this.trader.dailyPnl(
      portfolioId,
      userId,
      from,
      to,
    );
  }

  async monthlyGrowth(
    userId: number,
    portfolioId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertType(
      portfolioId,
      userId,
      PortfolioType.TRADER,
    );

    return this.trader.monthlyGrowth(
      portfolioId,
      userId,
      from,
      to,
    );
  }

  async behavioral(
    userId: number,
    portfolioId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertType(
      portfolioId,
      userId,
      PortfolioType.TRADER,
    );

    return this.trader.behavioral(
      portfolioId,
      userId,
      from,
      to,
    );
  }

  async winRateBreakdown(
    userId: number,
    portfolioId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertType(
      portfolioId,
      userId,
      PortfolioType.TRADER,
    );

    return this.trader.winRateBreakdown(
      portfolioId,
      userId,
      from,
      to,
    );
  }

  async timeline(
    userId: number,
    portfolioId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertType(
      portfolioId,
      userId,
      PortfolioType.INVESTOR,
    );

    return this.investor.timeline(
      portfolioId,
      userId,
      from,
      to,
    );
  }

  async allocation(
    userId: number,
    portfolioId: number,
  ) {
    await this.assertType(
      portfolioId,
      userId,
      PortfolioType.INVESTOR,
    );

    return this.investor.allocation(
      portfolioId,
      userId,
    );
  }


  returnVsBenchmark(
    userId: number,
    portfolioId: number,
    benchmark?: string,
  ) {
    return this.advanced.returnVsBenchmark(
      userId,
      portfolioId,
      benchmark,
    );
  }

  timeWeightedReturn(userId: number, portfolioId: number) {
    return this.advanced.timeWeightedReturn(userId, portfolioId);
  }

  monthlyHeatmap(userId: number, portfolioId: number) {
    return this.advanced.monthlyHeatmap(userId, portfolioId);
  }

  performers(userId: number, portfolioId: number) {
    return this.advanced.performers(userId, portfolioId);
  }

  holdingPeriod(userId: number, portfolioId: number) {
    return this.advanced.holdingPeriod(userId, portfolioId);
  }

  cashFlow(userId: number, portfolioId: number) {
    return this.advanced.cashFlow(userId, portfolioId);
  }

  simulateDca(request: DCASimulatorRequest) {
    return this.advanced.simulateDca(request);
  }

  private async portfolioType(
    portfolioId: number,
    userId: number,
  ) {
    const portfolio =
      await this.prisma.portfolios.findFirst({
        where: {
          id: portfolioId,
          user_id: userId,
        },
        select: { portfolio_type: true },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio.portfolio_type;
  }

  private async assertType(
    portfolioId: number,
    userId: number,
    expected: PortfolioType,
  ) {
    const actual = await this.portfolioType(
      portfolioId,
      userId,
    );

    if (actual !== expected) {
      throw new BadRequestException(
        `Endpoint นี้ใช้กับ ${expected} portfolio เท่านั้น`,
      );
    }
  }
}

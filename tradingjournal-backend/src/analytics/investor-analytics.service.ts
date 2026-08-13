import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortfolioType,
  RecordStatus,
  RecordType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { StockPurchasesService } from '../stock-purchases/stock-purchases.service';
import type {
  AnalyticsTimeframe,
  PerformancePoint,
} from './analytics.types';

@Injectable()
export class InvestorAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holdings: StockPurchasesService,
    private readonly records: RecordsService,
  ) {}

  async overview(
    portfolioId: number,
    userId: number,
  ) {
    const portfolio =
      await this.assertPortfolio(
        portfolioId,
        userId,
      );

    const [
      holdingRows,
      sales,
      dividends,
      recordSummary,
      recentActivity,
    ] = await Promise.all([
      this.holdings.getHoldings(
        portfolioId,
        userId,
      ),
      this.prisma.stock_sales.aggregate({
        where: {
          portfolio_id: portfolioId,
        },
        _sum: {
          realized_pnl: true,
          net_proceeds: true,
        },
        _count: true,
      }),
      this.prisma.dividends.aggregate({
        where: {
          portfolio_id: portfolioId,
          status:
            RecordStatus.ACTIVE,
        },
        _sum: {
          net_amount: true,
        },
      }),
      this.records.getSummary(
        portfolioId,
        userId,
      ),
      this.records.findAll(
        portfolioId,
        userId,
        {
          limit: 20,
        },
      ),
    ]);

    const investedCost =
      holdingRows.reduce(
        (sum, item) =>
          sum +
          Number(
            item.cost_basis ?? 0,
          ),
        0,
      );

    const marketValue =
      holdingRows.reduce(
        (sum, item) =>
          sum +
          Number(
            item.market_value ??
              item.cost_basis ??
              0,
          ),
        0,
      );

    const unrealizedPnl =
      holdingRows.reduce(
        (sum, item) =>
          sum +
          Number(
            item.unrealized_pnl ??
              0,
          ),
        0,
      );

    const realizedPnl = Number(
      sales._sum.realized_pnl ?? 0,
    );

    const dividendIncome = Number(
      dividends._sum.net_amount ?? 0,
    );

    const cash = Number(
      portfolio.current_balance,
    );
    const portfolioValue =
      cash + marketValue;

    const contributionTypes =
      new Set<RecordType>([
        RecordType.DEPOSIT,
        RecordType.WITHDRAW,
        RecordType.TRANSFER_IN,
        RecordType.TRANSFER_OUT,
      ]);

    const netContributions =
      Object.entries(
        recordSummary.totals,
      ).reduce(
        (sum, [type, row]) => {
          if (
            !contributionTypes.has(
              type as RecordType,
            )
          ) {
            return sum;
          }

          return (
            sum +
            Number(row?.amount ?? 0)
          );
        },
        0,
      );

    const contributedCapital =
      Number(
        portfolio.initial_balance,
      ) + netContributions;

    const investmentGain =
      portfolioValue -
      contributedCapital;

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        type: 'INVESTOR' as const,
        currency: portfolio.currency,
      },
      summary: {
        current_value:
          portfolioValue,
        cash,
        invested_cost:
          investedCost,
        holdings_value:
          marketValue,
        realized_pnl:
          realizedPnl,
        unrealized_pnl:
          unrealizedPnl,
        dividend_income:
          dividendIncome,
        total_pnl:
          realizedPnl +
          unrealizedPnl +
          dividendIncome,
        total_pnl_percent:
          contributedCapital > 0
            ? (investmentGain /
                contributedCapital) *
              100
            : 0,
        contributed_capital:
          contributedCapital,
        investment_gain:
          investmentGain,
        open_holdings:
          holdingRows.length,
        closed_sales:
          sales._count,
      },
      holdings: holdingRows,
      recent_activity:
        recentActivity,
    };
  }

  async performance(
    portfolioId: number,
    userId: number,
    timeframe: AnalyticsTimeframe = '1M',
  ): Promise<PerformancePoint[]> {
    const portfolio =
      await this.assertPortfolio(
        portfolioId,
        userId,
      );

    const start =
      this.timeframeStart(timeframe);

    const records =
      await this.records.findAll(
        portfolioId,
        userId,
        {
          limit: 10_000,
          from:
            start ?? undefined,
        },
      );

    let cash = Number(
      portfolio.initial_balance,
    );

    const points: PerformancePoint[] = [
      {
        date:
          start?.toISOString() ??
          'START',
        value: this.round(cash),
        event: 'START',
      },
    ];

    for (
      const record of [
        ...records,
      ].reverse()
    ) {
      const amount = Number(
        record.amount,
      );
      cash += amount;

      points.push({
        date:
          record.occurred_at,
        value:
          this.round(cash),
        event: record.type,
        amount:
          this.round(amount),
      });
    }

    return points;
  }

  async timeline(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertPortfolio(
      portfolioId,
      userId,
    );

    return this.records.findAll(
      portfolioId,
      userId,
      {
        limit: 500,
        from: from
          ? new Date(from)
          : undefined,
        to: to
          ? new Date(to)
          : undefined,
      },
    );
  }

  async allocation(
    portfolioId: number,
    userId: number,
  ) {
    await this.assertPortfolio(
      portfolioId,
      userId,
    );

    const holdings =
      await this.holdings.getHoldings(
        portfolioId,
        userId,
      );

    const total =
      holdings.reduce(
        (sum, item) =>
          sum +
          Number(
            item.market_value ??
              item.cost_basis ??
              0,
          ),
        0,
      );

    return holdings.map(
      (item) => {
        const value = Number(
          item.market_value ??
            item.cost_basis ??
            0,
        );

        return {
          symbol: item.symbol,
          value,
          weight:
            total > 0
              ? (value / total) *
                100
              : 0,
        };
      },
    );
  }

  private async assertPortfolio(
    id: number,
    userId: number,
  ) {
    const portfolio =
      await this.prisma.portfolios.findFirst({
        where: {
          id,
          user_id: userId,
          portfolio_type:
            PortfolioType.INVESTOR,
        },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ Investor portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private timeframeStart(
    timeframe: AnalyticsTimeframe,
  ): Date | null {
    if (timeframe === 'ALL') {
      return null;
    }

    const date = new Date();

    if (timeframe === '1W') {
      date.setDate(
        date.getDate() - 7,
      );
    } else if (
      timeframe.endsWith('M')
    ) {
      date.setMonth(
        date.getMonth() -
          Number(
            timeframe.slice(0, -1),
          ),
      );
    } else {
      date.setFullYear(
        date.getFullYear() - 1,
      );
    }

    return date;
  }

  private round(
    value: number,
  ): number {
    return Number(
      value.toFixed(2),
    );
  }
}

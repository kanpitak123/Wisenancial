import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortfolioType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalyticsTimeframe,
  PerformancePoint,
} from './analytics.types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type TradeRow = {
  id: number;
  pair: string | null;
  trade_type: string;
  pnl: Prisma.Decimal | null;
  result_status: string | null;
  opened_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  strategy: string | null;
  emotion: string | null;
  trend: string | null;
  entry_reason: string | null;
};

@Injectable()
export class TraderAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    const portfolio = await this.assertPortfolio(
      portfolioId,
      userId,
    );
    const trades = await this.getClosedTrades(
      portfolioId,
      from,
      to,
    );

    const pnl = trades.map((trade) =>
      Number(trade.pnl ?? 0),
    );
    const wins = pnl.filter((value) => value > 0).length;
    const losses = pnl.filter((value) => value < 0).length;
    const breakeven = pnl.filter(
      (value) => value === 0,
    ).length;
    const totalPnl = pnl.reduce(
      (sum, value) => sum + value,
      0,
    );

    const grossProfit = pnl
      .filter((value) => value > 0)
      .reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(
      pnl
        .filter((value) => value < 0)
        .reduce((sum, value) => sum + value, 0),
    );

    const totalTrades = trades.length;
    const initialBalance = Number(
      portfolio.initial_balance,
    );
    const currentBalance = Number(
      portfolio.current_balance,
    );

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        type: 'TRADER' as const,
        currency: portfolio.currency,
      },
      summary: {
        current_value: currentBalance,
        initial_balance: initialBalance,
        total_pnl: totalPnl,
        total_pnl_percent:
          initialBalance > 0
            ? (totalPnl / initialBalance) * 100
            : 0,
        realized_pnl: totalPnl,
        unrealized_pnl: 0,
        total_trades: totalTrades,
        wins,
        losses,
        breakeven,
        win_rate:
          totalTrades > 0
            ? (wins / totalTrades) * 100
            : 0,
        profit_factor:
          grossLoss > 0
            ? grossProfit / grossLoss
            : grossProfit > 0
              ? null
              : 0,
        average_pnl:
          totalTrades > 0
            ? totalPnl / totalTrades
            : 0,
      },
    };
  }

  async performance(
    portfolioId: number,
    userId: number,
    timeframe: AnalyticsTimeframe = '1M',
  ): Promise<PerformancePoint[]> {
    const portfolio = await this.assertPortfolio(
      portfolioId,
      userId,
    );

    const start = this.timeframeStart(timeframe);
    const allTrades = await this.getClosedTrades(
      portfolioId,
    );

    let value = Number(portfolio.initial_balance);
    for (const trade of allTrades) {
      const date = this.tradeDate(trade);
      if (start && date < start) {
        value += Number(trade.pnl ?? 0);
      }
    }

    const points: PerformancePoint[] = [
      {
        date: start?.toISOString() ?? 'START',
        value: this.round(value),
        event: 'START',
      },
    ];

    for (const trade of allTrades) {
      const date = this.tradeDate(trade);
      if (start && date < start) continue;

      const amount = Number(trade.pnl ?? 0);
      value += amount;

      points.push({
        date,
        value: this.round(value),
        event: 'TRADE_PNL',
        amount: this.round(amount),
      });
    }

    return points;
  }

  async dailyPnl(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertPortfolio(portfolioId, userId);
    const trades = await this.getClosedTrades(
      portfolioId,
      from,
      to,
    );

    return trades.reduce<Record<string, number>>(
      (result, trade) => {
        const date = this.tradeDate(trade);
        const key = this.dateKey(date);
        result[key] =
          (result[key] ?? 0) +
          Number(trade.pnl ?? 0);
        return result;
      },
      {},
    );
  }

  async monthlyGrowth(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    const portfolio = await this.assertPortfolio(
      portfolioId,
      userId,
    );
    const trades = await this.getClosedTrades(
      portfolioId,
      from,
      to,
    );

    const grouped = new Map<
      string,
      {
        label: string;
        pnl: number;
        count: number;
        wins: number;
        losses: number;
      }
    >();

    for (const trade of trades) {
      const date = this.tradeDate(trade);
      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}`;
      const current = grouped.get(key) ?? {
        label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
        pnl: 0,
        count: 0,
        wins: 0,
        losses: 0,
      };
      const pnl = Number(trade.pnl ?? 0);
      current.pnl += pnl;
      current.count++;
      if (pnl > 0) current.wins++;
      else if (pnl < 0) current.losses++;
      grouped.set(key, current);
    }

    let cumulative = 0;
    const initial = Number(portfolio.initial_balance);

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => {
        cumulative += row.pnl;
        return {
          month: row.label,
          label: row.label,
          pnl: this.round(row.pnl),
          cumulative_pnl: this.round(cumulative),
          growth_pct:
            initial > 0
              ? this.round(
                  (row.pnl / initial) * 100,
                )
              : 0,
          trade_count: row.count,
          win_count: row.wins,
          loss_count: row.losses,
        };
      });
  }

  async behavioral(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertPortfolio(portfolioId, userId);
    const trades = await this.getClosedTrades(
      portfolioId,
      from,
      to,
    );

    return {
      strategy: this.groupStats(
        trades,
        (trade) => trade.strategy,
      ),
      emotion: this.groupStats(
        trades,
        (trade) => trade.emotion,
      ),
      trend: this.groupStats(
        trades,
        (trade) => trade.trend,
      ),
      entry_reason: this.groupStats(
        trades,
        (trade) => trade.entry_reason,
      ),
      time_slot: this.groupStats(
        trades,
        (trade) =>
          this.timeSlot(this.tradeDate(trade)),
      ),
    };
  }

  async winRateBreakdown(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertPortfolio(portfolioId, userId);
    const trades = await this.getClosedTrades(
      portfolioId,
      from,
      to,
    );

    const position = this.groupWinRate(
      trades,
      (trade) => trade.trade_type,
      'position',
    );
    const slot = this.groupWinRate(
      trades,
      (trade) =>
        this.timeSlot(this.tradeDate(trade)),
      'slot',
    );
    const day = this.groupWinRate(
      trades,
      (trade) =>
        DAYS[this.tradeDate(trade).getDay()],
      'day',
    );
    const month = this.groupWinRate(
      trades,
      (trade) =>
        MONTHS[this.tradeDate(trade).getMonth()],
      'month',
    );

    return {
      by_position: position,
      by_slot: slot,
      by_day: day,
      by_month: month,
      pnl_by_slot: this.groupPnl(
        trades,
        (trade) => this.timeSlot(this.tradeDate(trade)),
        'slot',
      ),
      pnl_by_day: this.groupPnl(
        trades,
        (trade) => DAYS[this.tradeDate(trade).getDay()],
        'day',
      ),
      pnl_by_month: this.groupPnl(
        trades,
        (trade) => MONTHS[this.tradeDate(trade).getMonth()],
        'month',
      ),
    };
  }


  private groupPnl(
    trades: TradeRow[],
    keyOf: (trade: TradeRow) => string,
    keyName: string,
  ) {
    const grouped = new Map<
      string,
      { profit: number; loss: number; count: number }
    >();

    for (const trade of trades) {
      const key = keyOf(trade);
      const current = grouped.get(key) ?? {
        profit: 0,
        loss: 0,
        count: 0,
      };
      const pnl = Number(trade.pnl ?? 0);
      current.count++;
      if (pnl >= 0) current.profit += pnl;
      else current.loss += pnl;
      grouped.set(key, current);
    }

    return [...grouped.entries()].map(([key, row]) => ({
      [keyName]: key,
      profit: this.round(row.profit),
      loss: this.round(row.loss),
      net: this.round(row.profit + row.loss),
      total_pnl: this.round(row.profit + row.loss),
      trade_count: row.count,
    }));
  }

  private groupStats(
    trades: TradeRow[],
    keyOf: (trade: TradeRow) => string | null,
  ) {
    const grouped = new Map<
      string,
      {
        wins: number;
        losses: number;
        totalPnl: number;
        count: number;
      }
    >();

    for (const trade of trades) {
      const key = keyOf(trade) || 'ไม่มีข้อมูล';
      const current = grouped.get(key) ?? {
        wins: 0,
        losses: 0,
        totalPnl: 0,
        count: 0,
      };
      const pnl = Number(trade.pnl ?? 0);
      current.count++;
      current.totalPnl += pnl;
      if (pnl > 0) current.wins++;
      else if (pnl < 0) current.losses++;
      grouped.set(key, current);
    }

    return [...grouped.entries()]
      .map(([label, row]) => ({
        label,
        win_count: row.wins,
        loss_count: row.losses,
        total_pnl: this.round(row.totalPnl),
        avg_pnl:
          row.count > 0
            ? this.round(
                row.totalPnl / row.count,
              )
            : 0,
        win_rate:
          row.count > 0
            ? this.round(
                (row.wins / row.count) * 100,
              )
            : 0,
      }))
      .sort(
        (a, b) => b.total_pnl - a.total_pnl,
      );
  }

  private groupWinRate(
    trades: TradeRow[],
    keyOf: (trade: TradeRow) => string,
    keyName: string,
  ) {
    const grouped = new Map<
      string,
      { wins: number; losses: number }
    >();

    for (const trade of trades) {
      const key = keyOf(trade);
      const current = grouped.get(key) ?? {
        wins: 0,
        losses: 0,
      };
      const pnl = Number(trade.pnl ?? 0);
      if (pnl > 0) current.wins++;
      else if (pnl < 0) current.losses++;
      grouped.set(key, current);
    }

    return [...grouped.entries()].map(
      ([key, row]) => {
        const total = row.wins + row.losses;
        return {
          [keyName]: key,
          win: row.wins,
          loss: row.losses,
          win_rate:
            total > 0
              ? this.round(
                  (row.wins / total) * 100,
                )
              : 0,
        };
      },
    );
  }

  private async getClosedTrades(
    portfolioId: number,
    from?: string,
    to?: string,
  ): Promise<TradeRow[]> {
    return this.prisma.trades.findMany({
      where: {
        portfolio_id: portfolioId,
        result_status: {
          in: ['WIN', 'LOSS', 'BREAKEVEN'],
        },
        ...(from || to
          ? {
              closed_at: {
                ...(from
                  ? { gte: new Date(from) }
                  : {}),
                ...(to
                  ? { lte: new Date(to) }
                  : {}),
              },
            }
          : {}),
      },
      orderBy: [
        { closed_at: 'asc' },
        { id: 'asc' },
      ],
    }) as unknown as TradeRow[];
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
          portfolio_type: PortfolioType.TRADER,
        },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ Trader portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private tradeDate(trade: TradeRow): Date {
    return (
      trade.closed_at ??
      trade.opened_at ??
      trade.created_at
    );
  }

  private dateKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(
        2,
        '0',
      ),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private timeSlot(date: Date): string {
    const startMinutes =
      date.getHours() * 60 +
      (date.getMinutes() >= 30 ? 30 : 0);
    const endMinutes = startMinutes + 30;
    const format = (minutes: number) =>
      `${String(
        Math.floor(minutes / 60) % 24,
      ).padStart(2, '0')}:${String(
        minutes % 60,
      ).padStart(2, '0')}`;

    return `${format(startMinutes)}-${format(
      endMinutes,
    )}`;
  }

  private timeframeStart(
    timeframe: AnalyticsTimeframe,
  ): Date | null {
    if (timeframe === 'ALL') return null;

    const date = new Date();
    if (timeframe === '1W') {
      date.setDate(date.getDate() - 7);
    } else if (timeframe.endsWith('M')) {
      date.setMonth(
        date.getMonth() -
          Number(timeframe.slice(0, -1)),
      );
    } else {
      date.setFullYear(date.getFullYear() - 1);
    }

    return date;
  }

  private round(value: number): number {
    return Number(value.toFixed(2));
  }
}

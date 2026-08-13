import { Injectable } from '@nestjs/common';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard() {
    const users = await this.prisma.users.findMany({
      select: {
        username: true,
        full_name: true,
        portfolios: {
          where: {
            portfolio_type: PortfolioType.TRADER,
          },
          select: {
            initial_balance: true,
            current_balance: true,
            trades: {
              select: {
                pnl: true,
                result_status: true,
              },
            },
          },
        },
      },
    });

    return users
      .map((user) => {
        const trades = user.portfolios.flatMap(
          (portfolio) => portfolio.trades,
        );
        const totalTrades = trades.length;
        const winTrades = trades.filter(
          (trade) => trade.result_status === 'WIN',
        ).length;
        const totalPnl = trades.reduce(
          (sum, trade) => sum + Number(trade.pnl ?? 0),
          0,
        );
        const initialBalance = user.portfolios.reduce(
          (sum, portfolio) =>
            sum + Number(portfolio.initial_balance),
          0,
        );
        const currentBalance = user.portfolios.reduce(
          (sum, portfolio) =>
            sum + Number(portfolio.current_balance),
          0,
        );

        return {
          username:
            user.username || user.full_name || 'Anonymous Trader',
          initial_balance: initialBalance,
          current_balance: currentBalance,
          win_rate:
            totalTrades > 0
              ? Math.round((winTrades / totalTrades) * 100)
              : null,
          total_pnl: totalPnl,
        };
      })
      .sort((a, b) => b.total_pnl - a.total_pnl)
      .slice(0, 100);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  mkdir,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
import {
  PortfolioType,
  Prisma,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ShareContentType,
  SharePlatform,
} from './dto/share-platform.dto';

type MonthlyPerformance = {
  month: string;
  pnl: number;
};

type RiskMetrics = {
  sharpe_ratio: number;
  max_drawdown: number;
  volatility: number;
};

type PortfolioRow = {
  id: number;
  user_id: number | null;
  name: string;
  initial_balance: Prisma.Decimal;
  current_balance: Prisma.Decimal;
  currency: string | null;
  portfolio_type: PortfolioType;
  investor_cost_method: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  created_at: Date | null;
  updated_at: Date | null;
};

@Injectable()
export class ShareStatisticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getShareStatistics(
    userId: number,
    portfolioId: number,
  ) {
    const portfolio =
      await this.requirePortfolio(
        userId,
        portfolioId,
      );

    return portfolio.portfolio_type ===
      PortfolioType.TRADER
      ? this.getTraderStatistics(
          portfolio,
        )
      : this.getInvestorStatistics(
          portfolio,
        );
  }

  async generateShareMessage(
    userId: number,
    portfolioId: number,
    platform: SharePlatform,
  ) {
    const stats =
      await this.getShareStatistics(
        userId,
        portfolioId,
      );

    const message =
      stats.portfolio_type ===
      PortfolioType.TRADER
        ? this.buildTraderMessage(
            stats,
            platform,
          )
        : this.buildInvestorMessage(
            stats,
            platform,
          );

    return {
      message,
      stats,
      platform,
    };
  }

  async generateShareImage(
    userId: number,
    portfolioId: number,
  ) {
    const stats =
      await this.getShareStatistics(
        userId,
        portfolioId,
      );

    const fileName =
      `${portfolioId}-${Date.now()}-${randomUUID()}.svg`;
    const relativePath =
      `/uploads/share/${fileName}`;
    const outputDirectory =
      join(
        process.cwd(),
        'uploads',
        'share',
      );
    const outputPath =
      join(
        outputDirectory,
        fileName,
      );

    await mkdir(
      outputDirectory,
      {
        recursive: true,
      },
    );

    const svg =
      this.renderShareCardSvg(stats);

    await writeFile(
      outputPath,
      svg,
      'utf8',
    );

    const apiBaseUrl = (
      process.env.API_PUBLIC_URL ??
      'http://localhost:3000'
    ).replace(/\/$/, '');

    return {
      image_url:
        `${apiBaseUrl}${relativePath}`,
      relative_url:
        relativePath,
      mime_type:
        'image/svg+xml',
      file_name:
        fileName,
      template:
        stats.portfolio_type ===
        PortfolioType.TRADER
          ? 'TRADER_PERFORMANCE'
          : 'INVESTOR_PERFORMANCE',
      generated_at:
        new Date(),
      stats_for_image: {
        title:
          stats.portfolio_info.name,
        portfolio_type:
          stats.portfolio_type,
        currency:
          stats.portfolio_info.currency,
        return:
          `${stats.performance_summary.total_return}%`,
        pnl:
          stats.performance_summary
            .total_pnl,
        primary_metric:
          stats.portfolio_type ===
          PortfolioType.TRADER
            ? {
                label:
                  'Win Rate',
                value:
                  `${stats.performance_summary.win_rate}%`,
              }
            : {
                label:
                  'Holdings',
                value:
                  stats.performance_summary
                    .open_holdings,
              },
      },
    };
  }

  async logShareActivity(
    userId: number,
    portfolioId: number,
    platform: SharePlatform,
    message?: string,
    contentType: ShareContentType = 'MESSAGE',
    imageUrl?: string,
    publicUrl?: string,
  ) {
    const portfolio =
      await this.requirePortfolio(
        userId,
        portfolioId,
      );

    if (
      !message &&
      !imageUrl &&
      !publicUrl
    ) {
      throw new BadRequestException(
        'ต้องมี message, image_url หรือ public_url อย่างน้อยหนึ่งรายการ',
      );
    }

    const stats =
      await this.getShareStatistics(
        userId,
        portfolioId,
      );

    const log =
      await this.prisma.share_logs.create({
        data: {
          user_id: userId,
          portfolio_id:
            portfolioId,
          portfolio_type:
            portfolio.portfolio_type,
          platform,
          content_type:
            contentType,
          message:
            message?.trim() ||
            null,
          image_url:
            imageUrl?.trim() ||
            null,
          public_url:
            publicUrl?.trim() ||
            null,
          stats_snapshot:
            this.toJson(stats),
        },
      });

    return {
      success: true,
      persisted: true,
      log,
    };
  }

  async getShareLogs(
    userId: number,
    portfolioId: number,
    limit = 20,
  ) {
    await this.requirePortfolio(
      userId,
      portfolioId,
    );

    const safeLimit =
      Math.min(
        100,
        Math.max(1, limit),
      );

    return this.prisma.share_logs.findMany({
      where: {
        user_id: userId,
        portfolio_id:
          portfolioId,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: safeLimit,
    });
  }

  async getSocialSharingData(
    userId: number,
    portfolioId: number,
  ) {
    const stats =
      await this.getShareStatistics(
        userId,
        portfolioId,
      );

    const [
      twitter,
      facebook,
      linkedin,
    ] = await Promise.all([
      this.generateShareMessage(
        userId,
        portfolioId,
        'twitter',
      ),
      this.generateShareMessage(
        userId,
        portfolioId,
        'facebook',
      ),
      this.generateShareMessage(
        userId,
        portfolioId,
        'linkedin',
      ),
    ]);

    const appUrl = (
      process.env.FRONTEND_URL ??
      'http://localhost:9000'
    ).replace(/\/$/, '');

    const publicUrl =
      `${appUrl}/share/portfolio/${portfolioId}`;

    return {
      statistics: stats,
      share_messages: {
        twitter: twitter.message,
        facebook: facebook.message,
        linkedin: linkedin.message,
      },
      share_urls: {
        twitter:
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(
            twitter.message,
          )}`,
        facebook:
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            publicUrl,
          )}&quote=${encodeURIComponent(
            facebook.message,
          )}`,
        linkedin:
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
            publicUrl,
          )}`,
      },
      public_url: publicUrl,
    };
  }

  private async getTraderStatistics(
    portfolio: PortfolioRow,
  ) {
    const trades =
      await this.prisma.trades.findMany({
        where: {
          portfolio_id: portfolio.id,
          result_status: {
            in: [
              'WIN',
              'LOSS',
              'BREAKEVEN',
            ],
          },
        },
        orderBy: [
          { closed_at: 'asc' },
          { created_at: 'asc' },
        ],
        select: {
          pnl: true,
          result_status: true,
          closed_at: true,
          created_at: true,
        },
      });

    const pnlValues = trades.map(
      (trade) =>
        Number(trade.pnl ?? 0),
    );

    const positive = pnlValues.filter(
      (value) => value > 0,
    );
    const negative = pnlValues.filter(
      (value) => value < 0,
    );

    const totalProfit =
      this.sum(positive);
    const totalLoss = Math.abs(
      this.sum(negative),
    );
    const totalPnl =
      this.sum(pnlValues);

    const firstDate =
      this.firstValidDate(
        trades.map(
          (trade) =>
            trade.closed_at ??
            trade.created_at,
        ),
      );
    const lastDate =
      this.lastValidDate(
        trades.map(
          (trade) =>
            trade.closed_at ??
            trade.created_at,
        ),
      );

    return {
      portfolio_type:
        PortfolioType.TRADER,
      portfolio_info:
        this.portfolioInfo(portfolio),
      performance_summary: {
        total_trades:
          trades.length,
        winning_trades:
          positive.length,
        losing_trades:
          negative.length,
        win_rate:
          this.percent(
            positive.length,
            trades.length,
          ),
        total_return:
          this.totalReturn(portfolio),
        total_pnl:
          this.round(totalPnl),
        active_days:
          this.daysBetween(
            firstDate,
            lastDate,
          ),
        open_holdings: 0,
      },
      profitability_metrics: {
        max_profit:
          this.round(
            positive.length
              ? Math.max(...positive)
              : 0,
          ),
        max_loss:
          this.round(
            negative.length
              ? Math.abs(
                  Math.min(
                    ...negative,
                  ),
                )
              : 0,
          ),
        average_profit:
          this.average(positive),
        average_loss:
          this.round(
            Math.abs(
              this.average(
                negative,
              ),
            ),
          ),
        profit_factor:
          totalLoss > 0
            ? this.round(
                totalProfit /
                  totalLoss,
              )
            : totalProfit > 0
              ? null
              : 0,
      },
      risk_metrics:
        this.calculateRiskMetrics(
          pnlValues,
          Number(
            portfolio.initial_balance,
          ),
        ),
      monthly_performance:
        this.groupMonthly(
          trades.map((trade) => ({
            date:
              trade.closed_at ??
              trade.created_at,
            value:
              Number(
                trade.pnl ?? 0,
              ),
          })),
        ),
      current_holdings: [],
    };
  }

  private async getInvestorStatistics(
    portfolio: PortfolioRow,
  ) {
    const [
      purchases,
      sales,
      dividends,
      prices,
    ] = await Promise.all([
      this.prisma.stock_purchases.findMany({
        where: {
          portfolio_id: portfolio.id,
        },
        orderBy: {
          purchase_date: 'asc',
        },
      }),
      this.prisma.stock_sales.findMany({
        where: {
          portfolio_id: portfolio.id,
        },
        orderBy: {
          sold_date: 'asc',
        },
      }),
      this.prisma.dividends.findMany({
        where: {
          portfolio_id: portfolio.id,
          status:
            RecordStatus.ACTIVE,
        },
        orderBy: {
          payment_date: 'asc',
        },
      }),
      this.prisma.market_prices.findMany({
        where: {
          currency:
            portfolio.currency ??
            'USD',
        },
      }),
    ]);

    const priceMap = new Map(
      prices.map((price) => [
        price.symbol,
        Number(price.price),
      ]),
    );

    const holdingsMap =
      new Map<
        string,
        {
          symbol: string;
          shares: number;
          total_cost: number;
          market_value: number;
          unrealized_pnl: number;
          average_cost: number;
        }
      >();

    for (const purchase of purchases) {
      const remaining = Number(
        purchase.remaining_shares,
      );

      if (remaining <= 0) {
        continue;
      }

      const symbol =
        purchase.stock_symbol;
      const costPerShare = Number(
        purchase.purchase_price,
      );
      const currentPrice =
        priceMap.get(symbol) ??
        costPerShare;

      const existing =
        holdingsMap.get(symbol) ?? {
          symbol,
          shares: 0,
          total_cost: 0,
          market_value: 0,
          unrealized_pnl: 0,
          average_cost: 0,
        };

      existing.shares += remaining;
      existing.total_cost +=
        remaining * costPerShare;
      existing.market_value +=
        remaining * currentPrice;
      existing.unrealized_pnl +=
        remaining *
        (currentPrice -
          costPerShare);

      holdingsMap.set(
        symbol,
        existing,
      );
    }

    const holdings = [
      ...holdingsMap.values(),
    ].map((holding) => ({
      ...holding,
      shares:
        this.round(
          holding.shares,
        ),
      total_cost:
        this.round(
          holding.total_cost,
        ),
      market_value:
        this.round(
          holding.market_value,
        ),
      unrealized_pnl:
        this.round(
          holding.unrealized_pnl,
        ),
      average_cost:
        holding.shares > 0
          ? this.round(
              holding.total_cost /
                holding.shares,
            )
          : 0,
    }));

    const realizedPnl = this.sum(
      sales.map((sale) =>
        Number(
          sale.realized_pnl,
        ),
      ),
    );
    const dividendIncome =
      this.sum(
        dividends.map((dividend) =>
          Number(
            dividend.net_amount,
          ),
        ),
      );
    const unrealizedPnl =
      this.sum(
        holdings.map(
          (holding) =>
            holding.unrealized_pnl,
        ),
      );

    const totalPnl =
      realizedPnl +
      dividendIncome +
      unrealizedPnl;

    const initialBalance = Number(
      portfolio.initial_balance,
    );
    const investorTotalReturn =
      initialBalance > 0
        ? this.round(
            (totalPnl /
              initialBalance) *
              100,
          )
        : 0;

    const firstDate =
      this.firstValidDate([
        ...purchases.map(
          (item) =>
            item.purchase_date,
        ),
        ...sales.map(
          (item) =>
            item.sold_date,
        ),
      ]);
    const lastDate =
      this.lastValidDate([
        ...purchases.map(
          (item) =>
            item.purchase_date,
        ),
        ...sales.map(
          (item) =>
            item.sold_date,
        ),
        ...dividends.map(
          (item) =>
            item.payment_date,
        ),
      ]);

    return {
      portfolio_type:
        PortfolioType.INVESTOR,
      portfolio_info:
        this.portfolioInfo(portfolio),
      performance_summary: {
        total_trades:
          sales.length,
        winning_trades:
          sales.filter(
            (sale) =>
              Number(
                sale.realized_pnl,
              ) > 0,
          ).length,
        losing_trades:
          sales.filter(
            (sale) =>
              Number(
                sale.realized_pnl,
              ) < 0,
          ).length,
        win_rate:
          this.percent(
            sales.filter(
              (sale) =>
                Number(
                  sale.realized_pnl,
                ) > 0,
            ).length,
            sales.length,
          ),
        total_return:
          investorTotalReturn,
        total_pnl:
          this.round(totalPnl),
        realized_pnl:
          this.round(
            realizedPnl,
          ),
        unrealized_pnl:
          this.round(
            unrealizedPnl,
          ),
        dividend_income:
          this.round(
            dividendIncome,
          ),
        active_days:
          this.daysBetween(
            firstDate,
            lastDate,
          ),
        open_holdings:
          holdings.length,
      },
      profitability_metrics: {
        best_sale:
          this.round(
            Math.max(
              0,
              ...sales.map(
                (sale) =>
                  Number(
                    sale.realized_pnl,
                  ),
              ),
            ),
          ),
        worst_sale:
          this.round(
            Math.min(
              0,
              ...sales.map(
                (sale) =>
                  Number(
                    sale.realized_pnl,
                  ),
              ),
            ),
          ),
        average_realized_pnl:
          this.average(
            sales.map((sale) =>
              Number(
                sale.realized_pnl,
              ),
            ),
          ),
      },
      risk_metrics:
        this.calculateRiskMetrics(
          sales.map((sale) =>
            Number(
              sale.realized_pnl,
            ),
          ),
          Number(
            portfolio.initial_balance,
          ),
        ),
      monthly_performance:
        this.groupMonthly([
          ...sales.map((sale) => ({
            date: sale.sold_date,
            value: Number(
              sale.realized_pnl,
            ),
          })),
          ...dividends.map(
            (dividend) => ({
              date:
                dividend.payment_date,
              value: Number(
                dividend.net_amount,
              ),
            }),
          ),
        ]),
      current_holdings: holdings,
    };
  }

  private buildTraderMessage(
    stats: any,
    platform: SharePlatform,
  ) {
    const summary =
      stats.performance_summary;

    if (platform === 'twitter') {
      return (
        `📈 Trader Portfolio Update\n` +
        `${stats.portfolio_info.name}\n` +
        `Return: ${summary.total_return}%\n` +
        `Win rate: ${summary.win_rate}%\n` +
        `Closed trades: ${summary.total_trades}\n` +
        `PnL: ${summary.total_pnl} ${stats.portfolio_info.currency}\n\n` +
        `#Trading #TradingJournal #Wisenancial`
      );
    }

    if (platform === 'facebook') {
      return (
        `📊 Trading Portfolio Performance\n\n` +
        `Portfolio: ${stats.portfolio_info.name}\n` +
        `Total return: ${summary.total_return}%\n` +
        `Win rate: ${summary.win_rate}%\n` +
        `Closed trades: ${summary.total_trades}\n` +
        `PnL: ${summary.total_pnl} ${stats.portfolio_info.currency}\n` +
        `Active period: ${summary.active_days} days\n\n` +
        `Performance tracked with Wisenancial.`
      );
    }

    return (
      `Trading Portfolio Review\n\n` +
      `Portfolio: ${stats.portfolio_info.name}\n` +
      `Total return: ${summary.total_return}%\n` +
      `Win rate: ${summary.win_rate}%\n` +
      `Profit factor: ${stats.profitability_metrics.profit_factor ?? 'N/A'}\n` +
      `Closed trades: ${summary.total_trades}\n\n` +
      `Structured performance tracking through a trading journal.`
    );
  }

  private buildInvestorMessage(
    stats: any,
    platform: SharePlatform,
  ) {
    const summary =
      stats.performance_summary;

    if (platform === 'twitter') {
      return (
        `📊 Investor Portfolio Update\n` +
        `${stats.portfolio_info.name}\n` +
        `Return: ${summary.total_return}%\n` +
        `Total PnL: ${summary.total_pnl} ${stats.portfolio_info.currency}\n` +
        `Holdings: ${summary.open_holdings}\n` +
        `Dividends: ${summary.dividend_income} ${stats.portfolio_info.currency}\n\n` +
        `#Investing #Portfolio #Wisenancial`
      );
    }

    if (platform === 'facebook') {
      return (
        `📈 Investment Portfolio Performance\n\n` +
        `Portfolio: ${stats.portfolio_info.name}\n` +
        `Total return: ${summary.total_return}%\n` +
        `Realized PnL: ${summary.realized_pnl} ${stats.portfolio_info.currency}\n` +
        `Unrealized PnL: ${summary.unrealized_pnl} ${stats.portfolio_info.currency}\n` +
        `Dividend income: ${summary.dividend_income} ${stats.portfolio_info.currency}\n` +
        `Current holdings: ${summary.open_holdings}\n\n` +
        `Portfolio tracked with Wisenancial.`
      );
    }

    return (
      `Investment Portfolio Review\n\n` +
      `Portfolio: ${stats.portfolio_info.name}\n` +
      `Total return: ${summary.total_return}%\n` +
      `Total PnL: ${summary.total_pnl} ${stats.portfolio_info.currency}\n` +
      `Dividend income: ${summary.dividend_income} ${stats.portfolio_info.currency}\n` +
      `Current holdings: ${summary.open_holdings}\n\n` +
      `Consistent portfolio tracking and long-term review.`
    );
  }

  private renderShareCardSvg(
    stats: any,
  ): string {
    const portfolioName =
      this.escapeXml(
        stats.portfolio_info.name,
      );
    const portfolioType =
      stats.portfolio_type;
    const currency =
      this.escapeXml(
        stats.portfolio_info.currency,
      );
    const summary =
      stats.performance_summary;
    const returnValue =
      Number(
        summary.total_return ?? 0,
      );
    const pnlValue =
      Number(
        summary.total_pnl ?? 0,
      );
    const positive =
      returnValue >= 0;
    const accent =
      positive
        ? '#17A673'
        : '#D84A4A';

    const primaryLabel =
      portfolioType ===
      PortfolioType.TRADER
        ? 'WIN RATE'
        : 'HOLDINGS';
    const primaryValue =
      portfolioType ===
      PortfolioType.TRADER
        ? `${summary.win_rate}%`
        : String(
            summary.open_holdings,
          );

    const secondaryLabel =
      portfolioType ===
      PortfolioType.TRADER
        ? 'CLOSED TRADES'
        : 'DIVIDEND INCOME';
    const secondaryValue =
      portfolioType ===
      PortfolioType.TRADER
        ? String(
            summary.total_trades,
          )
        : `${summary.dividend_income} ${currency}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7FBFA"/>
      <stop offset="100%" stop-color="#E9F5F2"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#173B36" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#background)"/>
  <circle cx="1100" cy="70" r="190" fill="#58C5C0" opacity="0.12"/>
  <circle cx="90" cy="590" r="150" fill="#58C5C0" opacity="0.08"/>

  <rect x="72" y="62" width="1056" height="506" rx="36" fill="#FFFFFF" filter="url(#shadow)"/>
  <rect x="72" y="62" width="12" height="506" rx="6" fill="${accent}"/>

  <text x="126" y="128" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#58AFA9">WISENANCIAL</text>
  <text x="126" y="188" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" fill="#18332F">${portfolioName}</text>
  <text x="126" y="228" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#66817D">${portfolioType} PORTFOLIO PERFORMANCE</text>

  <text x="126" y="330" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#78918D">TOTAL RETURN</text>
  <text x="126" y="408" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="800" fill="${accent}">${positive ? '+' : ''}${returnValue.toFixed(2)}%</text>
  <text x="126" y="462" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#294944">PnL ${pnlValue.toFixed(2)} ${currency}</text>

  <rect x="700" y="166" width="340" height="126" rx="24" fill="#F4F9F8"/>
  <text x="734" y="210" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#78918D">${primaryLabel}</text>
  <text x="734" y="263" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#18332F">${this.escapeXml(primaryValue)}</text>

  <rect x="700" y="318" width="340" height="126" rx="24" fill="#F4F9F8"/>
  <text x="734" y="362" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#78918D">${secondaryLabel}</text>
  <text x="734" y="415" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#18332F">${this.escapeXml(secondaryValue)}</text>

  <text x="126" y="528" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#8BA09D">Performance data generated by Wisenancial • Not investment advice</text>
</svg>`;
  }

  private escapeXml(
    value: unknown,
  ): string {
    return String(
      value ?? '',
    )
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private toJson(
    value: unknown,
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value),
    ) as Prisma.InputJsonValue;
  }

  private async requirePortfolio(
    userId: number,
    portfolioId: number,
  ) {
    if (
      !Number.isInteger(portfolioId) ||
      portfolioId <= 0
    ) {
      throw new BadRequestException(
        'portfolioId ไม่ถูกต้อง',
      );
    }

    const portfolio =
      await this.prisma.portfolios.findFirst({
        where: {
          id: portfolioId,
          user_id: userId,
        },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบพอร์ตนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private portfolioInfo(
    portfolio: {
      id: number;
      name: string;
      currency: string | null;
      initial_balance: {
        toString(): string;
      };
      current_balance: {
        toString(): string;
      };
      created_at: Date | null;
    },
  ) {
    return {
      id: portfolio.id,
      name: portfolio.name,
      currency:
        portfolio.currency ??
        'USD',
      created_at:
        portfolio.created_at,
      current_balance:
        Number(
          portfolio.current_balance,
        ),
      initial_balance:
        Number(
          portfolio.initial_balance,
        ),
    };
  }

  private totalReturn(
    portfolio: {
      initial_balance: {
        toString(): string;
      };
      current_balance: {
        toString(): string;
      };
    },
  ) {
    const initial = Number(
      portfolio.initial_balance,
    );
    const current = Number(
      portfolio.current_balance,
    );

    return initial > 0
      ? this.round(
          ((current - initial) /
            initial) *
            100,
        )
      : 0;
  }

  private calculateRiskMetrics(
    pnlValues: number[],
    initialBalance: number,
  ): RiskMetrics {
    if (pnlValues.length === 0) {
      return {
        sharpe_ratio: 0,
        max_drawdown: 0,
        volatility: 0,
      };
    }

    const average =
      this.sum(pnlValues) /
      pnlValues.length;
    const variance =
      this.sum(
        pnlValues.map(
          (value) =>
            Math.pow(
              value - average,
              2,
            ),
        ),
      ) / pnlValues.length;
    const volatility =
      Math.sqrt(variance);

    let balance =
      initialBalance;
    let peak =
      initialBalance;
    let maxDrawdown = 0;

    for (const pnl of pnlValues) {
      balance += pnl;
      peak = Math.max(
        peak,
        balance,
      );

      if (peak > 0) {
        maxDrawdown = Math.max(
          maxDrawdown,
          ((peak - balance) /
            peak) *
            100,
        );
      }
    }

    return {
      sharpe_ratio:
        volatility > 0
          ? this.round(
              average /
                volatility,
            )
          : 0,
      max_drawdown:
        this.round(
          maxDrawdown,
        ),
      volatility:
        this.round(
          volatility,
        ),
    };
  }

  private groupMonthly(
    rows: Array<{
      date: Date | null;
      value: number;
    }>,
  ): MonthlyPerformance[] {
    const monthly =
      new Map<string, number>();

    for (const row of rows) {
      if (!row.date) {
        continue;
      }

      const key =
        `${row.date.getFullYear()}-${String(
          row.date.getMonth() + 1,
        ).padStart(2, '0')}`;

      monthly.set(
        key,
        (monthly.get(key) ?? 0) +
          row.value,
      );
    }

    return [...monthly.entries()]
      .sort(([a], [b]) =>
        a.localeCompare(b),
      )
      .map(([month, pnl]) => ({
        month,
        pnl: this.round(pnl),
      }));
  }

  private firstValidDate(
    dates: Array<Date | null>,
  ) {
    return (
      dates
        .filter(
          (date): date is Date =>
            date instanceof Date,
        )
        .sort(
          (a, b) =>
            a.getTime() -
            b.getTime(),
        )[0] ?? null
    );
  }

  private lastValidDate(
    dates: Array<Date | null>,
  ) {
    const valid = dates
      .filter(
        (date): date is Date =>
          date instanceof Date,
      )
      .sort(
        (a, b) =>
          b.getTime() -
          a.getTime(),
      );

    return valid[0] ?? null;
  }

  private daysBetween(
    from: Date | null,
    to: Date | null,
  ) {
    if (!from || !to) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor(
        (to.getTime() -
          from.getTime()) /
          86_400_000,
      ),
    );
  }

  private percent(
    numerator: number,
    denominator: number,
  ) {
    return denominator > 0
      ? this.round(
          (numerator /
            denominator) *
            100,
        )
      : 0;
  }

  private average(
    values: number[],
  ) {
    return values.length > 0
      ? this.round(
          this.sum(values) /
            values.length,
        )
      : 0;
  }

  private sum(
    values: number[],
  ) {
    return values.reduce(
      (total, value) =>
        total + value,
      0,
    );
  }

  private round(
    value: number,
  ) {
    return Number(
      value.toFixed(2),
    );
  }
}

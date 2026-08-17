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
import { MarketService } from '../market/market.service';
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
    private readonly market: MarketService,
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

  /**
   * กราฟการเติบโตของพอร์ตหุ้น = total equity (เงินสด + มูลค่าตลาดของหุ้นที่ถืออยู่)
   *
   * ของเดิมเดินเฉพาะ cash ledger — ทุกครั้งที่ซื้อหุ้น เงินสดลด เส้นกราฟก็ดิ่งลงทั้งที่
   * แค่ย้ายเงินจากเงินสดไปเป็นหุ้น พอร์ตที่มีกำไร unrealized จึงเห็นกราฟแบนหรือลด
   * สูตรนี้ตรงกับ StockPurchasesService.getPortfolioOverview() (cash + holdings_value)
   * แล้ว จุดสุดท้ายของกราฟจึงเท่ากับตัวเลข total equity ที่ Dashboard แสดง
   *
   * หมายเหตุ: ตีมูลค่าหุ้นด้วย "ราคาตลาดปัจจุบัน" ไม่ใช่ราคาย้อนหลังรายวัน — เพราะเป็น
   * แหล่งราคาเดียวกับที่ Dashboard/holdings ใช้ ถ้าจะทำเป็นราคา ณ วันนั้นจริงๆ ต้องดึง
   * historical series รายสัญลักษณ์ ซึ่งเป็นงานคนละขนาด
   */
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

    // ต้องเดินจากจุดเริ่มพอร์ตเสมอ ไม่ใช่จาก `start` — ไม่งั้นทั้งเงินสดตั้งต้นและ
    // จำนวนหุ้นที่ถืออยู่ ณ ต้นช่วงจะผิด (ของเดิมตัดที่ start เลยนับเงินสดขาด)
    const [records, purchases, sales] =
      await Promise.all([
        this.records.findAll(
          portfolioId,
          userId,
          { limit: 10_000 },
        ),
        this.prisma.stock_purchases.findMany(
          {
            where: {
              portfolio_id:
                portfolioId,
            },
            select: {
              stock_symbol: true,
              shares_count: true,
              total_amount: true,
              purchase_date: true,
            },
          },
        ),
        this.prisma.stock_sales.findMany(
          {
            where: {
              portfolio_id:
                portfolioId,
            },
            select: {
              stock_symbol: true,
              shares_sold: true,
              sold_date: true,
            },
          },
        ),
      ]);

    const symbols = [
      ...new Set([
        ...purchases.map((row) =>
          row.stock_symbol.toUpperCase(),
        ),
        ...sales.map((row) =>
          row.stock_symbol.toUpperCase(),
        ),
      ]),
    ];

    const prices: Record<
      string,
      number | null
    > =
      symbols.length > 0
        ? await this.market.getQuotes(
            symbols,
          )
        : {};

    // ราคาตลาดดึงไม่ได้ (null) -> ใช้ต้นทุนเฉลี่ยแทน ไม่ใช่ 0 ไม่งั้นกราฟจะดิ่งลงเป็นศูนย์
    // ตอน Yahoo ล่ม ซึ่งเป็นตัวเลขที่หลอกกว่าเดิม
    const averageCost = new Map<
      string,
      number
    >();

    for (const symbol of symbols) {
      const lots = purchases.filter(
        (row) =>
          row.stock_symbol.toUpperCase() ===
          symbol,
      );
      const totalShares = lots.reduce(
        (sum, row) =>
          sum +
          Number(row.shares_count),
        0,
      );
      const totalCost = lots.reduce(
        (sum, row) =>
          sum +
          Number(row.total_amount),
        0,
      );

      if (totalShares > 0) {
        averageCost.set(
          symbol,
          totalCost / totalShares,
        );
      }
    }

    const priceOf = (symbol: string) =>
      prices[symbol] ??
      averageCost.get(symbol) ??
      0;

    type Event = {
      at: Date;
      cashDelta: number;
      symbol?: string;
      sharesDelta?: number;
      label: string;
      /** เฉพาะ record เท่านั้นที่มีตัวเลข amount ให้แสดงบน tooltip */
      amount?: number;
    };

    const events: Event[] = [
      ...records.map((record) => ({
        at: new Date(
          record.occurred_at,
        ),
        cashDelta: Number(
          record.amount,
        ),
        label: String(record.type),
        amount: Number(record.amount),
      })),
      // การซื้อ/ขายกระทบเงินสดผ่าน records อยู่แล้ว ที่นี่จึงนับเฉพาะจำนวนหุ้น
      ...purchases.map((row) => ({
        at: new Date(
          row.purchase_date,
        ),
        cashDelta: 0,
        symbol:
          row.stock_symbol.toUpperCase(),
        sharesDelta: Number(
          row.shares_count,
        ),
        label: 'BUY_SHARES',
      })),
      ...sales.map((row) => ({
        at: new Date(row.sold_date),
        cashDelta: 0,
        symbol:
          row.stock_symbol.toUpperCase(),
        sharesDelta: -Number(
          row.shares_sold,
        ),
        label: 'SELL_SHARES',
      })),
    ].sort(
      (a, b) =>
        a.at.getTime() -
        b.at.getTime(),
    );

    let cash = Number(
      portfolio.initial_balance,
    );
    const shares = new Map<
      string,
      number
    >();

    const holdingsValue = () => {
      let total = 0;

      for (const [
        symbol,
        qty,
      ] of shares) {
        if (qty <= 0) continue;
        total += qty * priceOf(symbol);
      }

      return total;
    };

    const points: PerformancePoint[] =
      [];
    const emit = (
      date: string | Date,
      label: string,
      amount?: number,
    ) => {
      points.push({
        date,
        value: this.round(
          cash + holdingsValue(),
        ),
        event: label,
        ...(amount !== undefined
          ? {
              amount:
                this.round(amount),
            }
          : {}),
      });
    };

    for (const event of events) {
      // เหตุการณ์ก่อนต้นช่วง: อัปเดต state เงียบๆ ไม่ปล่อยจุดออกไป
      if (
        start &&
        event.at < start
      ) {
        cash += event.cashDelta;

        if (
          event.symbol &&
          event.sharesDelta
        ) {
          shares.set(
            event.symbol,
            (shares.get(
              event.symbol,
            ) ?? 0) +
              event.sharesDelta,
          );
        }

        continue;
      }

      // จุดตั้งต้นของช่วง สะท้อนสถานะ ณ ต้นช่วงจริง (หลัง replay ของเก่าแล้ว)
      if (points.length === 0) {
        emit(
          start?.toISOString() ??
            'START',
          'START',
        );
      }

      cash += event.cashDelta;

      if (
        event.symbol &&
        event.sharesDelta
      ) {
        shares.set(
          event.symbol,
          (shares.get(event.symbol) ??
            0) + event.sharesDelta,
        );
      }

      emit(
        event.at,
        event.label,
        event.amount,
      );
    }

    if (points.length === 0) {
      emit(
        start?.toISOString() ??
          'START',
        'START',
      );
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

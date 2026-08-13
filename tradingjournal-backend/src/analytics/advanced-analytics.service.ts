import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortfolioType,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketService } from '../market/market.service';
import type {
  CashFlowResponse,
  DCASimulatorRequest,
  DCASimulatorResponse,
  HeatmapPoint,
  HoldingPeriodResponse,
  PerformerItem,
  ReturnVsBenchmarkResponse,
  TimeWeightedReturnResponse,
} from './advanced-analytics.types';

interface RealizedEvent {
  date: Date;
  symbol: string;
  pnl: number;
  costBasis: number;
}

@Injectable()
export class AdvancedAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async returnVsBenchmark(
    userId: number,
    portfolioId: number,
    benchmark = 'SET',
  ): Promise<ReturnVsBenchmarkResponse> {
    const portfolio = await this.getOwnedPortfolio(userId, portfolioId);
    const events = await this.realizedEvents(portfolioId, portfolio.portfolio_type);
    const initial = Number(portfolio.initial_balance);

    let value = initial;
    const portfolioPoints = events.map((event) => {
      value += event.pnl;
      return {
        date: event.date.toISOString(),
        value: this.round(value),
        return: initial > 0 ? this.round(((value - initial) / initial) * 100) : 0,
      };
    });

    const benchmarkSymbol = this.resolveBenchmarkSymbol(benchmark);
    const from = events[0]?.date ?? this.oneYearAgo();
    const to = events[events.length - 1]?.date ?? new Date();

    const history = await this.market.getHistoricalPrices(
      benchmarkSymbol,
      from,
      to,
    );

    const first = Number(history[0]?.close ?? 0);
    const benchmarkPoints = history
      .filter((row: any) => Number(row.close) > 0)
      .map((row: any) => ({
        date: new Date(row.date).toISOString(),
        value: this.round(Number(row.close)),
        return:
          first > 0
            ? this.round(((Number(row.close) - first) / first) * 100)
            : 0,
      }));

    const lastPortfolio = portfolioPoints.at(-1)?.return ?? 0;
    const lastBenchmark = benchmarkPoints.at(-1)?.return ?? 0;

    return {
      portfolio: portfolioPoints,
      benchmark: benchmarkPoints,
      outperformance: this.round(lastPortfolio - lastBenchmark),
      benchmarkSymbol,
    };
  }

  async timeWeightedReturn(
    userId: number,
    portfolioId: number,
  ): Promise<TimeWeightedReturnResponse> {
    const portfolio = await this.getOwnedPortfolio(userId, portfolioId);
    const events = await this.realizedEvents(portfolioId, portfolio.portfolio_type);

    let factor = 1;
    let periodStart = Number(portfolio.initial_balance);

    for (const event of events) {
      const periodEnd = periodStart + event.pnl;
      if (periodStart > 0) factor *= periodEnd / periodStart;
      periodStart = periodEnd;
    }

    const initial = Number(portfolio.initial_balance);
    const current = Number(portfolio.current_balance);
    const totalReturn =
      initial > 0 ? ((current - initial) / initial) * 100 : 0;

    return {
      timeWeightedReturn: this.round((factor - 1) * 100),
      totalReturn: this.round(totalReturn),
      note:
        'TWR นี้อิง realized events ตามระบบเดิม; ผลตอบแทนพอร์ตย้อนหลังที่แม่นยำควรใช้ portfolio snapshots และ external cash-flow segmentation',
    };
  }

  async monthlyHeatmap(
    userId: number,
    portfolioId: number,
  ): Promise<HeatmapPoint[]> {
    const portfolio = await this.getOwnedPortfolio(userId, portfolioId);
    const events = await this.realizedEvents(portfolioId, portfolio.portfolio_type);
    const grouped = new Map<string, number>();

    for (const event of events) {
      const key = `${event.date.getFullYear()}-${String(
        event.date.getMonth() + 1,
      ).padStart(2, '0')}`;
      grouped.set(key, (grouped.get(key) ?? 0) + event.pnl);
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, pnl]) => ({
        month,
        pnl: this.round(pnl),
        percentage:
          pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral',
      }));
  }

  async performers(
    userId: number,
    portfolioId: number,
  ): Promise<{ best: PerformerItem[]; worst: PerformerItem[] }> {
    const portfolio = await this.getOwnedPortfolio(userId, portfolioId);
    const events = await this.realizedEvents(portfolioId, portfolio.portfolio_type);

    const rows = events.map((event) => ({
      symbol: event.symbol,
      pnl: this.round(event.pnl),
      returnPercent:
        event.costBasis > 0
          ? this.round((event.pnl / event.costBasis) * 100)
          : 0,
      closedAt: event.date,
    }));

    const sorted = [...rows].sort((a, b) => b.pnl - a.pnl);
    return {
      best: sorted.slice(0, 5),
      worst: sorted.slice(-5).reverse(),
    };
  }

  async holdingPeriod(
    userId: number,
    portfolioId: number,
  ): Promise<HoldingPeriodResponse> {
    const portfolio = await this.getOwnedPortfolio(userId, portfolioId);
    const today = new Date();

    if (portfolio.portfolio_type === PortfolioType.TRADER) {
      const trades = await this.prisma.trades.findMany({
        where: {
          portfolio_id: portfolioId,
          opened_at: { not: null },
        },
        select: {
          opened_at: true,
          closed_at: true,
        },
      });

      const days = trades.map((trade) =>
        this.daysBetween(
          trade.opened_at ?? today,
          trade.closed_at ?? today,
        ),
      );

      return {
        averageDays:
          days.length > 0
            ? Math.round(days.reduce((sum, value) => sum + value, 0) / days.length)
            : 0,
        totalHoldings: days.length,
      };
    }

    const purchases = await this.prisma.stock_purchases.findMany({
      where: { portfolio_id: portfolioId },
      select: {
        purchase_date: true,
        sold_date: true,
        status: true,
      },
    });

    const days = purchases.map((purchase) =>
      this.daysBetween(
        new Date(purchase.purchase_date),
        purchase.status === 'CLOSED' && purchase.sold_date
          ? new Date(purchase.sold_date)
          : today,
      ),
    );

    return {
      averageDays:
        days.length > 0
          ? Math.round(days.reduce((sum, value) => sum + value, 0) / days.length)
          : 0,
      totalHoldings: days.length,
    };
  }

  async cashFlow(
    userId: number,
    portfolioId: number,
  ): Promise<CashFlowResponse> {
    await this.getOwnedPortfolio(userId, portfolioId);

    const [records, dividends] = await Promise.all([
      this.prisma.records.findMany({
        where: {
          portfolio_id: portfolioId,
          status: RecordStatus.ACTIVE,
        },
        select: {
          amount: true,
          occurred_at: true,
        },
      }),
      this.prisma.dividends.findMany({
        where: {
          portfolio_id: portfolioId,
          status: RecordStatus.ACTIVE,
        },
        select: {
          net_amount: true,
          payment_date: true,
          created_at: true,
        },
      }),
    ]);

    const grouped = new Map<
      string,
      { cashFlow: number; dividendIncome: number }
    >();

    for (const record of records) {
      const key = this.monthKey(record.occurred_at);
      const current = grouped.get(key) ?? {
        cashFlow: 0,
        dividendIncome: 0,
      };
      current.cashFlow += Number(record.amount);
      grouped.set(key, current);
    }

    for (const dividend of dividends) {
      const date = dividend.payment_date ?? dividend.created_at;
      const key = this.monthKey(date);
      const current = grouped.get(key) ?? {
        cashFlow: 0,
        dividendIncome: 0,
      };
      current.dividendIncome += Number(dividend.net_amount);
      grouped.set(key, current);
    }

    const monthlyCashFlow = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        cashFlow: this.round(value.cashFlow),
        dividendIncome: this.round(value.dividendIncome),
      }));

    const totalDividendIncome = monthlyCashFlow.reduce(
      (sum, row) => sum + row.dividendIncome,
      0,
    );

    const dividendRows = monthlyCashFlow.filter(
      (row) => row.dividendIncome !== 0,
    );
    const previous = dividendRows.at(-2)?.dividendIncome ?? 0;
    const latest = dividendRows.at(-1)?.dividendIncome ?? 0;
    const passiveIncomeGrowth =
      previous !== 0 ? ((latest - previous) / Math.abs(previous)) * 100 : 0;

    return {
      monthlyCashFlow,
      totalDividendIncome: this.round(totalDividendIncome),
      passiveIncomeGrowth: this.round(passiveIncomeGrowth),
    };
  }

  async simulateDca(
    request: DCASimulatorRequest,
  ): Promise<DCASimulatorResponse> {
    const symbol = request.symbol.trim().toUpperCase();
    if (!symbol || request.monthlyAmount <= 0 || request.durationYears <= 0) {
      throw new BadRequestException('DCA input ไม่ถูกต้อง');
    }

    const monthlyPeriods = request.durationYears * 12;
    const totalInvested = request.monthlyAmount * monthlyPeriods;

    const scenarios = [
      { scenario: 'Low Growth' as const, annual: 0.03, confidence: 70 },
      { scenario: 'Medium Growth' as const, annual: 0.07, confidence: 60 },
      { scenario: 'High Growth' as const, annual: 0.12, confidence: 40 },
    ].map((item) => {
      const monthlyRate = item.annual / 12;
      const finalValue =
        monthlyRate === 0
          ? totalInvested
          : request.monthlyAmount *
            (((1 + monthlyRate) ** monthlyPeriods - 1) / monthlyRate);

      return {
        scenario: item.scenario,
        totalInvested: this.round(totalInvested),
        finalValue: this.round(finalValue),
        totalReturn: this.round(finalValue - totalInvested),
        annualizedReturn: item.annual * 100,
        reasoning:
          'Scenario projection จากสมมติฐานผลตอบแทนคงที่ ไม่ใช่การคาดการณ์ราคาหรือผลตอบแทนที่รับประกัน',
        confidence: item.confidence,
      };
    });

    return {
      symbol,
      monthlyAmount: request.monthlyAmount,
      durationYears: request.durationYears,
      scenarios,
      analysis: {
        historicalContext:
          'ผลลัพธ์เป็นการจำลองเชิงคณิตศาสตร์และยังไม่รวมภาษี ค่าธรรมเนียม ค่าเงิน และความผันผวนจริง',
        riskFactors: [
          'ผลตอบแทนตลาดไม่สม่ำเสมอ',
          'Currency และ inflation risk',
          'ค่าธรรมเนียมและภาษีลดผลตอบแทนสุทธิ',
        ],
        recommendations: [
          'ใช้หลาย scenario แทนการยึดค่าผลตอบแทนเดียว',
          'ทบทวนจำนวนเงิน DCA ตามกระแสเงินสดจริง',
          'ไม่ควรใช้ผลจำลองเป็นคำรับรองผลตอบแทน',
        ],
      },
    };
  }

  private async realizedEvents(
    portfolioId: number,
    type: PortfolioType,
  ): Promise<RealizedEvent[]> {
    if (type === PortfolioType.TRADER) {
      const rows = await this.prisma.trades.findMany({
        where: {
          portfolio_id: portfolioId,
          result_status: { in: ['WIN', 'LOSS', 'BREAKEVEN'] },
        },
        select: {
          pair: true,
          pnl: true,
          closed_at: true,
          created_at: true,
        },
        orderBy: [{ closed_at: 'asc' }, { id: 'asc' }],
      });

      return rows.map((row) => ({
        date:
          row.closed_at ??
          row.created_at ??
          new Date(0),
        symbol:
          row.pair ?? 'UNKNOWN',
        pnl: Number(row.pnl ?? 0),
        costBasis: 0,
      }));
    }

    const rows = await this.prisma.stock_sales.findMany({
      where: { portfolio_id: portfolioId },
      select: {
        stock_symbol: true,
        realized_pnl: true,
        cost_basis: true,
        sold_date: true,
        created_at: true,
      },
      orderBy: [{ sold_date: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      date:
        row.sold_date ??
        row.created_at ??
        new Date(0),
      symbol: row.stock_symbol,
      pnl:
        Number(row.realized_pnl ?? 0),
      costBasis:
        Number(row.cost_basis ?? 0),
    }));
  }

  private async getOwnedPortfolio(userId: number, portfolioId: number) {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: {
        id: portfolioId,
        user_id: userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private resolveBenchmarkSymbol(value: string): string {
    const normalized = value.trim().toUpperCase();
    const aliases: Record<string, string> = {
      SET: '^SET.BK',
      SP500: '^GSPC',
      'S&P500': '^GSPC',
      NASDAQ: '^IXIC',
      DOW: '^DJI',
    };
    return aliases[normalized] ?? normalized;
  }

  private oneYearAgo(): Date {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date;
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private daysBetween(start: Date, end: Date): number {
    return Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / 86_400_000),
    );
  }

  private round(value: number): number {
    return Number(value.toFixed(2));
  }
}

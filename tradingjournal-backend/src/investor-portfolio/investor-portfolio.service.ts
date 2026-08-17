import { Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioType, RecordType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { StockPurchasesService } from '../stock-purchases/stock-purchases.service';
import { DividendsService } from '../dividends/dividends.service';
import { InvestorAnalyticsService } from '../analytics/investor-analytics.service';

type RecordRow = Awaited<ReturnType<RecordsService['findAll']>>[number];

/** จำนวนรายการเคลื่อนไหวล่าสุดที่แนบไปกับ dashboard */
const RECENT_ACTIVITY_LIMIT = 15;
const TIMELINE_LIMIT = 500;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

@Injectable()
export class InvestorPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordsService,
    private readonly holdings: StockPurchasesService,
    private readonly dividends: DividendsService,
    private readonly analytics: InvestorAnalyticsService,
  ) {}

  async dashboard(portfolioId: number, userId: number) {
    const portfolio = await this.assertInvestorPortfolio(portfolioId, userId);

    const [holdings, purchaseSummary, dividendSummary, recentRecords] =
      await Promise.all([
        this.holdings.getHoldings(portfolioId, userId),
        this.holdings.getSummary(portfolioId, userId),
        this.dividends.summary(portfolioId, userId),
        this.records.findAll(portfolioId, userId, {
          limit: RECENT_ACTIVITY_LIMIT,
        }),
      ]);

    const cash = Number(portfolio.current_balance);
    const investedCost = holdings.reduce((sum, item) => sum + item.cost_basis, 0);
    const marketValue = holdings.reduce((sum, item) => sum + item.market_value, 0);
    const unrealizedPnl = holdings.reduce((sum, item) => sum + item.unrealized_pnl, 0);

    const realizedPnl = purchaseSummary.realized_pnl;
    const dividendIncome = dividendSummary.net_amount;
    const totalPnl = realizedPnl + unrealizedPnl + dividendIncome;

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        currency: portfolio.currency ?? 'USD',
      },
      summary: {
        cash: round(cash),
        invested_cost: round(investedCost),
        market_value: round(marketValue),
        portfolio_value: round(cash + marketValue),
        realized_pnl: round(realizedPnl),
        unrealized_pnl: round(unrealizedPnl),
        dividends: round(dividendIncome),
        total_pnl: round(totalPnl),
        total_return_percent:
          investedCost > 0 ? round((totalPnl / investedCost) * 100) : 0,
        open_holdings: holdings.length,
        closed_sales: purchaseSummary.sales_count,
      },
      holdings: holdings.map((holding) => ({
        symbol: holding.symbol,
        name: holding.name,
        currency: holding.currency,
        shares: holding.remaining_shares,
        average_cost: holding.average_cost,
        cost_basis: holding.cost_basis,
        market_price: holding.current_price,
        market_value: holding.market_value,
        unrealized_pnl: holding.unrealized_pnl,
        unrealized_percent: holding.unrealized_pnl_percent,
      })),
      recent_activity: await this.toActivities(recentRecords),
    };
  }

  async timeline(
    portfolioId: number,
    userId: number,
    from?: string,
    to?: string,
  ) {
    await this.assertInvestorPortfolio(portfolioId, userId);

    const records = await this.records.findAll(portfolioId, userId, {
      limit: TIMELINE_LIMIT,
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
    });

    return this.toActivities(records);
  }

  async performance(portfolioId: number, userId: number, timeframe?: string) {
    const portfolio = await this.assertInvestorPortfolio(portfolioId, userId);

    const points = await this.analytics.performance(
      portfolioId,
      userId,
      (timeframe ?? 'ALL') as Parameters<InvestorAnalyticsService['performance']>[2],
    );

    // InvestorAnalyticsService ใส่ date เป็นสตริง 'START' สำหรับจุดตั้งต้นเมื่อ timeframe ไม่มีวันเริ่ม
    // ('ALL') — ค่านั้น parse เป็นวันที่ไม่ได้ กราฟหน้าบ้านจะพัง เลยแทนด้วยวันที่สร้างพอร์ต
    const fallbackDate = (portfolio.created_at ?? new Date()).toISOString();

    return points.map((point) => ({
      date: point.date === 'START' ? fallbackDate : point.date,
      value: point.value,
    }));
  }

  /**
   * แปลง records เป็น InvestorActivity ที่หน้าบ้านใช้
   *
   * records ไม่ได้เก็บ symbol ไว้ตรง ๆ — ต้องตามไปหาจากตารางต้นทางตาม type
   * (STOCK_BUY -> stock_purchases, STOCK_SELL -> stock_sales, DIVIDEND -> dividends)
   * ดึงแบบ bulk ทีเดียวต่อตาราง ไม่ยิงทีละแถว
   */
  private async toActivities(records: RecordRow[]) {
    const symbols = await this.resolveSymbols(records);

    return records.map((record) => ({
      id: record.id,
      type: record.type,
      amount: Number(record.amount),
      symbol: symbols.get(record.id) ?? null,
      description: record.description,
      occurred_at: record.occurred_at.toISOString(),
      source: record.source,
      status: record.status,
    }));
  }

  private async resolveSymbols(records: RecordRow[]): Promise<Map<number, string>> {
    const purchaseIds: number[] = [];
    const saleIds: number[] = [];
    const dividendIds: number[] = [];

    for (const record of records) {
      if (record.source_id === null) continue;

      if (record.type === RecordType.STOCK_BUY) purchaseIds.push(record.source_id);
      else if (record.type === RecordType.STOCK_SELL) saleIds.push(record.source_id);
      else if (record.type === RecordType.DIVIDEND) dividendIds.push(record.source_id);
    }

    const emptyBySymbol: { id: number; stock_symbol: string }[] = [];
    const emptyDividends: { id: number; symbol: string }[] = [];

    const [purchases, sales, dividends] = await Promise.all([
      purchaseIds.length
        ? this.prisma.stock_purchases.findMany({
            where: { id: { in: purchaseIds } },
            select: { id: true, stock_symbol: true },
          })
        : Promise.resolve(emptyBySymbol),
      saleIds.length
        ? this.prisma.stock_sales.findMany({
            where: { id: { in: saleIds } },
            select: { id: true, stock_symbol: true },
          })
        : Promise.resolve(emptyBySymbol),
      dividendIds.length
        ? this.prisma.dividends.findMany({
            where: { id: { in: dividendIds } },
            select: { id: true, symbol: true },
          })
        : Promise.resolve(emptyDividends),
    ]);

    const bySource = new Map<string, string>();
    purchases.forEach((row) => bySource.set(`BUY:${row.id}`, row.stock_symbol));
    sales.forEach((row) => bySource.set(`SELL:${row.id}`, row.stock_symbol));
    dividends.forEach((row) => bySource.set(`DIV:${row.id}`, row.symbol));

    const result = new Map<number, string>();

    for (const record of records) {
      if (record.source_id === null) continue;

      const prefix =
        record.type === RecordType.STOCK_BUY
          ? 'BUY'
          : record.type === RecordType.STOCK_SELL
            ? 'SELL'
            : record.type === RecordType.DIVIDEND
              ? 'DIV'
              : null;

      if (!prefix) continue;

      const symbol = bySource.get(`${prefix}:${record.source_id}`);
      if (symbol) result.set(record.id, symbol);
    }

    return result;
  }

  private async assertInvestorPortfolio(portfolioId: number, userId: number) {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: {
        id: portfolioId,
        user_id: userId,
        portfolio_type: PortfolioType.INVESTOR,
      },
    });

    if (!portfolio) {
      throw new NotFoundException('ไม่พบพอร์ตลงทุน หรือคุณไม่มีสิทธิ์เข้าถึง');
    }

    return portfolio;
  }
}

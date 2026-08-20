import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketService } from '../market/market.service';
import { UpdateStockPurchaseDto } from './dto/update-stock-purchase.dto';

@Injectable()
export class StockPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async findAll(
    portfolioId: number,
    userId: number,
    status?: 'OPEN' | 'CLOSED',
  ) {
    await this.assertInvestorPortfolio(portfolioId, userId);

    return this.prisma.stock_purchases.findMany({
      where: {
        portfolio_id: portfolioId,
        ...(status && { status }),
      },
      orderBy: [{ purchase_date: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number, userId: number) {
    const purchase = await this.prisma.stock_purchases.findFirst({
      where: {
        id,
        portfolios: {
          user_id: userId,
          portfolio_type: PortfolioType.INVESTOR,
        },
      },
      include: {
        sale_allocations: {
          include: { sale: true },
          orderBy: { id: 'desc' },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('ไม่พบรายการซื้อหุ้น หรือคุณไม่มีสิทธิ์เข้าถึง');
    }

    return purchase;
  }

  async getSummary(portfolioId: number, userId: number) {
    await this.assertInvestorPortfolio(portfolioId, userId);

    const [lots, sales] = await Promise.all([
      this.prisma.stock_purchases.findMany({
        where: { portfolio_id: portfolioId },
        select: {
          stock_symbol: true,
          shares_count: true,
          remaining_shares: true,
          total_amount: true,
          fees: true,
          status: true,
        },
      }),
      this.prisma.stock_sales.aggregate({
        where: { portfolio_id: portfolioId },
        _sum: {
          realized_pnl: true,
          net_proceeds: true,
          cost_basis: true,
        },
        _count: { id: true },
      }),
    ]);

    const openLots = lots.filter((lot) => Number(lot.remaining_shares) > 0);
    const remainingCostBasis = openLots.reduce((sum, lot) => {
      const shares = new Prisma.Decimal(lot.shares_count);
      if (shares.isZero()) return sum;
      const costPerShare = new Prisma.Decimal(lot.total_amount).div(shares);
      return sum.add(costPerShare.mul(lot.remaining_shares));
    }, new Prisma.Decimal(0));

    return {
      total_lots: lots.length,
      open_lots: openLots.length,
      closed_lots: lots.length - openLots.length,
      open_symbols: new Set(openLots.map((lot) => lot.stock_symbol)).size,
      remaining_cost_basis: Number(remainingCostBasis.toDecimalPlaces(2)),
      realized_pnl: Number(sales._sum.realized_pnl ?? 0),
      total_net_proceeds: Number(sales._sum.net_proceeds ?? 0),
      total_sold_cost_basis: Number(sales._sum.cost_basis ?? 0),
      sales_count: sales._count.id,
    };
  }

  async getHoldings(portfolioId: number, userId: number) {
    await this.assertInvestorPortfolio(portfolioId, userId);

    const lots = await this.prisma.stock_purchases.findMany({
      where: {
        portfolio_id: portfolioId,
        status: 'OPEN',
        remaining_shares: { gt: 0 },
      },
      orderBy: [{ stock_symbol: 'asc' }, { purchase_date: 'asc' }],
    });

    const symbols = [...new Set(lots.map((lot) => lot.stock_symbol.toUpperCase()))];
    const prices = await this.getCurrentPrices(symbols);
    const grouped = new Map<string, typeof lots>();

    for (const lot of lots) {
      const symbol = lot.stock_symbol.toUpperCase();
      grouped.set(symbol, [...(grouped.get(symbol) ?? []), lot]);
    }

    return [...grouped.entries()].map(([symbol, symbolLots]) => {
      const remainingShares = symbolLots.reduce(
        (sum, lot) => sum.add(lot.remaining_shares),
        new Prisma.Decimal(0),
      );
      const remainingCost = symbolLots.reduce((sum, lot) => {
        const fullShares = new Prisma.Decimal(lot.shares_count);
        if (fullShares.isZero()) return sum;
        const unitCost = new Prisma.Decimal(lot.total_amount).div(fullShares);
        return sum.add(unitCost.mul(lot.remaining_shares));
      }, new Prisma.Decimal(0));

      const fallbackPrice = remainingShares.isZero()
        ? 0
        : Number(remainingCost.div(remainingShares));
      const currentPrice = prices[symbol] ?? fallbackPrice;
      const marketValue = Number(remainingShares) * currentPrice;
      const costBasis = Number(remainingCost);
      const unrealizedPnl = marketValue - costBasis;

      return {
        symbol,
        name: symbolLots.find((lot) => lot.stock_name)?.stock_name ?? null,
        remaining_shares: Number(remainingShares),
        average_cost: remainingShares.isZero()
          ? 0
          : Number(remainingCost.div(remainingShares).toDecimalPlaces(8)),
        cost_basis: Number(remainingCost.toDecimalPlaces(2)),
        current_price: currentPrice,
        market_value: Number(marketValue.toFixed(2)),
        unrealized_pnl: Number(unrealizedPnl.toFixed(2)),
        unrealized_pnl_percent: costBasis > 0
          ? Number(((unrealizedPnl / costBasis) * 100).toFixed(2))
          : 0,
        lots_count: symbolLots.length,
        currency: symbolLots[0]?.currency ?? 'USD',
      };
    });
  }

  async getPortfolioOverview(portfolioId: number, userId: number) {
    const portfolio = await this.assertInvestorPortfolio(portfolioId, userId);
    const [holdings, summary] = await Promise.all([
      this.getHoldings(portfolioId, userId),
      this.getSummary(portfolioId, userId),
    ]);

    const holdingsValue = holdings.reduce((sum, item) => sum + item.market_value, 0);
    const unrealizedPnl = holdings.reduce((sum, item) => sum + item.unrealized_pnl, 0);
    const totalEquity = Number(portfolio.current_balance) + holdingsValue;

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        currency: portfolio.currency ?? 'USD',
        cash_balance: Number(portfolio.current_balance),
        holdings_value: Number(holdingsValue.toFixed(2)),
        total_equity: Number(totalEquity.toFixed(2)),
        realized_pnl: summary.realized_pnl,
        unrealized_pnl: Number(unrealizedPnl.toFixed(2)),
      },
      summary,
      holdings,
    };
  }

  async getSales(portfolioId: number, userId: number) {
    await this.assertInvestorPortfolio(portfolioId, userId);

    return this.prisma.stock_sales.findMany({
      where: { portfolio_id: portfolioId },
      include: {
        allocations: {
          include: { purchase: true },
        },
      },
      orderBy: [{ sold_date: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * แก้ไขรายการซื้อหุ้น — เฉพาะข้อมูลประกอบ (ดูเหตุผลใน UpdateStockPurchaseDto)
   *
   * ส่ง null มาได้เพื่อล้างค่า TP/SL (ฟอร์มฝั่งหน้าบ้านใช้ตอนปิดสวิตช์แจ้งเตือนราคา)
   * จึงเช็คด้วย `in` ไม่ใช่ `!== undefined` เพราะ null ต้องนับเป็น "ตั้งใจล้าง"
   */
  async update(id: number, userId: number, dto: UpdateStockPurchaseDto) {
    await this.findOne(id, userId);

    const data: Prisma.stock_purchasesUpdateInput = {};

    if ('folder_name' in dto) data.folder_name = dto.folder_name ?? null;
    if ('target_price' in dto) data.target_price = dto.target_price ?? null;
    if ('stop_loss' in dto) data.stop_loss = dto.stop_loss ?? null;
    if ('strategy' in dto) data.strategy = dto.strategy ?? null;
    if ('emotion' in dto) data.emotion = dto.emotion ?? null;
    if ('notes' in dto) data.notes = dto.notes ?? null;
    if ('purchase_reason' in dto) data.purchase_reason = dto.purchase_reason ?? null;
    if ('expectation' in dto) data.expectation = dto.expectation ?? null;

    return this.prisma.stock_purchases.update({
      where: { id },
      data,
    });
  }

  /**
   * ลบรายการซื้อหุ้น — ได้เฉพาะ lot ที่ยังไม่เคยขายออกไปเลย
   *
   * ถ้าขายไปแล้วบางส่วน จะมีแถวใน stock_sale_allocations ผูกอยู่ และยอด
   * portfolios.current_balance ก็ถูกขยับไปตามเงินที่ได้จากการขายแล้ว ลบทิ้งเมื่อไหร่
   * ประวัติการขายจะชี้ไปยัง lot ที่ไม่มีอยู่ และยอดเงินพอร์ตจะเพี้ยนแบบกู้คืนไม่ได้
   * จึงตอบ 409 พร้อมบอกเหตุผล แทนที่จะลบแล้วค่อยไปพบปัญหาทีหลัง
   */
  async remove(id: number, userId: number) {
    const purchase = await this.findOne(id, userId);

    const soldShares = Number(purchase.shares_count) - Number(purchase.remaining_shares);

    if (soldShares > 0) {
      throw new ConflictException(
        `ลบไม่ได้เพราะขายหุ้นล็อตนี้ไปแล้ว ${soldShares} หุ้น — ` +
          'การลบจะทำให้ประวัติการขายและยอดเงินพอร์ตไม่ตรงกัน',
      );
    }

    await this.prisma.stock_purchases.delete({ where: { id } });

    return {
      message: 'ลบรายการซื้อหุ้นสำเร็จ',
      id,
    };
  }

  private async getCurrentPrices(symbols: string[]) {
    if (symbols.length === 0) return {} as Record<string, number | null>;
    return this.market.getQuotes(symbols);
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
      throw new NotFoundException('ไม่พบ Investor portfolio หรือคุณไม่มีสิทธิ์เข้าถึง');
    }

    return portfolio;
  }
}

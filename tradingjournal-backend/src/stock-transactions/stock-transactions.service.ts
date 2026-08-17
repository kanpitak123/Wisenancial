import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioType, Prisma, RecordSource, RecordType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { BuyStockDto } from './dto/buy-stock.dto';
import { SellStockDto } from './dto/sell-stock.dto';

type Lot = {
  id: number;
  remaining_shares: Prisma.Decimal;
  purchase_price: Prisma.Decimal;
  fees: Prisma.Decimal;
  shares_count: Prisma.Decimal;
  purchase_date: Date;
  currency: string;
};

@Injectable()
export class StockTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordsService,
  ) {}

  async buy(portfolioId: number, userId: number, dto: BuyStockDto) {
    const shares = new Prisma.Decimal(dto.shares_count);
    const price = new Prisma.Decimal(dto.purchase_price);
    const fees = new Prisma.Decimal(dto.fees ?? 0);
    const total = shares.mul(price).add(fees).toDecimalPlaces(2);
    const symbol = dto.stock_symbol.trim().toUpperCase();
    const date = dto.purchase_date ? new Date(dto.purchase_date) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const portfolio = await this.lockInvestorPortfolio(tx, portfolioId, userId);
      const transactionCurrency = (
        dto.currency?.trim().toUpperCase() ?? portfolio.currency ?? 'USD'
      ).toUpperCase();
      const portfolioCurrency = (portfolio.currency ?? 'USD').toUpperCase();

      if (transactionCurrency !== portfolioCurrency) {
        throw new BadRequestException(
          `สกุลเงินรายการ (${transactionCurrency}) ต้องตรงกับสกุลเงินพอร์ต (${portfolioCurrency})`,
        );
      }
      if (portfolio.current_balance.lessThan(total)) {
        throw new BadRequestException('ยอดเงินสดไม่เพียงพอ');
      }

      const purchase = await tx.stock_purchases.create({
        data: {
          portfolio_id: portfolioId,
          stock_symbol: symbol,
          stock_name: dto.stock_name?.trim() || null,
          shares_count: shares,
          remaining_shares: shares,
          purchase_price: price,
          total_amount: total,
          fees,
          currency: transactionCurrency,
          notes: dto.notes ?? null,
          strategy: dto.strategy ?? null,
          emotion: dto.emotion ?? null,
          target_price:
            dto.target_price === undefined
              ? null
              : new Prisma.Decimal(dto.target_price),
          stop_loss:
            dto.stop_loss === undefined
              ? null
              : new Prisma.Decimal(dto.stop_loss),
          folder_name: dto.folder_name?.trim() || null,
          purchase_reason: dto.purchase_reason?.trim() || null,
          expectation: dto.expectation?.trim() || null,
          status: 'OPEN',
          purchase_date: date,
        },
      });

      const record = await this.records.createSystem(
        {
          portfolioId,
          type: RecordType.STOCK_BUY,
          source: RecordSource.STOCK_PURCHASE,
          sourceId: purchase.id,
          signedAmount: total.neg(),
          currency: transactionCurrency,
          description: `Buy ${symbol} ${shares.toString()} shares`,
          occurredAt: date,
          createdByUserId: userId,
        },
        tx,
      );

      const updatedPortfolio = await tx.portfolios.findUnique({
        where: { id: portfolioId },
        select: { current_balance: true },
      });

      return {
        purchase,
        record,
        current_balance: Number(updatedPortfolio?.current_balance ?? 0),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async sell(portfolioId: number, userId: number, dto: SellStockDto) {
    const symbol = dto.stock_symbol.trim().toUpperCase();
    const sharesToSell = new Prisma.Decimal(dto.shares_count);
    const soldPrice = new Prisma.Decimal(dto.sold_price);
    const fees = new Prisma.Decimal(dto.fees ?? 0);
    const soldDate = dto.sold_date ? new Date(dto.sold_date) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const portfolio = await this.lockInvestorPortfolio(tx, portfolioId, userId);
      const method = dto.cost_method ?? portfolio.investor_cost_method ?? 'FIFO';
      const orderBy = method === 'LIFO'
        ? { purchase_date: 'desc' as const }
        : { purchase_date: 'asc' as const };

      const lots = await tx.stock_purchases.findMany({
        where: {
          portfolio_id: portfolioId,
          stock_symbol: symbol,
          status: 'OPEN',
          remaining_shares: { gt: 0 },
        },
        orderBy: [orderBy, { id: method === 'LIFO' ? 'desc' : 'asc' }],
      }) as unknown as Lot[];

      const portfolioCurrency = (portfolio.currency ?? 'USD').toUpperCase();
      const currencies = new Set(lots.map((lot) => lot.currency.toUpperCase()));
      if (currencies.size > 1 || (currencies.size === 1 && !currencies.has(portfolioCurrency))) {
        throw new BadRequestException('สกุลเงินของหุ้นต้องตรงกับสกุลเงินพอร์ต');
      }

      const available = lots.reduce(
        (sum, lot) => sum.add(lot.remaining_shares),
        new Prisma.Decimal(0),
      );
      if (available.lessThan(sharesToSell)) {
        throw new BadRequestException(`จำนวนหุ้นไม่พอ มีอยู่ ${available.toString()} หุ้น`);
      }

      const allocations = method === 'AVERAGE'
        ? this.allocateAverage(lots, sharesToSell)
        : this.allocateSequential(lots, sharesToSell);

      const costBasis = allocations.reduce(
        (sum, allocation) => sum.add(allocation.cost_basis),
        new Prisma.Decimal(0),
      ).toDecimalPlaces(2);
      const gross = sharesToSell.mul(soldPrice).toDecimalPlaces(2);
      const net = gross.sub(fees).toDecimalPlaces(2);
      const realized = net.sub(costBasis).toDecimalPlaces(2);

      const sale = await tx.stock_sales.create({
        data: {
          portfolio_id: portfolioId,
          stock_symbol: symbol,
          shares_sold: sharesToSell,
          sold_price: soldPrice,
          gross_proceeds: gross,
          fees,
          net_proceeds: net,
          cost_basis: costBasis,
          realized_pnl: realized,
          cost_method: method,
          sold_date: soldDate,
          notes: dto.notes ?? null,
        },
      });

      for (const allocation of allocations) {
        const lot = lots.find((item) => item.id === allocation.purchase_id)!;
        const remaining = lot.remaining_shares.sub(allocation.shares);

        await tx.stock_sale_allocations.create({
          data: {
            sale_id: sale.id,
            ...allocation,
          },
        });

        await tx.stock_purchases.update({
          where: { id: lot.id },
          data: {
            remaining_shares: remaining,
            status: remaining.isZero() ? 'CLOSED' : 'OPEN',
            ...(remaining.isZero()
              ? {
                  closed_at: soldDate,
                  sold_date: soldDate,
                  sold_price: soldPrice,
                }
              : {}),
          },
        });
      }

      const record = await this.records.createSystem(
        {
          portfolioId,
          type: RecordType.STOCK_SELL,
          source: RecordSource.STOCK_PURCHASE,
          sourceId: sale.id,
          signedAmount: net,
          currency: portfolioCurrency,
          description: `Sell ${symbol} ${sharesToSell.toString()} shares`,
          occurredAt: soldDate,
          createdByUserId: userId,
        },
        tx,
      );

      const updatedPortfolio = await tx.portfolios.findUnique({
        where: { id: portfolioId },
        select: { current_balance: true },
      });

      return {
        sale,
        allocations,
        record,
        current_balance: Number(updatedPortfolio?.current_balance ?? 0),
        return_percent: costBasis.isZero()
          ? 0
          : Number(realized.div(costBasis).mul(100).toDecimalPlaces(2)),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async sales(portfolioId: number, userId: number) {
    await this.assertInvestorPortfolio(portfolioId, userId);

    return this.prisma.stock_sales.findMany({
      where: { portfolio_id: portfolioId },
      include: { allocations: true },
      orderBy: [{ sold_date: 'desc' }, { id: 'desc' }],
    });
  }

  private allocateSequential(lots: Lot[], requested: Prisma.Decimal) {
    let remaining = requested;
    const result: Array<{
      purchase_id: number;
      shares: Prisma.Decimal;
      unit_cost: Prisma.Decimal;
      cost_basis: Prisma.Decimal;
    }> = [];

    for (const lot of lots) {
      if (remaining.lte(0)) break;
      const shares = Prisma.Decimal.min(lot.remaining_shares, remaining);
      const feePerShare = lot.shares_count.isZero()
        ? new Prisma.Decimal(0)
        : lot.fees.div(lot.shares_count);
      const unitCost = lot.purchase_price.add(feePerShare);

      result.push({
        purchase_id: lot.id,
        shares,
        unit_cost: unitCost,
        cost_basis: shares.mul(unitCost).toDecimalPlaces(2),
      });
      remaining = remaining.sub(shares);
    }

    return result;
  }

  private allocateAverage(lots: Lot[], requested: Prisma.Decimal) {
    const totalShares = lots.reduce(
      (sum, lot) => sum.add(lot.remaining_shares),
      new Prisma.Decimal(0),
    );
    let assigned = new Prisma.Decimal(0);

    return lots
      .map((lot, index) => {
        const shares = index === lots.length - 1
          ? requested.sub(assigned)
          : requested.mul(lot.remaining_shares).div(totalShares).toDecimalPlaces(8);
        assigned = assigned.add(shares);

        const feePerShare = lot.shares_count.isZero()
          ? new Prisma.Decimal(0)
          : lot.fees.div(lot.shares_count);
        const unitCost = lot.purchase_price.add(feePerShare);

        return {
          purchase_id: lot.id,
          shares,
          unit_cost: unitCost,
          cost_basis: shares.mul(unitCost).toDecimalPlaces(2),
        };
      })
      .filter((allocation) => allocation.shares.gt(0));
  }

  private async lockInvestorPortfolio(
    tx: Prisma.TransactionClient,
    portfolioId: number,
    userId: number,
  ) {
    await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${portfolioId} FOR UPDATE`;
    const portfolio = await tx.portfolios.findFirst({
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

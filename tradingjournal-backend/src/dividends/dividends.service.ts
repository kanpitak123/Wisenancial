import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortfolioType,
  Prisma,
  RecordSource,
  RecordStatus,
  RecordType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDividendDto } from './dto/create-dividend.dto';
import { UpdateDividendDto } from './dto/update-dividend.dto';

@Injectable()
export class DividendsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(portfolioId: number, userId: number) {
    await this.assertInvestorPortfolio(portfolioId, userId);
    return this.prisma.dividends.findMany({
      where: {
        portfolio_id: portfolioId,
        user_id: userId,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
    });
  }

  async summary(portfolioId: number, userId: number, year?: number) {
    await this.assertInvestorPortfolio(portfolioId, userId);
    const where: Prisma.dividendsWhereInput = {
      portfolio_id: portfolioId,
      user_id: userId,
      status: RecordStatus.ACTIVE,
    };

    if (year) {
      where.payment_date = {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      };
    }

    const result = await this.prisma.dividends.aggregate({
      where,
      _sum: {
        gross_amount: true,
        tax_withheld: true,
        net_amount: true,
      },
      _count: { _all: true },
    });

    return {
      portfolio_id: portfolioId,
      year: year ?? null,
      count: result._count._all,
      gross_amount: Number(result._sum.gross_amount ?? 0),
      tax_withheld: Number(result._sum.tax_withheld ?? 0),
      net_amount: Number(result._sum.net_amount ?? 0),
    };
  }

  async create(portfolioId: number, userId: number, dto: CreateDividendDto) {
    const portfolio = await this.assertInvestorPortfolio(portfolioId, userId);
    const currency = (portfolio.currency ?? 'USD').toUpperCase();
    const values = this.calculate(
      dto.shares,
      dto.dividend_per_share,
      dto.wht_rate ?? 0.1,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.lockPortfolio(tx, portfolioId);

      const dividend = await tx.dividends.create({
        data: {
          user_id: userId,
          portfolio_id: portfolioId,
          symbol: dto.symbol.trim().toUpperCase(),
          name: dto.name?.trim() || null,
          payment_date: new Date(dto.payment_date),
          status: RecordStatus.ACTIVE,
          ...values,
        },
      });

      const record = await tx.records.create({
        data: {
          portfolio_id: portfolioId,
          type: RecordType.DIVIDEND,
          amount: values.net_amount,
          currency,
          description: `Dividend ${dividend.symbol}`,
          source: RecordSource.DIVIDEND,
          source_id: dividend.id,
          occurred_at: new Date(dto.payment_date),
          created_by_user_id: userId,
        },
      });

      const updatedPortfolio = await tx.portfolios.update({
        where: { id: portfolioId },
        data: { current_balance: { increment: values.net_amount } },
      });

      return {
        dividend,
        record,
        current_balance: Number(updatedPortfolio.current_balance),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(id: number, userId: number, dto: UpdateDividendDto) {
    const existing = await this.findOne(id, userId);
    const shares = dto.shares ?? Number(existing.shares);
    const dividendPerShare =
      dto.dividend_per_share ?? Number(existing.dividend_per_share);
    const withholdingRate = dto.wht_rate ?? Number(existing.wht_rate);
    const values = this.calculate(shares, dividendPerShare, withholdingRate);
    const adjustment = values.net_amount.sub(existing.net_amount);

    return this.prisma.$transaction(async (tx) => {
      await this.lockPortfolio(tx, existing.portfolio_id);

      const updatedPortfolio = await tx.portfolios.update({
        where: { id: existing.portfolio_id },
        data: { current_balance: { increment: adjustment } },
      });

      if (updatedPortfolio.current_balance.isNegative()) {
        throw new BadRequestException(
          'การแก้ไขเงินปันผลทำให้ยอดเงินคงเหลือติดลบ',
        );
      }

      const dividend = await tx.dividends.update({
        where: { id },
        data: {
          ...(dto.symbol !== undefined && {
            symbol: dto.symbol.trim().toUpperCase(),
          }),
          ...(dto.name !== undefined && {
            name: dto.name?.trim() || null,
          }),
          ...(dto.payment_date !== undefined && {
            payment_date: new Date(dto.payment_date),
          }),
          ...values,
        },
      });

      const record = await tx.records.updateMany({
        where: {
          source: RecordSource.DIVIDEND,
          source_id: id,
          type: RecordType.DIVIDEND,
          status: RecordStatus.ACTIVE,
        },
        data: {
          amount: values.net_amount,
          description: `Dividend ${dividend.symbol}`,
          ...(dto.payment_date !== undefined && {
            occurred_at: new Date(dto.payment_date),
          }),
        },
      });

      if (record.count === 0) {
        throw new NotFoundException('ไม่พบ cash record ของเงินปันผล');
      }

      return {
        dividend,
        current_balance: Number(updatedPortfolio.current_balance),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(id: number, userId: number) {
    const existing = await this.findOne(id, userId);

    return this.prisma.$transaction(async (tx) => {
      await this.lockPortfolio(tx, existing.portfolio_id);

      const updatedPortfolio = await tx.portfolios.update({
        where: { id: existing.portfolio_id },
        data: { current_balance: { decrement: existing.net_amount } },
      });

      if (updatedPortfolio.current_balance.isNegative()) {
        throw new BadRequestException(
          'ไม่สามารถยกเลิกเงินปันผล เพราะยอดเงินสดคงเหลือไม่เพียงพอ',
        );
      }

      const originalRecord = await tx.records.findFirst({
        where: {
          source: RecordSource.DIVIDEND,
          source_id: id,
          type: RecordType.DIVIDEND,
          status: RecordStatus.ACTIVE,
        },
      });

      if (!originalRecord) {
        throw new NotFoundException('ไม่พบ cash record ของเงินปันผล');
      }

      await tx.records.update({
        where: { id: originalRecord.id },
        data: { status: RecordStatus.REVERSED },
      });

      const reversal = await tx.records.create({
        data: {
          portfolio_id: existing.portfolio_id,
          type: RecordType.REVERSAL,
          source: RecordSource.SYSTEM,
          source_id: originalRecord.id,
          amount: existing.net_amount.negated(),
          currency: originalRecord.currency,
          description: `Reversal of dividend #${id}`,
          occurred_at: new Date(),
          reversal_of_id: originalRecord.id,
          created_by_user_id: userId,
        },
      });

      const dividend = await tx.dividends.update({
        where: { id },
        data: { status: RecordStatus.REVERSED },
      });

      return {
        message: 'ยกเลิกเงินปันผลสำเร็จ',
        reversed_id: id,
        dividend,
        reversal,
        current_balance: Number(updatedPortfolio.current_balance),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private calculate(
    sharesInput: number,
    dividendPerShareInput: number,
    rateInput: number,
  ) {
    const shares = new Prisma.Decimal(sharesInput);
    const dividend_per_share = new Prisma.Decimal(dividendPerShareInput);
    const wht_rate = new Prisma.Decimal(rateInput);
    const gross_amount = shares.mul(dividend_per_share).toDecimalPlaces(2);
    const tax_withheld = gross_amount.mul(wht_rate).toDecimalPlaces(2);
    const net_amount = gross_amount.sub(tax_withheld).toDecimalPlaces(2);

    return {
      shares,
      dividend_per_share,
      wht_rate,
      gross_amount,
      tax_withheld,
      net_amount,
    };
  }

  private async findOne(id: number, userId: number) {
    const item = await this.prisma.dividends.findFirst({
      where: {
        id,
        user_id: userId,
        status: RecordStatus.ACTIVE,
        portfolios: { portfolio_type: PortfolioType.INVESTOR },
      },
    });

    if (!item || item.portfolio_id === null) {
      throw new NotFoundException(
        'ไม่พบรายการเงินปันผล หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return item as typeof item & { portfolio_id: number };
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
      throw new NotFoundException(
        'ไม่พบ Investor portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private async lockPortfolio(
    tx: Prisma.TransactionClient,
    portfolioId: number,
  ) {
    await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${portfolioId} FOR UPDATE`;
  }
}

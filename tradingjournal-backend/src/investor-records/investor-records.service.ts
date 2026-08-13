import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioType, Prisma, RecordSource, RecordStatus, RecordType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestorRecordDto, ManualRecordType } from './dto/create-investor-record.dto';
import { UpdateInvestorRecordDto } from './dto/update-investor-record.dto';

@Injectable()
export class InvestorRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(portfolioId: number, userId: number, type?: RecordType) {
    await this.assertInvestorPortfolio(portfolioId, userId);
    return this.prisma.records.findMany({
      where: {
        portfolio_id: portfolioId,
        status: RecordStatus.ACTIVE,
        ...(type ? { type } : {}),
      },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
  }

  async getSummary(portfolioId: number, userId: number) {
    const portfolio = await this.assertInvestorPortfolio(portfolioId, userId);
    const rows = await this.prisma.records.groupBy({
      by: ['type'],
      where: { portfolio_id: portfolioId, status: RecordStatus.ACTIVE },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totals = Object.fromEntries(
      rows.map((row) => [row.type, {
        amount: Number(row._sum.amount ?? 0),
        count: row._count._all,
      }]),
    );

    return {
      portfolio_id: portfolioId,
      current_balance: Number(portfolio.current_balance),
      initial_balance: Number(portfolio.initial_balance),
      totals,
    };
  }

  async create(portfolioId: number, userId: number, dto: CreateInvestorRecordDto) {
    const portfolio = await this.assertInvestorPortfolio(portfolioId, userId);
    const amount = new Prisma.Decimal(dto.amount);
    const signedAmount = this.signedAmount(dto.record_type, amount);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${portfolioId} FOR UPDATE`;

      const updatedPortfolio = await tx.portfolios.update({
        where: { id: portfolioId },
        data: { current_balance: { increment: signedAmount } },
      });

      if (updatedPortfolio.current_balance.isNegative()) {
        throw new BadRequestException('ยอดเงินคงเหลือไม่เพียงพอสำหรับรายการนี้');
      }

      const record = await tx.records.create({
        data: {
          portfolio_id: portfolioId,
          type: dto.record_type,
          source: RecordSource.MANUAL,
          amount: signedAmount,
          currency: portfolio.currency ?? 'USD',
          description: dto.description ?? null,
          occurred_at: dto.record_date ? new Date(dto.record_date) : new Date(),
          created_by_user_id: userId,
        },
      });

      return { record, current_balance: Number(updatedPortfolio.current_balance) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(id: number, userId: number, dto: UpdateInvestorRecordDto) {
    const existing = await this.findManualRecord(id, userId);
    const nextType = dto.record_type ?? (existing.type as ManualRecordType);
    const nextAbsoluteAmount = dto.amount !== undefined
      ? new Prisma.Decimal(dto.amount)
      : existing.amount.abs();
    const nextSignedAmount = this.signedAmount(nextType, nextAbsoluteAmount);
    const adjustment = nextSignedAmount.sub(existing.amount);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${existing.portfolio_id} FOR UPDATE`;

      const portfolio = await tx.portfolios.update({
        where: { id: existing.portfolio_id },
        data: { current_balance: { increment: adjustment } },
      });
      if (portfolio.current_balance.isNegative()) {
        throw new BadRequestException('การแก้ไขทำให้ยอดเงินคงเหลือติดลบ');
      }

      const record = await tx.records.update({
        where: { id },
        data: {
          type: nextType,
          amount: nextSignedAmount,
          ...(dto.description !== undefined && { description: dto.description || null }),
          ...(dto.record_date !== undefined && { occurred_at: new Date(dto.record_date) }),
        },
      });

      return { record, current_balance: Number(portfolio.current_balance) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(id: number, userId: number) {
    const existing = await this.findManualRecord(id, userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${existing.portfolio_id} FOR UPDATE`;

      const portfolio = await tx.portfolios.update({
        where: { id: existing.portfolio_id },
        data: { current_balance: { decrement: existing.amount } },
      });
      if (portfolio.current_balance.isNegative()) {
        throw new BadRequestException('ไม่สามารถยกเลิกรายการนี้ เพราะจะทำให้ยอดเงินคงเหลือติดลบ');
      }

      const reversal = await tx.records.create({
        data: {
          portfolio_id: existing.portfolio_id,
          type: RecordType.REVERSAL,
          source: RecordSource.SYSTEM,
          source_id: existing.id,
          amount: existing.amount.negated(),
          currency: existing.currency,
          description: `Reversal of record #${existing.id}`,
          occurred_at: new Date(),
          reversal_of_id: existing.id,
          created_by_user_id: userId,
        },
      });

      await tx.records.update({
        where: { id: existing.id },
        data: { status: RecordStatus.REVERSED },
      });

      return {
        message: 'ยกเลิกรายการสำเร็จ',
        reversed_id: id,
        reversal,
        current_balance: Number(portfolio.current_balance),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private signedAmount(type: ManualRecordType, amount: Prisma.Decimal) {
    const absolute = amount.abs();
    return type === RecordType.DEPOSIT ? absolute : absolute.negated();
  }

  private async findManualRecord(id: number, userId: number) {
    const record = await this.prisma.records.findFirst({
      where: {
        id,
        source: RecordSource.MANUAL,
        status: RecordStatus.ACTIVE,
        type: { in: [RecordType.DEPOSIT, RecordType.WITHDRAW] },
        portfolio: { user_id: userId, portfolio_type: PortfolioType.INVESTOR },
      },
    });
    if (!record) {
      throw new NotFoundException('ไม่พบรายการ หรือรายการนี้เป็นรายการระบบที่แก้ไขไม่ได้');
    }
    return record;
  }

  private async assertInvestorPortfolio(portfolioId: number, userId: number) {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId, portfolio_type: PortfolioType.INVESTOR },
    });
    if (!portfolio) {
      throw new NotFoundException('ไม่พบ Investor portfolio หรือคุณไม่มีสิทธิ์เข้าถึง');
    }
    return portfolio;
  }
}

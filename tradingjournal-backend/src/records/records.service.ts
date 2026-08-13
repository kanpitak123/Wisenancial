import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RecordSource,
  RecordStatus,
  RecordType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManualRecordDto } from './dto/create-manual-record.dto';

export interface SystemRecordInput {
  portfolioId: number;
  type: RecordType;
  source: RecordSource;
  sourceId: number;
  signedAmount: number | Prisma.Decimal;
  currency?: string;
  description?: string;
  occurredAt?: Date;
  createdByUserId?: number;
}

export interface RecordQueryOptions {
  type?: RecordType;
  limit?: number;
  from?: Date;
  to?: Date;
  status?: RecordStatus;
}

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    portfolioId: number,
    userId: number,
    options: RecordQueryOptions = {},
  ) {
    await this.assertOwnedPortfolio(
      this.prisma,
      portfolioId,
      userId,
    );

    const limit = Math.min(
      Math.max(options.limit ?? 100, 1),
      10_000,
    );

    return this.prisma.records.findMany({
      where: {
        portfolio_id: portfolioId,
        ...(options.type
          ? { type: options.type }
          : {}),
        status:
          options.status ??
          RecordStatus.ACTIVE,
        ...(options.from || options.to
          ? {
              occurred_at: {
                ...(options.from
                  ? { gte: options.from }
                  : {}),
                ...(options.to
                  ? { lte: options.to }
                  : {}),
              },
            }
          : {}),
      },
      orderBy: [
        { occurred_at: 'desc' },
        { id: 'desc' },
      ],
      take: limit,
    });
  }

  async getSummary(
    portfolioId: number,
    userId: number,
  ) {
    await this.assertOwnedPortfolio(
      this.prisma,
      portfolioId,
      userId,
    );

    const rows = await this.prisma.records.groupBy({
      by: ['type'],
      where: {
        portfolio_id: portfolioId,
        status: RecordStatus.ACTIVE,
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totals: Partial<
      Record<
        RecordType,
        {
          amount: number;
          count: number;
        }
      >
    > = {};

    for (const row of rows) {
      totals[row.type] = {
        amount: Number(
          row._sum.amount ?? 0,
        ),
        count: row._count._all,
      };
    }

    return {
      portfolio_id: portfolioId,
      totals,
      net_amount: rows.reduce(
        (sum, row) =>
          sum +
          Number(row._sum.amount ?? 0),
        0,
      ),
      record_count: rows.reduce(
        (sum, row) =>
          sum + row._count._all,
        0,
      ),
    };
  }

  async createManual(
    portfolioId: number,
    userId: number,
    dto: CreateManualRecordDto,
  ) {
    this.assertManualType(dto.type);

    const signedAmount =
      this.resolveManualSignedAmount(
        dto.type,
        dto.amount,
      );

    return this.prisma.$transaction(
      async (tx) => {
        const portfolio =
          await this.lockOwnedPortfolio(
            tx,
            portfolioId,
            userId,
          );

        const currency =
          this.resolveCurrency(
            dto.currency,
            portfolio.currency,
          );

        const occurredAt = dto.occurred_at
          ? new Date(dto.occurred_at)
          : new Date();

        if (
          Number.isNaN(
            occurredAt.getTime(),
          )
        ) {
          throw new BadRequestException(
            'occurred_at ไม่ถูกต้อง',
          );
        }

        const record =
          await tx.records.create({
            data: {
              portfolio_id: portfolioId,
              type: dto.type,
              source:
                RecordSource.MANUAL,
              amount: signedAmount,
              currency,
              description:
                dto.description?.trim() ||
                null,
              occurred_at: occurredAt,
              created_by_user_id:
                userId,
            },
          });

        await this.applyBalance(
          tx,
          portfolioId,
          signedAmount,
        );

        return this.withCurrentBalance(
          tx,
          portfolioId,
          record,
        );
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  async createSystem(
    input: SystemRecordInput,
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (
      client: Prisma.TransactionClient,
    ) => {
      try {
        const amount =
          new Prisma.Decimal(
            input.signedAmount,
          );

        const portfolio =
          await client.portfolios.findUnique({
            where: {
              id: input.portfolioId,
            },
            select: {
              currency: true,
            },
          });

        if (!portfolio) {
          throw new NotFoundException(
            'ไม่พบ portfolio',
          );
        }

        const record =
          await client.records.create({
            data: {
              portfolio_id:
                input.portfolioId,
              type: input.type,
              source: input.source,
              source_id:
                input.sourceId,
              amount,
              currency:
                this.resolveCurrency(
                  input.currency,
                  portfolio.currency,
                ),
              description:
                input.description?.trim() ||
                null,
              occurred_at:
                input.occurredAt ??
                new Date(),
              created_by_user_id:
                input.createdByUserId ??
                null,
            },
          });

        await this.applyBalance(
          client,
          input.portfolioId,
          amount,
        );

        return record;
      } catch (error) {
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'มี Record ของรายการต้นทางนี้อยู่แล้ว',
          );
        }

        throw error;
      }
    };

    return tx
      ? execute(tx)
      : this.prisma.$transaction(
          execute,
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel
                .Serializable,
          },
        );
  }

  async replaceSystem(
    input: SystemRecordInput,
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (
      client: Prisma.TransactionClient,
    ) => {
      const existing =
        await client.records.findFirst({
          where: {
            portfolio_id:
              input.portfolioId,
            source: input.source,
            source_id: input.sourceId,
            type: input.type,
            status:
              RecordStatus.ACTIVE,
          },
        });

      if (!existing) {
        return this.createSystem(
          input,
          client,
        );
      }

      const nextAmount =
        new Prisma.Decimal(
          input.signedAmount,
        );
      const delta =
        nextAmount.sub(
          existing.amount,
        );

      const updated =
        await client.records.update({
          where: {
            id: existing.id,
          },
          data: {
            amount: nextAmount,
            currency: input.currency
              ? this.resolveCurrency(
                  input.currency,
                  existing.currency,
                )
              : existing.currency,
            description:
              input.description?.trim() ||
              existing.description,
            occurred_at:
              input.occurredAt ??
              existing.occurred_at,
          },
        });

      if (!delta.isZero()) {
        await this.applyBalance(
          client,
          input.portfolioId,
          delta,
        );
      }

      return updated;
    };

    return tx
      ? execute(tx)
      : this.prisma.$transaction(
          execute,
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel
                .Serializable,
          },
        );
  }

  async transfer(
    userId: number,
    fromPortfolioId: number,
    toPortfolioId: number,
    amountInput: number,
    description?: string,
  ) {
    if (
      fromPortfolioId === toPortfolioId
    ) {
      throw new BadRequestException(
        'พอร์ตต้นทางและปลายทางต้องไม่เหมือนกัน',
      );
    }

    const amount =
      new Prisma.Decimal(
        amountInput,
      );

    if (!amount.isPositive()) {
      throw new BadRequestException(
        'amount ต้องมากกว่า 0',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const ids = [
          fromPortfolioId,
          toPortfolioId,
        ].sort((a, b) => a - b);

        for (const id of ids) {
          await tx.$queryRaw`
            SELECT id
            FROM portfolios
            WHERE id = ${id}
            FOR UPDATE
          `;
        }

        const [from, to] =
          await Promise.all([
            this.assertOwnedPortfolio(
              tx,
              fromPortfolioId,
              userId,
            ),
            this.assertOwnedPortfolio(
              tx,
              toPortfolioId,
              userId,
            ),
          ]);

        const fromCurrency =
          this.resolveCurrency(
            undefined,
            from.currency,
          );
        const toCurrency =
          this.resolveCurrency(
            undefined,
            to.currency,
          );

        if (
          fromCurrency !== toCurrency
        ) {
          throw new BadRequestException(
            'ยังไม่รองรับการโอนข้ามสกุลเงิน',
          );
        }

        if (
          from.current_balance.lessThan(
            amount,
          )
        ) {
          throw new BadRequestException(
            'ยอดเงินสดของพอร์ตต้นทางไม่เพียงพอ',
          );
        }

        const groupId = randomUUID();
        const occurredAt = new Date();

        const transferOut =
          await tx.records.create({
            data: {
              portfolio_id:
                fromPortfolioId,
              type:
                RecordType.TRANSFER_OUT,
              source:
                RecordSource.TRANSFER,
              amount: amount.neg(),
              currency: fromCurrency,
              description:
                description?.trim() ||
                `Transfer to portfolio #${toPortfolioId}`,
              occurred_at: occurredAt,
              transfer_group_id:
                groupId,
              created_by_user_id:
                userId,
            },
          });

        const transferIn =
          await tx.records.create({
            data: {
              portfolio_id:
                toPortfolioId,
              type:
                RecordType.TRANSFER_IN,
              source:
                RecordSource.TRANSFER,
              amount,
              currency: toCurrency,
              description:
                description?.trim() ||
                `Transfer from portfolio #${fromPortfolioId}`,
              occurred_at: occurredAt,
              transfer_group_id:
                groupId,
              created_by_user_id:
                userId,
            },
          });

        await this.applyBalance(
          tx,
          fromPortfolioId,
          amount.neg(),
        );
        await this.applyBalance(
          tx,
          toPortfolioId,
          amount,
        );

        return {
          transfer_group_id: groupId,
          transfer_out: transferOut,
          transfer_in: transferIn,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  async reverse(
    recordId: number,
    userId: number,
    reason?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const original =
          await tx.records.findFirst({
            where: {
              id: recordId,
              portfolio: {
                user_id: userId,
              },
            },
          });

        if (!original) {
          throw new NotFoundException(
            'ไม่พบ record หรือไม่มีสิทธิ์เข้าถึง',
          );
        }

        if (
          original.status ===
          RecordStatus.REVERSED
        ) {
          throw new BadRequestException(
            'record นี้ถูก reverse แล้ว',
          );
        }

        if (
          original.type ===
          RecordType.REVERSAL
        ) {
          throw new BadRequestException(
            'ไม่สามารถ reverse รายการ reversal ได้',
          );
        }

        await tx.records.update({
          where: {
            id: original.id,
          },
          data: {
            status:
              RecordStatus.REVERSED,
          },
        });

        const reversal =
          await tx.records.create({
            data: {
              portfolio_id:
                original.portfolio_id,
              type:
                RecordType.REVERSAL,
              source:
                RecordSource.SYSTEM,
              source_id: original.id,
              amount:
                original.amount.neg(),
              currency:
                original.currency,
              description:
                reason?.trim() ||
                `Reverse record #${original.id}`,
              reversal_of_id:
                original.id,
              created_by_user_id:
                userId,
            },
          });

        await this.applyBalance(
          tx,
          original.portfolio_id,
          original.amount.neg(),
        );

        return reversal;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  async reverseSystem(
    portfolioId: number,
    source: RecordSource,
    sourceId: number,
    type: RecordType,
    description?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (
      client: Prisma.TransactionClient,
    ) => {
      const original =
        await client.records.findFirst({
          where: {
            portfolio_id: portfolioId,
            source,
            source_id: sourceId,
            type,
            status:
              RecordStatus.ACTIVE,
          },
        });

      if (!original) {
        throw new NotFoundException(
          'ไม่พบ Active Record ของรายการต้นทาง',
        );
      }

      await client.records.update({
        where: {
          id: original.id,
        },
        data: {
          status:
            RecordStatus.REVERSED,
        },
      });

      const reversal =
        await client.records.create({
          data: {
            portfolio_id:
              portfolioId,
            type:
              RecordType.REVERSAL,
            source:
              RecordSource.SYSTEM,
            source_id:
              original.id,
            amount:
              original.amount.neg(),
            currency:
              original.currency,
            description:
              description?.trim() ||
              `Reverse record #${original.id}`,
            reversal_of_id:
              original.id,
          },
        });

      await this.applyBalance(
        client,
        portfolioId,
        original.amount.neg(),
      );

      return reversal;
    };

    return tx
      ? execute(tx)
      : this.prisma.$transaction(
          execute,
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel
                .Serializable,
          },
        );
  }

  async rebuildBalance(
    portfolioId: number,
    userId: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const portfolio =
          await this.lockOwnedPortfolio(
            tx,
            portfolioId,
            userId,
          );

        const aggregate =
          await tx.records.aggregate({
            where: {
              portfolio_id: portfolioId,
              status:
                RecordStatus.ACTIVE,
            },
            _sum: {
              amount: true,
            },
          });

        const recordsTotal =
          aggregate._sum.amount ??
          new Prisma.Decimal(0);

        const rebuilt =
          portfolio.initial_balance.add(
            recordsTotal,
          );

        const updated =
          await tx.portfolios.update({
            where: {
              id: portfolioId,
            },
            data: {
              current_balance:
                rebuilt,
            },
          });

        return {
          portfolio_id: portfolioId,
          initial_balance: Number(
            portfolio.initial_balance,
          ),
          records_total:
            Number(recordsTotal),
          previous_balance: Number(
            portfolio.current_balance,
          ),
          rebuilt_balance: Number(
            updated.current_balance,
          ),
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private assertManualType(
    type: RecordType,
  ): void {
    const allowed = new Set<RecordType>([
      RecordType.DEPOSIT,
      RecordType.WITHDRAW,
      RecordType.ADJUSTMENT,
      RecordType.FEE,
      RecordType.TAX,
    ]);

    if (!allowed.has(type)) {
      throw new BadRequestException(
        `ไม่อนุญาตให้สร้าง ${type} แบบ Manual`,
      );
    }
  }

  private resolveManualSignedAmount(
    type: RecordType,
    rawAmount: number,
  ) {
    const raw =
      new Prisma.Decimal(
        rawAmount,
      );

    if (
      type === RecordType.ADJUSTMENT
    ) {
      if (raw.isZero()) {
        throw new BadRequestException(
          'ADJUSTMENT amount ห้ามเป็น 0',
        );
      }
      return raw;
    }

    const amount = raw.abs();

    const negativeTypes =
      new Set<RecordType>([
        RecordType.WITHDRAW,
        RecordType.FEE,
        RecordType.TAX,
      ]);

    return negativeTypes.has(type)
      ? amount.neg()
      : amount;
  }

  private resolveCurrency(
    input: string | undefined,
    portfolioCurrency:
      | string
      | null,
  ) {
    const currency = (
      input ??
      portfolioCurrency ??
      'USD'
    )
      .trim()
      .toUpperCase();

    if (!currency) {
      throw new BadRequestException(
        'currency ไม่ถูกต้อง',
      );
    }

    return currency;
  }

  private async lockOwnedPortfolio(
    tx: Prisma.TransactionClient,
    portfolioId: number,
    userId: number,
  ) {
    await tx.$queryRaw`
      SELECT id
      FROM portfolios
      WHERE id = ${portfolioId}
      FOR UPDATE
    `;

    return this.assertOwnedPortfolio(
      tx,
      portfolioId,
      userId,
    );
  }

  private async assertOwnedPortfolio(
    client:
      | Prisma.TransactionClient
      | PrismaService,
    portfolioId: number,
    userId: number,
  ) {
    const portfolio =
      await client.portfolios.findFirst({
        where: {
          id: portfolioId,
          user_id: userId,
        },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบ portfolio หรือไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private async applyBalance(
    tx: Prisma.TransactionClient,
    portfolioId: number,
    signedAmount:
      | number
      | Prisma.Decimal,
  ) {
    await tx.portfolios.update({
      where: {
        id: portfolioId,
      },
      data: {
        current_balance: {
          increment:
            new Prisma.Decimal(
              signedAmount,
            ),
        },
      },
    });
  }

  private async withCurrentBalance<T>(
    tx: Prisma.TransactionClient,
    portfolioId: number,
    payload: T,
  ) {
    const portfolio =
      await tx.portfolios.findUnique({
        where: {
          id: portfolioId,
        },
        select: {
          current_balance: true,
        },
      });

    return {
      record: payload,
      current_balance: Number(
        portfolio?.current_balance ??
          0,
      ),
    };
  }
}

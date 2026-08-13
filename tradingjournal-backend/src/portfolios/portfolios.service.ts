import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from './dto/portfolio.dto';

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number, type?: PortfolioType) {
    return this.prisma.portfolios.findMany({
      where: {
        user_id: userId,
        ...(type && { portfolio_type: type }),
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number, userId: number) {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: { id, user_id: userId },
    });

    if (!portfolio) {
      throw new NotFoundException('ไม่พบพอร์ตนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
    }

    return portfolio;
  }

  async create(userId: number, data: CreatePortfolioDto) {
    const name = data.name.trim();
    const portfolioType = data.portfolio_type ?? PortfolioType.TRADER;
    const currency = data.currency?.trim().toUpperCase() ?? 'USD';

    const duplicate = await this.prisma.portfolios.findFirst({
      where: {
        user_id: userId,
        portfolio_type: portfolioType,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('มีพอร์ตชื่อนี้อยู่แล้วในประเภทเดียวกัน');
    }

    const existingCount = await this.prisma.portfolios.count({
      where: {
        user_id: userId,
        portfolio_type: portfolioType,
      },
    });

    const shouldBeDefault = data.is_default ?? existingCount === 0;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await tx.portfolios.updateMany({
            where: {
              user_id: userId,
              portfolio_type: portfolioType,
              is_default: true,
            },
            data: { is_default: false },
          });
        }

        return tx.portfolios.create({
          data: {
            user_id: userId,
            name,
            initial_balance: new Prisma.Decimal(data.initial_balance),
            current_balance: new Prisma.Decimal(data.initial_balance),
            portfolio_type: portfolioType,
            currency,
            icon: data.icon?.trim() || null,
            color: data.color ?? null,
            is_default: shouldBeDefault,
          },
        });
      });
    } catch (error: unknown) {
      this.rethrowPrismaError(error);
      throw error;
    }
  }

  async update(id: number, userId: number, data: UpdatePortfolioDto) {
    const portfolio = await this.findOne(id, userId);
    const previousType = portfolio.portfolio_type;
    const nextType = data.portfolio_type ?? portfolio.portfolio_type;
    const nextName = data.name?.trim();

    if (nextName) {
      const duplicate = await this.prisma.portfolios.findFirst({
        where: {
          user_id: userId,
          portfolio_type: nextType,
          name: { equals: nextName, mode: 'insensitive' },
          NOT: { id },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('มีพอร์ตชื่อนี้อยู่แล้วในประเภทเดียวกัน');
      }
    }

    const hasActivity = await this.hasPortfolioActivity(id);

    if (hasActivity && nextType !== portfolio.portfolio_type) {
      throw new BadRequestException(
        'ไม่สามารถเปลี่ยนประเภทพอร์ตที่มีข้อมูลอยู่แล้ว',
      );
    }

    if (
      hasActivity &&
      data.initial_balance !== undefined &&
      !new Prisma.Decimal(data.initial_balance).equals(
        portfolio.initial_balance,
      )
    ) {
      throw new BadRequestException(
        'ไม่สามารถแก้เงินทุนเริ่มต้นของพอร์ตที่มีข้อมูลอยู่แล้ว',
      );
    }

    const typeChanged = previousType !== nextType;
    const shouldBecomeDefault =
      data.is_default === true || (typeChanged && portfolio.is_default);

    if (data.is_default === false && portfolio.is_default && !typeChanged) {
      throw new BadRequestException('ต้องกำหนดพอร์ตอื่นเป็นค่าเริ่มต้นก่อน');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (shouldBecomeDefault) {
          await tx.portfolios.updateMany({
            where: {
              user_id: userId,
              portfolio_type: nextType,
              is_default: true,
              NOT: { id },
            },
            data: { is_default: false },
          });
        }

        const updated = await tx.portfolios.update({
          where: { id },
          data: {
            ...(nextName !== undefined && { name: nextName }),
            ...(data.initial_balance !== undefined && {
              initial_balance: new Prisma.Decimal(data.initial_balance),
              current_balance: new Prisma.Decimal(data.initial_balance),
            }),
            ...(data.portfolio_type !== undefined && {
              portfolio_type: nextType,
            }),
            ...(data.currency !== undefined && {
              currency: data.currency.trim().toUpperCase(),
            }),
            ...(data.icon !== undefined && {
              icon: data.icon?.trim() || null,
            }),
            ...(data.color !== undefined && {
              color: data.color,
            }),
            ...(shouldBecomeDefault && {
              is_default: true,
            }),
            ...(data.is_default === false &&
              !portfolio.is_default && {
                is_default: false,
              }),
          },
        });

        if (typeChanged && portfolio.is_default) {
          await this.assignReplacementDefault(tx, userId, previousType);
        }

        return updated;
      });
    } catch (error: unknown) {
      this.rethrowPrismaError(error);
      throw error;
    }
  }

  async remove(id: number, userId: number) {
    const portfolio = await this.findOne(id, userId);

    if (await this.hasPortfolioActivity(id)) {
      throw new ConflictException(
        'ไม่สามารถลบพอร์ตที่มีรายการเทรดหรือการลงทุนอยู่',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.portfolios.delete({ where: { id } });

        if (portfolio.is_default) {
          await this.assignReplacementDefault(
            tx,
            userId,
            portfolio.portfolio_type,
          );
        }

        return {
          message: 'ลบพอร์ตสำเร็จ',
          deleted_id: id,
        };
      });
    } catch (error: unknown) {
      this.rethrowPrismaError(error);
      throw error;
    }
  }

  private async assignReplacementDefault(
    tx: Prisma.TransactionClient,
    userId: number,
    type: PortfolioType,
  ) {
    const replacement = await tx.portfolios.findFirst({
      where: {
        user_id: userId,
        portfolio_type: type,
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    if (replacement) {
      await tx.portfolios.update({
        where: { id: replacement.id },
        data: { is_default: true },
      });
    }
  }

  private async hasPortfolioActivity(portfolioId: number) {
    const counts = await this.prisma.$transaction([
      this.prisma.trades.count({
        where: { portfolio_id: portfolioId },
      }),
      this.prisma.trade_imports.count({
        where: { portfolio_id: portfolioId },
      }),
      this.prisma.goals.count({
        where: { portfolio_id: portfolioId },
      }),
      this.prisma.stock_purchases.count({
        where: { portfolio_id: portfolioId },
      }),
      this.prisma.records.count({
        where: { portfolio_id: portfolioId },
      }),
      this.prisma.dividends.count({
        where: { portfolio_id: portfolioId },
      }),
    ]);

    return counts.some((count) => count > 0);
  }

  private rethrowPrismaError(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('ไม่พบพอร์ตนี้');
      }

      if (error.code === 'P2002') {
        throw new ConflictException('ข้อมูลพอร์ตซ้ำกับข้อมูลที่มีอยู่แล้ว');
      }
    }
  }
}

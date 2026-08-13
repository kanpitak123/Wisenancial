import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortfolioType,
  Prisma,
  RecordSource,
  RecordType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { CloseTradeDto } from './dto/close-trade.dto';
import { CreateTradeDto, TradeSide } from './dto/create-trade.dto';
import { UpdateTradeDto } from './dto/update-trade.dto';
import { PnlBreakdown, PnlCalculatorService } from './pnl-calculator.service';

type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN';

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pnlCalculator: PnlCalculatorService,
    private readonly recordsService: RecordsService,
  ) {}

  async findActiveTrades(userId: number, portfolioId?: number) {
    if (portfolioId) await this.assertTraderPortfolio(portfolioId, userId);
    return this.prisma.trades.findMany({
      where: {
        user_id: userId,
        result_status: 'OPEN',
        ...(portfolioId ? { portfolio_id: portfolioId } : {}),
      },
      orderBy: { opened_at: 'desc' },
    });
  }

  async findAllByPortfolio(portfolioId: number, userId: number) {
    await this.assertTraderPortfolio(portfolioId, userId);
    return this.prisma.trades.findMany({
      where: { portfolio_id: portfolioId, user_id: userId },
      orderBy: [{ closed_at: 'desc' }, { opened_at: 'desc' }, { id: 'desc' }],
    });
  }

  async createOpenTrade(userId: number, portfolioId: number, data: CreateTradeDto) {
    await this.assertTraderPortfolio(portfolioId, userId);
    return this.prisma.trades.create({
      data: {
        user_id: userId,
        portfolio_id: portfolioId,
        source: 'manual',
        pair: this.normalizePair(data.pair),
        trade_type: data.trade_type,
        volume: this.decimalOrNull(data.volume),
        open_price: this.decimalOrNull(data.open_price),
        stop_loss: this.decimalOrNull(data.stop_loss),
        take_profit: this.decimalOrNull(data.take_profit),
        commission: this.decimalOrNull(data.commission),
        swap: this.decimalOrNull(data.swap),
        opened_at: this.dateOrNow(data.opened_at),
        result_status: 'OPEN',
        timeframe: data.timeframe ?? null,
        trend: data.trend ?? null,
        strategy: data.strategy ?? null,
        emotion: data.emotion ?? null,
        entry_reason: data.entry_reason ?? null,
        note: data.note ?? null,
        asset_name: data.asset_name ?? null,
        rsi: data.rsi ?? null,
        macd: data.macd ?? null,
        target_points: data.target_points ?? null,
        raw_data: this.toJson({ contract_size: data.contract_size ?? 1 }),
      },
    });
  }

  async createClosedTrade(userId: number, portfolioId: number, data: CreateTradeDto) {
    await this.assertTraderPortfolio(portfolioId, userId);
    const calculated = this.resolvePnl(data);

    return this.prisma.$transaction(async (tx) => {
      const trade = await tx.trades.create({
        data: {
          user_id: userId,
          portfolio_id: portfolioId,
          source: 'manual',
          pair: this.normalizePair(data.pair),
          trade_type: data.trade_type,
          volume: this.decimalOrNull(data.volume),
          open_price: this.decimalOrNull(data.open_price),
          close_price: this.decimalOrNull(data.close_price),
          stop_loss: this.decimalOrNull(data.stop_loss),
          take_profit: this.decimalOrNull(data.take_profit),
          commission: this.decimalOrNull(data.commission),
          swap: this.decimalOrNull(data.swap),
          pnl: new Prisma.Decimal(calculated.netPnl),
          opened_at: this.dateOrNow(data.opened_at),
          closed_at: this.dateOrNow(data.closed_at),
          result_status: calculated.resultStatus,
          timeframe: data.timeframe ?? null,
          trend: data.trend ?? null,
          strategy: data.strategy ?? null,
          emotion: data.emotion ?? null,
          entry_reason: data.entry_reason ?? null,
          note: data.note ?? null,
          asset_name: data.asset_name ?? null,
          rsi: data.rsi ?? null,
          macd: data.macd ?? null,
          target_points: data.target_points ?? null,
          raw_data: this.toJson({
            contract_size: data.contract_size ?? 1,
            pnl_breakdown: calculated.breakdown,
          }),
        },
      });

      await this.recordsService.createSystem(
        {
          portfolioId,
          type: RecordType.TRADE_PNL,
          source: RecordSource.TRADE,
          sourceId: trade.id,
          signedAmount: calculated.netPnl,
          description: `Closed ${trade.pair}`,
          occurredAt: trade.closed_at ?? new Date(),
        },
        tx,
      );

      return trade;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async upsertImportedClosedTrade(
    tx: Prisma.TransactionClient,
    input: {
      portfolioId: number;
      userId: number;
      importId: number;
      broker: string;
      accountId: string;
      ticketId: string;
      pair: string;
      tradeType: TradeSide;
      volume: Prisma.Decimal | null;
      openPrice: Prisma.Decimal | null;
      closePrice: Prisma.Decimal | null;
      pnl: number;
      openedAt: Date;
      closedAt: Date;
    },
  ) {
    const existing = await tx.trades.findFirst({
      where: {
        portfolio_id: input.portfolioId,
        broker: input.broker,
        ticket_id: input.ticketId,
      },
      select: { id: true },
    });

    const data = {
      portfolio_id: input.portfolioId,
      user_id: input.userId,
      import_id: input.importId,
      broker: input.broker,
      account_id: input.accountId,
      ticket_id: input.ticketId,
      source: 'import',
      pair: this.normalizePair(input.pair),
      trade_type: input.tradeType,
      volume: input.volume,
      open_price: input.openPrice,
      close_price: input.closePrice,
      pnl: new Prisma.Decimal(input.pnl),
      result_status: this.resultStatus(input.pnl),
      opened_at: input.openedAt,
      closed_at: input.closedAt,
    };

    const trade = existing
      ? await tx.trades.update({ where: { id: existing.id }, data })
      : await tx.trades.create({ data });

    await this.recordsService.replaceSystem(
      {
        portfolioId: input.portfolioId,
        type: RecordType.TRADE_PNL,
        source: RecordSource.TRADE,
        sourceId: trade.id,
        signedAmount: input.pnl,
        description: `Imported ${trade.pair}`,
        occurredAt: input.closedAt,
      },
      tx,
    );

    return trade;
  }

  async updateOpenTrade(id: number, userId: number, data: UpdateTradeDto) {
    const trade = await this.findOwnedTrade(id, userId);
    if (trade.result_status !== 'OPEN') {
      throw new BadRequestException('แก้ไขได้เฉพาะออเดอร์ที่ยังเปิดอยู่');
    }

    const raw = this.jsonObject(trade.raw_data);
    return this.prisma.trades.update({
      where: { id },
      data: {
        ...(data.pair !== undefined && { pair: this.normalizePair(data.pair) }),
        ...(data.trade_type !== undefined && { trade_type: data.trade_type }),
        ...(data.volume !== undefined && { volume: new Prisma.Decimal(data.volume) }),
        ...(data.open_price !== undefined && { open_price: new Prisma.Decimal(data.open_price) }),
        ...(data.stop_loss !== undefined && { stop_loss: new Prisma.Decimal(data.stop_loss) }),
        ...(data.take_profit !== undefined && { take_profit: new Prisma.Decimal(data.take_profit) }),
        ...(data.commission !== undefined && { commission: new Prisma.Decimal(data.commission) }),
        ...(data.swap !== undefined && { swap: new Prisma.Decimal(data.swap) }),
        ...(data.opened_at !== undefined && { opened_at: new Date(data.opened_at) }),
        ...(data.timeframe !== undefined && { timeframe: data.timeframe }),
        ...(data.trend !== undefined && { trend: data.trend }),
        ...(data.strategy !== undefined && { strategy: data.strategy }),
        ...(data.emotion !== undefined && { emotion: data.emotion }),
        ...(data.entry_reason !== undefined && { entry_reason: data.entry_reason }),
        ...(data.note !== undefined && { note: data.note }),
        ...(data.asset_name !== undefined && { asset_name: data.asset_name }),
        ...(data.rsi !== undefined && { rsi: data.rsi }),
        ...(data.macd !== undefined && { macd: data.macd }),
        ...(data.target_points !== undefined && { target_points: data.target_points }),
        ...(data.contract_size !== undefined && {
          raw_data: this.toJson({ ...raw, contract_size: data.contract_size }),
        }),
      },
    });
  }

  async closeTrade(id: number, userId: number, data: CloseTradeDto) {
    const trade = await this.findOwnedTrade(id, userId);
    if (trade.result_status !== 'OPEN') throw new BadRequestException('ออเดอร์นี้ถูกปิดแล้ว');
    if (trade.portfolio_id === null) throw new BadRequestException('Trade นี้ไม่มี portfolio_id');
    const portfolioId = trade.portfolio_id;
    if (trade.open_price === null || trade.volume === null) {
      throw new BadRequestException('ออเดอร์นี้ไม่มี open_price หรือ volume จึงคำนวณ PnL ไม่ได้');
    }

    const raw = this.jsonObject(trade.raw_data);
    const contractSize = Number(raw.contract_size ?? 1);
    const breakdown = data.pnl === undefined
      ? this.pnlCalculator.calculate({
          trade_type: this.toTradeSide(trade.trade_type),
          open_price: Number(trade.open_price),
          close_price: data.close_price,
          volume: Number(trade.volume),
          contract_size: contractSize,
          commission: Number(trade.commission ?? 0),
          swap: Number(trade.swap ?? 0),
        })
      : { net_pnl: data.pnl, result_status: this.resultStatus(data.pnl) };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trades.update({
        where: { id },
        data: {
          close_price: new Prisma.Decimal(data.close_price),
          closed_at: this.dateOrNow(data.closed_at),
          pnl: new Prisma.Decimal(breakdown.net_pnl),
          result_status: breakdown.result_status,
          ...(data.note !== undefined && { note: data.note }),
          raw_data: this.toJson({
            ...raw,
            contract_size: contractSize,
            pnl_breakdown: breakdown,
          }),
        },
      });

      await this.recordsService.createSystem(
        {
          portfolioId,
          type: RecordType.TRADE_PNL,
          source: RecordSource.TRADE,
          sourceId: trade.id,
          signedAmount: breakdown.net_pnl,
          description: `Closed ${trade.pair}`,
          occurredAt: updated.closed_at ?? new Date(),
        },
        tx,
      );

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  calculatePnl(data: {
    trade_type: TradeSide;
    open_price: number;
    close_price: number;
    volume: number;
    contract_size?: number;
    commission?: number;
    swap?: number;
  }) {
    return this.pnlCalculator.calculate(data);
  }

  async remove(id: number, userId: number) {
    const trade = await this.findOwnedTrade(id, userId);
    if (trade.result_status !== 'OPEN') {
      throw new BadRequestException('ไม่สามารถลบออเดอร์ที่ปิดแล้ว เพราะมี Cash Record เชื่อมอยู่');
    }
    await this.prisma.trades.delete({ where: { id } });
    return { message: 'ลบรายการเทรดสำเร็จ', deleted_id: id };
  }

  async assertTraderPortfolio(portfolioId: number, userId: number) {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: {
        id: portfolioId,
        user_id: userId,
        portfolio_type: PortfolioType.TRADER,
      },
      select: { id: true },
    });
    if (!portfolio) {
      throw new NotFoundException('ไม่พบพอร์ตเทรดนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
    }
  }

  private async findOwnedTrade(id: number, userId: number) {
    const trade = await this.prisma.trades.findFirst({ where: { id, user_id: userId } });
    if (!trade) throw new NotFoundException('ไม่พบรายการเทรด หรือคุณไม่มีสิทธิ์เข้าถึง');
    return trade;
  }

  private resolvePnl(data: CreateTradeDto): {
    netPnl: number;
    resultStatus: TradeResult;
    breakdown: PnlBreakdown | { source: 'manual'; net_pnl: number };
  } {
    if (data.pnl !== undefined) {
      return {
        netPnl: data.pnl,
        resultStatus: this.resultStatus(data.pnl),
        breakdown: { source: 'manual', net_pnl: data.pnl },
      };
    }
    if (data.open_price === undefined || data.close_price === undefined || data.volume === undefined) {
      throw new BadRequestException('ต้องระบุ pnl หรือระบุ open_price, close_price และ volume ให้ครบ');
    }
    const breakdown = this.pnlCalculator.calculate({
      trade_type: data.trade_type,
      open_price: data.open_price,
      close_price: data.close_price,
      volume: data.volume,
      contract_size: data.contract_size,
      commission: data.commission,
      swap: data.swap,
    });
    return {
      netPnl: breakdown.net_pnl,
      resultStatus: breakdown.result_status,
      breakdown,
    };
  }

  private resultStatus(pnl: number): TradeResult {
    return pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN';
  }

  private toTradeSide(value: string): TradeSide {
    if (value === TradeSide.BUY || value === TradeSide.SELL) return value;
    throw new BadRequestException(`trade_type ${value} ไม่ถูกต้อง`);
  }

  private normalizePair(value: string): string {
    const pair = value.trim().toUpperCase();
    if (!pair) throw new BadRequestException('pair is required');
    return pair;
  }

  private decimalOrNull(value?: number) {
    return value === undefined || value === null ? null : new Prisma.Decimal(value);
  }

  private dateOrNow(value?: string): Date {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

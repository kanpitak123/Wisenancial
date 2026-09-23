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
  TradeSource,
  trades,
} from '@prisma/client';
import type { BrokerDeal, BrokerPosition } from '../brokers/interfaces/broker-types';
import { TraderAnalyticsService } from '../analytics/trader-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { CloseTradeDto } from './dto/close-trade.dto';
import { CreateTradeDto, TradeSide } from './dto/create-trade.dto';
import { UpdateTradeDto } from './dto/update-trade.dto';
import { PnlBreakdown, PnlCalculatorService } from './pnl-calculator.service';

type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN';

/** เก็บใน trades.raw_data.deals[] — audit log ระดับ deal เดี่ยวๆ ของ position หนึ่งตัว (ดู Phase 3 design review §4/§7) */
interface Mt5DealLogEntry {
  dealTicket: string;
  orderTicket: string | null;
  entryType: string;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  executedAt: string;
}

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
    const created = await this.prisma.trades.create({
      data: {
        user_id: userId,
        portfolio_id: portfolioId,
        source: TradeSource.MANUAL,
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
    TraderAnalyticsService.invalidate(portfolioId, userId);
    return created;
  }

  async createClosedTrade(userId: number, portfolioId: number, data: CreateTradeDto) {
    await this.assertTraderPortfolio(portfolioId, userId);
    const calculated = this.resolvePnl(data);

    const created = await this.prisma.$transaction(async (tx) => {
      const trade = await tx.trades.create({
        data: {
          user_id: userId,
          portfolio_id: portfolioId,
          source: TradeSource.MANUAL,
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
    TraderAnalyticsService.invalidate(portfolioId, userId);
    return created;
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
      source: TradeSource.IMPORT,
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

  // ==========================================================================
  // MT5 sync (Phase 3) — เรียกจาก Mt5SyncService เท่านั้น (ผ่าน tx เดียวกับที่
  // Mt5SyncService เปิด) ไม่มี ownership check แบบ JWT (userId/portfolioId มาจาก
  // broker_connections ที่ยืนยันตัวตนผ่าน BrokerApiKeyGuard แล้ว ไม่ใช่จาก client เอง)
  //
  // ticket_id ของแถวที่ผ่าน method กลุ่มนี้ = MT5 POSITION_TICKET เสมอ (ไม่ใช่ DEAL_TICKET)
  // เพราะ trades จำลองวงจรชีวิตของ "position" (open -> partial close* -> close) หนึ่งแถว
  // ต่อหนึ่ง position ไม่ใช่หนึ่งแถวต่อหนึ่ง execution — ดู Phase 3 design review §4
  // ==========================================================================

  /**
   * Upsert แถว trades จาก MT5 positions-snapshot (FULL) หนึ่งตำแหน่ง — อัปเดตเฉพาะ field
   * ที่เป็น "สถานะปัจจุบันของ position" (sl/tp/current_price/volume/swap) เท่านั้น
   * ห้ามแตะ pnl/result_status/closed_at ที่นี่เด็ดขาด — นั่นเป็นหน้าที่ของ applyMt5Deal()
   * (deal จริง) และ closeMt5PositionsByAbsence() (ปิดเพราะหายไปจาก snapshot) เท่านั้น
   * เพื่อไม่ให้ path การอัปเดต metadata กับ path การบันทึกเงินสดปนกัน
   */
  async upsertMt5Position(
    tx: Prisma.TransactionClient,
    input: {
      connectionId: number;
      portfolioId: number;
      userId: number;
      position: BrokerPosition;
    },
  ): Promise<trades> {
    const existing = await tx.trades.findFirst({
      where: {
        broker_connection_id: input.connectionId,
        ticket_id: input.position.externalPositionId,
      },
    });

    const raw = existing ? this.jsonObject(existing.raw_data) : {};

    const sharedData = {
      pair: input.position.symbol,
      trade_type: this.mt5DirectionToTradeSide(input.position.direction),
      volume: new Prisma.Decimal(input.position.volume),
      open_price: new Prisma.Decimal(input.position.openPrice),
      close_price: this.decimalOrNull(input.position.currentPrice ?? undefined),
      stop_loss: this.decimalOrNull(input.position.stopLoss ?? undefined),
      take_profit: this.decimalOrNull(input.position.takeProfit ?? undefined),
      swap: new Prisma.Decimal(input.position.swap ?? 0),
      opened_at: input.position.openedAt,
    };

    if (existing) {
      return tx.trades.update({ where: { id: existing.id }, data: sharedData });
    }

    return tx.trades.create({
      data: {
        user_id: input.userId,
        portfolio_id: input.portfolioId,
        broker_connection_id: input.connectionId,
        broker: 'MT5',
        ticket_id: input.position.externalPositionId,
        source: TradeSource.MT5_SYNC,
        result_status: 'OPEN',
        raw_data: this.toJson(raw),
        ...sharedData,
      },
    });
  }

  /**
   * ปิด trades ทุกแถวที่ยัง OPEN ของ connection นี้ แต่ ticket_id ไม่อยู่ใน FULL snapshot
   * ล่าสุด (closing-by-absence) — เรียกได้เฉพาะเมื่อ snapshot ผ่านการยืนยันแล้วว่าเป็น FULL
   * และเป็นของ connection ที่ authenticate แล้วเท่านั้น (caller คือ Mt5SyncService ตรวจ
   * เงื่อนไขนี้ก่อนเรียกเสมอ — ดู Phase 3 design review §16 "closing-by-absence")
   *
   * pnl ที่ปิดด้วยวิธีนี้คือ realized P&L สะสมล่าสุดที่มีอยู่แล้วบนแถว (จาก deal ที่เคย
   * ประมวลผลมาก่อนหน้านี้) — ถ้า deal ปิดจริงมาถึงทีหลัง (ไม่ว่าก่อนหรือหลัง snapshot นี้)
   * applyMt5Deal() จะอัปเดต pnl/records ทับแถวที่ปิดไปแล้วนี้ได้อีกตามปกติ (self-heal)
   */
  async closeMt5PositionsByAbsence(
    tx: Prisma.TransactionClient,
    connectionId: number,
    openPositionTickets: ReadonlySet<string>,
  ): Promise<number[]> {
    const staleOpenTrades = await tx.trades.findMany({
      where: {
        broker_connection_id: connectionId,
        result_status: 'OPEN',
      },
      select: { id: true, ticket_id: true, pnl: true },
    });

    const toClose = staleOpenTrades.filter(
      (t) => t.ticket_id !== null && !openPositionTickets.has(t.ticket_id),
    );

    for (const trade of toClose) {
      const pnl = Number(trade.pnl ?? 0);
      await tx.trades.update({
        where: { id: trade.id },
        data: {
          result_status: this.resultStatus(pnl),
          closed_at: new Date(),
        },
      });
    }

    return toClose.map((t) => t.id);
  }

  /**
   * ประมวลผล MT5 deal เดี่ยวๆ — dedupe ด้วย dealTicket ผ่าน raw_data.deals[], คำนวณ
   * commission/swap/realized-pnl สะสม "ใหม่ทั้งหมดจาก array" ทุกครั้ง (ไม่ใช่ increment ทีละ
   * ค่า) เพื่อให้ replay payload เดิมซ้ำ หรือ deal มาไม่เรียงลำดับ ก็ยังได้ผลลัพธ์สุดท้าย
   * เหมือนเดิมเป๊ะ — ดู Phase 3 design review §4 "Idempotency design"
   *
   * ไม่แตะ result_status/closed_at ที่นี่ — การปิด position เป็นหน้าที่ของ
   * closeMt5PositionsByAbsence() เท่านั้น (กัน logic การตรวจจับ "ปิดแล้วหรือยัง" กระจาย
   * อยู่สองที่ที่อาจขัดกันเอง)
   */
  async applyMt5Deal(
    tx: Prisma.TransactionClient,
    input: {
      connectionId: number;
      portfolioId: number;
      userId: number;
      deal: BrokerDeal;
    },
  ): Promise<{ trade: trades; applied: boolean }> {
    let existing = await tx.trades.findFirst({
      where: {
        broker_connection_id: input.connectionId,
        ticket_id: input.deal.externalPositionId,
      },
    });

    if (!existing) {
      // Deal มาถึงก่อน position snapshot แรก (เช่น EA เพิ่งเปิดไม้ กด WebRequest จาก
      // OnTimer ก่อนรอบ snapshot ถัดไป, หรือ position ปิดไปแล้วตั้งแต่ก่อน RECONCILE
      // bootstrap รอบแรกจะมาถึง เลยไม่มีทางโผล่ใน positionsSnapshot ให้ upsertMt5Position
      // เติม field ให้เลย) — สร้างแถว OPEN ขั้นต่ำไว้ก่อน แล้วให้ snapshot รอบถัดไป (ถ้ามี)
      // มาเติม field ที่เหลือ (sl/tp/current_price ฯลฯ) ให้ครบ
      //
      // open_price ใช้ราคาของ deal แรกที่เห็นไปพลางก่อน (ถูกเป๊ะถ้าเป็น deal ขาเข้า IN/
      // INOUT ซึ่งเป็นกรณีปกติ — ราคานั้นคือ entry price จริง) แทนที่จะปล่อย NULL ไว้:
      // ถ้า snapshot ตามมาทีหลัง sharedData ใน upsertMt5Position จะเขียนทับด้วยค่าที่ถูกต้อง
      // เป๊ะจาก positionTicket นั้นอยู่แล้ว แต่ position ที่ปิดไปแล้วก่อนจะมี snapshot ใดๆ
      // เห็นมัน (backlog บนสุดของ RECONCILE ครั้งแรก) จะไม่มี snapshot ตามมาเติมให้อีกเลย —
      // ปล่อย NULL ไว้แปลว่า entry price หายไปถาวร ทั้งที่ deal.price ให้ค่าที่ถูกต้องอยู่แล้ว
      existing = await tx.trades.create({
        data: {
          user_id: input.userId,
          portfolio_id: input.portfolioId,
          broker_connection_id: input.connectionId,
          broker: 'MT5',
          ticket_id: input.deal.externalPositionId,
          source: TradeSource.MT5_SYNC,
          pair: input.deal.symbol,
          trade_type: TradeSide.BUY, // ยังไม่รู้ direction จริงจน snapshot มาถึง — แก้ทับได้เสมอ
          open_price: new Prisma.Decimal(input.deal.price),
          result_status: 'OPEN',
          raw_data: this.toJson({}),
        },
      });
    }

    const raw = this.jsonObject(existing.raw_data);
    const deals: Mt5DealLogEntry[] = Array.isArray(raw.deals) ? (raw.deals as Mt5DealLogEntry[]) : [];

    const alreadyRecorded = deals.some((d) => d.dealTicket === input.deal.externalDealId);
    if (alreadyRecorded) {
      return { trade: existing, applied: false };
    }

    const nextDeals: Mt5DealLogEntry[] = [
      ...deals,
      {
        dealTicket: input.deal.externalDealId,
        orderTicket: input.deal.externalOrderId ?? null,
        entryType: input.deal.entryType ?? 'IN',
        volume: input.deal.volume,
        price: input.deal.price,
        commission: input.deal.commission ?? 0,
        swap: input.deal.swap ?? 0,
        profit: input.deal.profit,
        executedAt: input.deal.executedAt.toISOString(),
      },
    ];

    const totals = this.summarizeMt5Deals(nextDeals);

    const updated = await tx.trades.update({
      where: { id: existing.id },
      data: {
        commission: new Prisma.Decimal(totals.commission),
        swap: new Prisma.Decimal(totals.swap),
        volume: new Prisma.Decimal(totals.remainingVolume),
        ...(totals.hasRealizedDeal ? { pnl: new Prisma.Decimal(totals.realizedPnl) } : {}),
        raw_data: this.toJson({ ...raw, deals: nextDeals }),
      },
    });

    if (totals.hasRealizedDeal) {
      await this.recordsService.replaceSystem(
        {
          portfolioId: input.portfolioId,
          type: RecordType.TRADE_PNL,
          source: RecordSource.TRADE,
          sourceId: updated.id,
          signedAmount: totals.realizedPnl,
          description: `MT5 ${updated.pair} #${updated.ticket_id}`,
          occurredAt: input.deal.executedAt,
        },
        tx,
      );
    }

    return { trade: updated, applied: true };
  }

  /**
   * รวมยอด commission/swap สะสม, realized pnl สะสม (เฉพาะ OUT/INOUT/OUT_BY) และ volume คงเหลือ จาก deal log ทั้งหมด — คำนวณใหม่จาก array เสมอ ไม่ increment ทีละค่า
   *
   * Phase 3 hardening review §4 (hedging / OUT_BY) — OUT_BY is what MT5 emits when a
   * hedging-mode account closes a position against an *opposite* position on the same
   * symbol instead of against the market; MT5 reports it as its own deal, scoped to a
   * single position_ticket, with `profit` already computed by the broker for that one
   * leg. We deliberately do NOT attempt to invent full hedging-account semantics here —
   * we don't try to find/pair the opposing position's matching deal, net the two legs
   * against each other, or reconcile them into one combined trade. Each OUT_BY deal is
   * accounted exactly like an OUT deal: realized into *this* position's row only, using
   * the profit/commission/swap MT5 already reported for it. That's sufficient and safe
   * because MT5 has already done the actual netting math broker-side by the time this
   * deal reaches us — we're just recording its result, not computing it. The one thing
   * we do NOT support is reconstructing "which position closed against which" after the
   * fact; that information is not derived, only what's on raw_data.deals[].entryType is
   * kept (verbatim, from mt5-normalizer.ts) for any future auditing/UI that wants it.
   */
  private summarizeMt5Deals(deals: Mt5DealLogEntry[]): {
    commission: number;
    swap: number;
    realizedPnl: number;
    hasRealizedDeal: boolean;
    remainingVolume: number;
  } {
    const REALIZING_TYPES = new Set(['OUT', 'INOUT', 'OUT_BY']);
    let commission = 0;
    let swap = 0;
    let realizedPnl = 0;
    let hasRealizedDeal = false;
    let inVolume = 0;
    let outVolume = 0;

    for (const deal of deals) {
      commission += deal.commission;
      swap += deal.swap;
      if (REALIZING_TYPES.has(deal.entryType)) {
        realizedPnl += deal.profit;
        hasRealizedDeal = true;
        outVolume += deal.volume;
      } else {
        inVolume += deal.volume;
      }
    }

    return {
      commission,
      swap,
      realizedPnl,
      hasRealizedDeal,
      remainingVolume: Math.max(0, inVolume - outVolume),
    };
  }

  private mt5DirectionToTradeSide(direction: 'LONG' | 'SHORT'): TradeSide {
    return direction === 'LONG' ? TradeSide.BUY : TradeSide.SELL;
  }

  /**
   * แก้ไม้ — แยกเป็นสองชั้นตามชนิด field ไม่ใช่บล็อกทั้งก้อนตาม result_status เหมือนเดิม:
   *   - field "ความจริงทางการเงิน/ตัวตนของไม้ที่กระทบ pnl/records" (pair/trade_type/volume/
   *     open_price/commission/swap/opened_at/contract_size) แก้ได้เฉพาะตอนยัง OPEN เท่านั้น
   *     (พฤติกรรมเดิม) — ปิดไปแล้วแปลว่า pnl/records คำนวณจากค่านี้ไปแล้ว แก้ย้อนหลังจะทำให้
   *     เลขไม่ตรงกัน และสำหรับไม้ที่ sync มาจาก broker (MT4_SYNC/MT5_SYNC/WEBULL_SYNC) field
   *     กลุ่มนี้ไม่ควรแก้เองเลยไม่ว่าสถานะไหน — ฝั่ง frontend (isBrokerSyncedTrade())
   *     ไม่ส่ง field กลุ่มนี้มาให้อยู่แล้วสำหรับไม้ sync แต่เช็คซ้ำที่นี่เผื่อ client อื่น
   *   - field "บันทึกประจำวัน/risk annotation" (strategy/trend/emotion/entry_reason/note/
   *     timeframe/stop_loss/take_profit) แก้ได้เสมอไม่ว่าไม้จะ OPEN/ปิดไปแล้ว/มาจาก manual
   *     หรือ sync ก็ตาม — sl/tp อยู่กลุ่มนี้ไม่ใช่กลุ่มการเงินเพราะไม่ถูกใช้คำนวณ pnl เลย
   *     (ดู pnl-calculator.service.ts — ใช้แค่ open/close price + volume + commission/swap)
   *     เป็นแค่บันทึกความเสี่ยงที่ตั้งใจไว้ ผู้ใช้ควรแก้ย้อนหลังได้แม้ไม้ MT5 จะปิดไปแล้ว
   */
  async updateOpenTrade(id: number, userId: number, data: UpdateTradeDto) {
    const trade = await this.findOwnedTrade(id, userId);

    const touchesFinancialField =
      data.pair !== undefined ||
      data.trade_type !== undefined ||
      data.volume !== undefined ||
      data.open_price !== undefined ||
      data.commission !== undefined ||
      data.swap !== undefined ||
      data.opened_at !== undefined ||
      data.contract_size !== undefined;

    if (touchesFinancialField && trade.result_status !== 'OPEN') {
      throw new BadRequestException('แก้ไขข้อมูลการเงิน/ตัวตนของไม้ได้เฉพาะออเดอร์ที่ยังเปิดอยู่ — ปิดไปแล้วแก้ได้เฉพาะบันทึก (strategy/trend/emotion/note/sl/tp ฯลฯ)');
    }

    const raw = this.jsonObject(trade.raw_data);
    const updated = await this.prisma.trades.update({
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
    if (trade.portfolio_id !== null) {
      TraderAnalyticsService.invalidate(trade.portfolio_id, userId);
    }
    return updated;
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

    const closed = await this.prisma.$transaction(async (tx) => {
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
    TraderAnalyticsService.invalidate(portfolioId, userId);
    return closed;
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

  /** ไม้ที่ sync มาจาก broker ต้องลบไม่ได้ผ่าน endpoint นี้ — ต้องยกเลิกผ่านการตัดการเชื่อมต่อ broker แทน
   *  เพื่อไม่ให้ข้อมูลใน Wisenancial เพี้ยนไปจากสถานะจริงบน broker */
  private static readonly USER_DELETABLE_SOURCES: TradeSource[] = [
    TradeSource.MANUAL,
    TradeSource.IMPORT,
  ];

  async remove(id: number, userId: number) {
    const trade = await this.findOwnedTrade(id, userId);

    if (trade.result_status !== 'OPEN') {
      if (!trade.source || !TradesService.USER_DELETABLE_SOURCES.includes(trade.source)) {
        throw new BadRequestException(
          'ไม่สามารถลบไม้ที่ sync มาจาก broker ได้โดยตรง หากต้องการนำออก กรุณายกเลิกการเชื่อมต่อ broker แทน',
        );
      }

      // ไม้ที่ปิดแล้ว (manual/CSV import) มี Cash Record (records, source=TRADE) ผูกอยู่จากตอนปิด/import —
      // ต้อง reverse ก่อนลบ ไม่งั้นยอด Cash balance ของพอร์ตจะค้าง P&L ของไม้ที่ไม่มีอยู่แล้ว (ดู records.service.ts reverseSystem)
      await this.prisma.$transaction(
        async (tx) => {
          if (trade.portfolio_id !== null) {
            try {
              await this.recordsService.reverseSystem(
                trade.portfolio_id,
                RecordSource.TRADE,
                trade.id,
                RecordType.TRADE_PNL,
                `Deleted ${trade.pair}`,
                tx,
              );
            } catch (err) {
              // ไม่มี Active Record ผูกอยู่ (เช่น ข้อมูลเก่าก่อนมี Cash Record) — ไม่มีอะไรต้อง reverse, ลบไม้ได้ตามปกติ
              if (!(err instanceof NotFoundException)) throw err;
            }
          }
          await tx.trades.delete({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } else {
      await this.prisma.trades.delete({ where: { id } });
    }

    if (trade.portfolio_id !== null) {
      TraderAnalyticsService.invalidate(trade.portfolio_id, userId);
    }
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

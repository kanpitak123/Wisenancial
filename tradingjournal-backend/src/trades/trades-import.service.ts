import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as csv from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { TradeSide } from './dto/create-trade.dto';
import { TradesService } from './trades.service';

interface CsvTradeRow {
  ticket?: string;
  order?: string;
  deal?: string;
  symbol?: string;
  item?: string;
  type?: string;
  lots?: string;
  size?: string;
  volume?: string;
  opening_price?: string;
  open_price?: string;
  price?: string;
  closing_price?: string;
  close_price?: string;
  profit?: string;
  pnl?: string;
  opening_time_utc?: string;
  open_time?: string;
  closing_time_utc?: string;
  close_time?: string;
}

@Injectable()
export class TradesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradesService: TradesService,
  ) {}

  async importBrokerData(
    portfolioId: number,
    userId: number,
    fileBuffer: Buffer,
    broker: string,
    accountId: string,
    filename: string,
  ) {
    await this.tradesService.assertTraderPortfolio(portfolioId, userId);
    const rows = this.parseCsv(fileBuffer);

    if (rows.length === 0) {
      throw new BadRequestException('ไม่พบข้อมูลประวัติการเทรดในไฟล์นี้');
    }

    const normalizedBroker = broker.trim().toUpperCase();
    const normalizedAccountId = accountId.trim();

    return this.prisma.$transaction(async (tx) => {
      const tradeImport = await tx.trade_imports.create({
        data: {
          portfolio_id: portfolioId,
          broker: normalizedBroker,
          account_id: normalizedAccountId,
          source: 'csv',
          filename,
          imported_count: 0,
        },
      });

      let importedCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        const ticketId = row.ticket ?? row.order ?? row.deal;
        if (!ticketId) {
          skippedCount++;
          continue;
        }

        await this.tradesService.upsertImportedClosedTrade(tx, {
          portfolioId,
          userId,
          importId: tradeImport.id,
          broker: normalizedBroker,
          accountId: normalizedAccountId,
          ticketId: String(ticketId),
          pair: row.symbol ?? row.item ?? 'UNKNOWN',
          tradeType: this.parseSide(row.type),
          volume: this.decimalOrNull(row.lots ?? row.size ?? row.volume),
          openPrice: this.decimalOrNull(
            row.opening_price ?? row.open_price ?? row.price,
          ),
          closePrice: this.decimalOrNull(
            row.closing_price ?? row.close_price,
          ),
          pnl: this.numberOrZero(row.profit ?? row.pnl),
          openedAt: this.dateOrNow(
            row.opening_time_utc ?? row.open_time,
          ),
          closedAt: this.dateOrNow(
            row.closing_time_utc ?? row.close_time,
          ),
        });

        importedCount++;
      }

      await tx.trade_imports.update({
        where: { id: tradeImport.id },
        data: { imported_count: importedCount },
      });

      return {
        success: true,
        imported_count: importedCount,
        skipped_count: skippedCount,
        import_id: tradeImport.id,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private parseCsv(fileBuffer: Buffer): CsvTradeRow[] {
    try {
      return csv.parse(fileBuffer.toString('utf-8'), {
        columns: (header: string[]) =>
          header.map((item) =>
            item.toLowerCase().trim().replace(/[\s_]+/g, '_'),
          ),
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as CsvTradeRow[];
    } catch {
      throw new BadRequestException('รูปแบบไฟล์ CSV ไม่ถูกต้อง หรือไฟล์เสียหาย');
    }
  }

  private parseSide(value?: string): TradeSide {
    return String(value ?? 'BUY').trim().toUpperCase() === TradeSide.SELL
      ? TradeSide.SELL
      : TradeSide.BUY;
  }

  private decimalOrNull(value?: string) {
    if (!value || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null;
  }

  private numberOrZero(value?: string) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private dateOrNow(value?: string) {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
}

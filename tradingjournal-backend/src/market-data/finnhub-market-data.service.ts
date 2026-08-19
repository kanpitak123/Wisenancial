import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  PortfolioType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type FinnhubQuote = {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

/**
 * Finnhub บางทีก็ timeout / ตอบ 502-504 / โดน rate-limit (429) แบบชั่วคราว
 * โดยเฉพาะช่วง burst — ต่างจาก 400/401/403/404 ที่เป็นปัญหาถาวร (symbol ผิด,
 * token ผิด, ไม่มีสิทธิ์เข้าถึง) retry ไปก็พังซ้ำเหมือนเดิม ไม่ช่วยอะไร
 *
 * ยัง extend ServiceUnavailableException เดิมไว้ (instanceof เดิมที่โค้ดอื่น
 * เช็คอยู่ยังใช้ได้ปกติ) แค่เพิ่ม marker type ไว้ให้ fetchQuoteWithRetry
 * แยกออกว่า error ไหน "ลองใหม่ได้"
 */
class TransientFinnhubError extends ServiceUnavailableException {}

@Injectable()
export class FinnhubMarketDataService {
  private readonly logger = new Logger(
    FinnhubMarketDataService.name,
  );
  private readonly baseUrl =
    'https://finnhub.io/api/v1';

  // ลองใหม่สูงสุด 3 ครั้ง (1 ครั้งแรก + retry 2 ครั้ง) แบบ exponential backoff
  // มี jitter กันหลาย request ยิงพร้อมกันตอน retry (thundering herd)
  private static readonly TRANSIENT_HTTP_STATUS = new Set([
    429, 500, 502, 503, 504,
  ]);
  private static readonly MAX_FETCH_ATTEMPTS = 3;
  private static readonly RETRY_BASE_DELAY_MS = 600;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async syncSymbol(
    symbolInput: string,
    currencyInput = 'USD',
  ) {
    const symbol =
      this.normalizeSymbol(symbolInput);
    const currency =
      this.normalizeCurrency(
        currencyInput,
      );
    const token =
      process.env.FINNHUB_API_KEY;

    if (!token) {
      throw new ServiceUnavailableException(
        'FINNHUB_API_KEY is not configured',
      );
    }

    const url = new URL(
      `${this.baseUrl}/quote`,
    );
    url.searchParams.set(
      'symbol',
      symbol,
    );
    url.searchParams.set('token', token);

    const quote = await this.fetchQuoteWithRetry(
      symbol,
      url,
    );

    const priceDate =
      quote.t > 0
        ? new Date(quote.t * 1000)
        : new Date();

    return this.prisma.market_prices.upsert({
      where: {
        symbol_currency: {
          symbol,
          currency,
        },
      },
      create: {
        symbol,
        currency,
        price: new Prisma.Decimal(
          quote.c,
        ),
        price_date: priceDate,
        source: 'FINNHUB',
      },
      update: {
        price: new Prisma.Decimal(
          quote.c,
        ),
        price_date: priceDate,
        source: 'FINNHUB',
      },
    });
  }

  async syncPortfolio(
    portfolioId: number,
    userId?: number,
  ) {
    if (userId !== undefined) {
      const portfolio =
        await this.prisma.portfolios.findFirst({
          where: {
            id: portfolioId,
            user_id: userId,
            portfolio_type:
              PortfolioType.INVESTOR,
          },
          select: { id: true },
        });

      if (!portfolio) {
        throw new NotFoundException(
          'ไม่พบ Investor portfolio หรือคุณไม่มีสิทธิ์เข้าถึง',
        );
      }
    }

    const rows =
      await this.prisma.stock_purchases.findMany({
        where: {
          portfolio_id: portfolioId,
          remaining_shares: { gt: 0 },
        },
        select: {
          stock_symbol: true,
          currency: true,
        },
        distinct: [
          'stock_symbol',
          'currency',
        ],
      });

    const prices: unknown[] = [];
    const failures: Array<{
      symbol: string;
      reason: string;
    }> = [];

    // Sequential calls reduce the chance of hitting Finnhub rate limits.
    for (const row of rows) {
      try {
        prices.push(
          await this.syncSymbol(
            row.stock_symbol,
            row.currency,
          ),
        );
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : String(error);

        failures.push({
          symbol: row.stock_symbol,
          reason,
        });

        this.logger.warn(
          `Unable to sync ${row.stock_symbol}: ${reason}`,
        );
      }
    }

    return {
      requested: rows.length,
      updated: prices.length,
      failed: failures.length,
      prices,
      failures,
    };
  }

  @Cron(
    CronExpression.EVERY_30_MINUTES,
  )
  async syncAllOpenHoldings() {
    if (
      !process.env.FINNHUB_API_KEY
    ) {
      return;
    }

    const portfolios =
      await this.prisma.stock_purchases.findMany({
        where: {
          remaining_shares: { gt: 0 },
        },
        select: {
          portfolio_id: true,
        },
        distinct: ['portfolio_id'],
      });

    for (const item of portfolios) {
      try {
        await this.syncPortfolio(
          item.portfolio_id,
        );
      } catch (error) {
        this.logger.warn(
          `Unable to sync portfolio ${item.portfolio_id}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }
  }

  // เรียก fetchQuoteOnce ซ้ำเมื่อเจอ error ที่ "ชั่วคราว" เท่านั้น (TransientFinnhubError)
  // — permanent error (symbol ผิด/token ผิด/ไม่มีสิทธิ์) โยนออกไปทันทีไม่ต้องรอ
  private async fetchQuoteWithRetry(
    symbol: string,
    url: URL,
  ): Promise<FinnhubQuote> {
    for (
      let attempt = 1;
      attempt <=
      FinnhubMarketDataService.MAX_FETCH_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.fetchQuoteOnce(
          symbol,
          url,
        );
      } catch (error) {
        const isLastAttempt =
          attempt ===
          FinnhubMarketDataService.MAX_FETCH_ATTEMPTS;

        if (
          !(
            error instanceof
            TransientFinnhubError
          ) ||
          isLastAttempt
        ) {
          throw error;
        }

        const delay =
          this.retryDelay(attempt);

        this.logger.warn(
          `Finnhub transient error for ${symbol} (attempt ${attempt}/${FinnhubMarketDataService.MAX_FETCH_ATTEMPTS}), retrying in ${Math.round(delay)}ms: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        await this.sleep(delay);
      }
    }

    // เข้าถึงบรรทัดนี้ไม่ได้จริง — loop ข้างบน return หรือ throw เสมอ
    // (เผื่อ TS เข้มงวดเรื่อง control flow)
    throw new ServiceUnavailableException(
      `Finnhub request failed for ${symbol} after ${FinnhubMarketDataService.MAX_FETCH_ATTEMPTS} attempts`,
    );
  }

  private async fetchQuoteOnce(
    symbol: string,
    url: URL,
  ): Promise<FinnhubQuote> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
        signal:
          AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // ของเดิมกลืน error ทิ้งทั้งก้อน เหลือแต่ "Finnhub request failed" ที่ไม่บอกอะไรเลย
      // ว่าเป็น timeout / DNS / TLS / ถูกบล็อก — ต้องเห็นของจริงถึงจะไล่ต่อได้
      // network error แบบนี้ถือเป็น transient เสมอ (ลองใหม่ได้)
      const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
      const detail = [
        `name=${error instanceof Error ? error.name : typeof error}`,
        `message=${error instanceof Error ? error.message : String(error)}`,
        `causeCode=${cause?.code ?? 'none'}`,
      ].join(' ');

      this.logger.error(
        `Finnhub request failed for ${symbol} (url=${url.pathname}?symbol=${symbol}): ${detail}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new TransientFinnhubError(
        `Finnhub request failed for ${symbol}: ${detail}`,
      );
    }

    if (!response.ok) {
      // body ของ Finnhub บอกสาเหตุจริง (เช่น "You don't have access to this resource"
      // ตอน symbol อยู่นอกแพ็กเกจฟรี หรือ rate limit) — ไม่เก็บไว้ก็ไล่ต่อไม่ได้
      const body = await response
        .text()
        .then((text) => text.slice(0, 300))
        .catch(() => '<unreadable>');

      this.logger.error(
        `Finnhub returned HTTP ${response.status} for ${symbol}: ${body}`,
      );

      const message = `Finnhub returned HTTP ${response.status} for ${symbol}: ${body}`;

      // 429 (rate limit) และ 5xx (server-side ของ Finnhub เอง) เป็นปัญหาชั่วคราว
      // ที่ retry แล้วมีโอกาสหาย — ส่วน 400/401/403/404 คือปัญหาถาวรของ request นี้เอง
      if (
        FinnhubMarketDataService.TRANSIENT_HTTP_STATUS.has(
          response.status,
        )
      ) {
        throw new TransientFinnhubError(
          message,
        );
      }

      throw new ServiceUnavailableException(
        message,
      );
    }

    const quote =
      (await response.json()) as FinnhubQuote;

    if (
      !Number.isFinite(quote.c) ||
      quote.c <= 0
    ) {
      // ตอบ 200 มาแต่ข้อมูลว่าง/ไม่ valid — ไม่ใช่ปัญหาเครือข่ายชั่วคราว
      // (Finnhub มักตอบแบบนี้ตอน symbol ไม่มีอยู่จริง) จึงไม่ retry
      throw new ServiceUnavailableException(
        `Finnhub returned no valid quote for ${symbol}`,
      );
    }

    return quote;
  }

  private retryDelay(attempt: number): number {
    const backoff =
      FinnhubMarketDataService.RETRY_BASE_DELAY_MS *
      2 ** (attempt - 1);
    const jitter = Math.random() * 150;
    return backoff + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, ms),
    );
  }

  private normalizeSymbol(
    value: string,
  ): string {
    const symbol = String(
      value ?? '',
    )
      .trim()
      .toUpperCase();

    if (!symbol) {
      throw new ServiceUnavailableException(
        'symbol is required',
      );
    }

    return symbol;
  }

  private normalizeCurrency(
    value: string,
  ): string {
    return String(value ?? 'USD')
      .trim()
      .toUpperCase();
  }
}

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

@Injectable()
export class FinnhubMarketDataService {
  private readonly logger = new Logger(
    FinnhubMarketDataService.name,
  );
  private readonly baseUrl =
    'https://finnhub.io/api/v1';

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
      throw new ServiceUnavailableException(
        `Finnhub request failed for ${symbol}`,
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Finnhub returned HTTP ${response.status}`,
      );
    }

    const quote =
      (await response.json()) as FinnhubQuote;

    if (
      !Number.isFinite(quote.c) ||
      quote.c <= 0
    ) {
      throw new ServiceUnavailableException(
        `Finnhub returned no valid quote for ${symbol}`,
      );
    }

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

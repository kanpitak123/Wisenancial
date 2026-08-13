import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertMarketPriceDto } from './dto/upsert-market-price.dto';

@Injectable()
export class MarketPricesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  upsert(dto: UpsertMarketPriceDto) {
    const symbol =
      this.normalizeSymbol(dto.symbol);
    const currency =
      this.normalizeCurrency(dto.currency);
    const priceDate = dto.price_date
      ? new Date(dto.price_date)
      : new Date();

    if (
      Number.isNaN(priceDate.getTime())
    ) {
      throw new BadRequestException(
        'price_date is invalid',
      );
    }

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
          dto.price,
        ),
        price_date: priceDate,
        source:
          dto.source?.trim().toUpperCase() ??
          'MANUAL',
      },
      update: {
        price: new Prisma.Decimal(
          dto.price,
        ),
        price_date: priceDate,
        source:
          dto.source?.trim().toUpperCase() ??
          'MANUAL',
      },
    });
  }

  find(
    symbols?: string[],
    currency?: string,
  ) {
    const normalizedSymbols = symbols?.length
      ? [
          ...new Set(
            symbols.map((symbol) =>
              this.normalizeSymbol(symbol),
            ),
          ),
        ]
      : undefined;

    return this.prisma.market_prices.findMany({
      where: {
        ...(normalizedSymbols
          ? {
              symbol: {
                in: normalizedSymbols,
              },
            }
          : {}),
        ...(currency
          ? {
              currency:
                this.normalizeCurrency(
                  currency,
                ),
            }
          : {}),
      },
      orderBy: [
        { symbol: 'asc' },
        { currency: 'asc' },
      ],
    });
  }

  private normalizeSymbol(
    value: string,
  ): string {
    const symbol = value
      .trim()
      .toUpperCase();

    if (!symbol) {
      throw new BadRequestException(
        'symbol is required',
      );
    }

    return symbol;
  }

  private normalizeCurrency(
    value?: string,
  ): string {
    const currency = (
      value ?? 'USD'
    )
      .trim()
      .toUpperCase();

    if (!currency) {
      throw new BadRequestException(
        'currency is required',
      );
    }

    return currency;
  }
}

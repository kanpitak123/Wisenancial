import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddWatchlistDto } from './dto/watchlist.dto';

type WatchlistScope = 'ALL' | PortfolioType;

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Watchlist is user-scoped in Prisma:
   * @@unique([user_id, symbol])
   *
   * The portfolio id is retained only as a compatibility/context parameter.
   * It determines whether the caller wants Trader assets or Investor stocks.
   */
  async getWatchlist(
    userId: number,
    portfolioId: number,
  ) {
    const portfolio = await this.requirePortfolio(
      userId,
      portfolioId,
    );

    return this.getByScope(
      userId,
      portfolio.portfolio_type,
      portfolio.currency ?? 'USD',
    );
  }

  async getUserWatchlist(
    userId: number,
    scope: WatchlistScope = 'ALL',
    currency = 'USD',
  ) {
    return this.getByScope(
      userId,
      scope,
      currency,
    );
  }

  async addToWatchlist(
    userId: number,
    portfolioId: number,
    data: AddWatchlistDto,
  ) {
    const portfolio = await this.requirePortfolio(
      userId,
      portfolioId,
    );
    const symbol = this.normalizeSymbol(
      data.symbol,
    );
    const metadata =
      await this.requireMatchingAsset(
        portfolio.portfolio_type,
        symbol,
      );

    const existing =
      await this.prisma.watchlist.findUnique({
        where: {
          user_id_symbol: {
            user_id: userId,
            symbol,
          },
        },
      });

    if (existing) {
      throw new ConflictException(
        `${symbol} อยู่ใน Watchlist แล้ว`,
      );
    }

    return this.prisma.watchlist.create({
      data: {
        user_id: userId,
        symbol,
        name: metadata.name,
        asset_type: metadata.assetType,
        market_region:
          metadata.marketRegion,
      },
    });
  }

  async removeFromWatchlist(
    userId: number,
    portfolioId: number,
    symbolInput: string,
  ) {
    const portfolio = await this.requirePortfolio(
      userId,
      portfolioId,
    );
    const symbol =
      this.normalizeSymbol(symbolInput);

    const item =
      await this.prisma.watchlist.findUnique({
        where: {
          user_id_symbol: {
            user_id: userId,
            symbol,
          },
        },
      });

    if (
      !item ||
      !this.matchesPortfolioType(
        item.asset_type,
        portfolio.portfolio_type,
      )
    ) {
      throw new NotFoundException(
        `${symbol} ไม่อยู่ใน Watchlist ของประเภทพอร์ตนี้`,
      );
    }

    return this.prisma.watchlist.delete({
      where: { id: item.id },
    });
  }

  async isInWatchlist(
    userId: number,
    portfolioId: number,
    symbolInput: string,
  ): Promise<boolean> {
    const portfolio = await this.requirePortfolio(
      userId,
      portfolioId,
    );
    const symbol =
      this.normalizeSymbol(symbolInput);

    const item =
      await this.prisma.watchlist.findUnique({
        where: {
          user_id_symbol: {
            user_id: userId,
            symbol,
          },
        },
        select: {
          asset_type: true,
        },
      });

    return Boolean(
      item &&
        this.matchesPortfolioType(
          item.asset_type,
          portfolio.portfolio_type,
        ),
    );
  }

  private async getByScope(
    userId: number,
    scope: WatchlistScope,
    currencyInput: string,
  ) {
    const records =
      await this.prisma.watchlist.findMany({
        where: {
          user_id: userId,
          ...(scope === 'INVESTOR'
            ? { asset_type: 'STOCK' }
            : scope === 'TRADER'
              ? {
                  NOT: {
                    asset_type: 'STOCK',
                  },
                }
              : {}),
        },
        orderBy: {
          created_at: 'desc',
        },
      });

    if (records.length === 0) {
      return [];
    }

    const symbols = records.map(
      (item) => item.symbol,
    );
    const currency = String(
      currencyInput || 'USD',
    )
      .trim()
      .toUpperCase();

    const prices =
      await this.prisma.market_prices.findMany({
        where: {
          symbol: { in: symbols },
          currency,
        },
      });

    const priceMap = new Map(
      prices.map((item) => [
        item.symbol,
        Number(item.price),
      ]),
    );

    return records.map((record) => ({
      ...record,
      portfolio_type:
        record.asset_type === 'STOCK'
          ? PortfolioType.INVESTOR
          : PortfolioType.TRADER,
      current_price:
        priceMap.get(record.symbol) ?? null,
    }));
  }

  private async requirePortfolio(
    userId: number,
    portfolioId: number,
  ) {
    const portfolio =
      await this.prisma.portfolios.findFirst({
        where: {
          id: portfolioId,
          user_id: userId,
        },
      });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบพอร์ตนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private async requireMatchingAsset(
    type: PortfolioType,
    symbol: string,
  ) {
    if (type === PortfolioType.TRADER) {
      const asset =
        await this.prisma.assets.findFirst({
          where: {
            symbol,
            is_active: true,
          },
        });

      if (!asset) {
        throw new NotFoundException(
          `${symbol} ไม่มีอยู่ในรายการ Asset ของ Trader`,
        );
      }

      return {
        name: asset.name ?? symbol,
        assetType:
          asset.asset_type
            .trim()
            .toUpperCase(),
        marketRegion: 'GLOBAL',
      };
    }

    const stock =
      await this.prisma.stocks.findFirst({
        where: {
          symbol,
          is_active: true,
        },
      });

    if (!stock) {
      throw new NotFoundException(
        `${symbol} ไม่มีอยู่ในรายการหุ้นของ Investor`,
      );
    }

    return {
      name: stock.name,
      assetType: 'STOCK',
      marketRegion:
        stock.symbol.endsWith('.BK') ||
        stock.country
          ?.trim()
          .toUpperCase() === 'THAILAND'
          ? 'TH'
          : 'GLOBAL',
    };
  }

  private matchesPortfolioType(
    assetType: string,
    portfolioType: PortfolioType,
  ): boolean {
    return portfolioType ===
      PortfolioType.INVESTOR
      ? assetType === 'STOCK'
      : assetType !== 'STOCK';
  }

  private normalizeSymbol(
    symbolInput: string,
  ): string {
    const symbol = String(
      symbolInput ?? '',
    )
      .trim()
      .toUpperCase();

    if (!symbol) {
      throw new BadRequestException(
        'กรุณาระบุ symbol',
      );
    }

    if (symbol.length > 50) {
      throw new BadRequestException(
        'symbol ยาวเกินกำหนด',
      );
    }

    return symbol;
  }
}

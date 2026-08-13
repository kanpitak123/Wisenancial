import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioType, Prisma } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';
import { PrismaService } from '../prisma/prisma.service';

const yahooFinance = new YahooFinance();

type ChartInterval = '1d' | '1wk' | '1mo';

export interface NormalizedAsset {
  id: number;
  symbol: string;
  name: string | null;
  asset_type: string;
  portfolio_type: PortfolioType;
  market_region: string;
  sector: string | null;
  exchange: string | null;
  currency: string | null;
  is_active: boolean;
}

export interface ValuationResponse {
  currentPrice: number;
  intrinsicValue: number;
  valuationPercentage: number;
  isOvervalued: boolean;
  scenarios: {
    bear: { price: number; growthRate: number; reasoning: string };
    base: { price: number; growthRate: number; reasoning: string };
    bull: { price: number; growthRate: number; reasoning: string };
  };
  wallStreetTargets: {
    low: number | null;
    mean: number | null;
    high: number | null;
  };
  dcfInputs: {
    freeCashFlow: number | null;
    growthRate: number;
    discountRate: number;
    terminalGrowthRate: number;
    sharesOutstanding: number | null;
    isEstimated?: boolean;
  };
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssetsForPortfolio(
    userId: number,
    portfolioId: number,
    sector?: string,
  ): Promise<NormalizedAsset[]> {
    const portfolio = await this.requirePortfolio(userId, portfolioId);

    if (portfolio.portfolio_type === PortfolioType.TRADER) {
      const assets = await this.prisma.assets.findMany({
        where: { is_active: true },
        orderBy: [{ asset_type: 'asc' }, { symbol: 'asc' }],
      });

      return assets.map((asset) => ({
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        asset_type: asset.asset_type,
        portfolio_type: PortfolioType.TRADER,
        market_region: this.inferTraderMarketRegion(asset.symbol),
        sector: null,
        exchange: null,
        currency: this.inferTraderCurrency(asset.symbol),
        is_active: asset.is_active,
      }));
    }

    const stocks = await this.prisma.stocks.findMany({
      where: {
        is_active: true,
        ...(sector?.trim() && {
          sector: { equals: sector.trim(), mode: 'insensitive' },
        }),
      },
      orderBy: [{ sector: 'asc' }, { symbol: 'asc' }],
    });

    return stocks.map((stock) => ({
      id: stock.id,
      symbol: stock.symbol,
      name: stock.name,
      asset_type: 'STOCK',
      portfolio_type: PortfolioType.INVESTOR,
      market_region: this.inferStockMarketRegion(
        stock.symbol,
        stock.country,
      ),
      sector: stock.sector,
      exchange: stock.exchange,
      currency: stock.currency,
      is_active: stock.is_active,
    }));
  }

  async getChartData(
    userId: number,
    portfolioId: number,
    symbol: string,
    interval: ChartInterval = '1d',
  ) {
    const portfolio = await this.requirePortfolio(userId, portfolioId);
    const normalized = this.normalizeSymbol(symbol);
    await this.requireAssetForPortfolioType(
      portfolio.portfolio_type,
      normalized,
    );

    const yahooSymbol =
      portfolio.portfolio_type === PortfolioType.TRADER
        ? this.toYahooTraderSymbol(normalized)
        : normalized;

    try {
      const result = await yahooFinance.chart(yahooSymbol, {
        period1: '2023-01-01',
        interval,
      });

      return (result.quotes ?? [])
        .filter(
          (item) =>
            item.date && item.close !== null && item.close !== undefined,
        )
        .map((item) => ({
          time: new Date(item.date).toISOString().split('T')[0],
          open: item.open ?? null,
          high: item.high ?? null,
          low: item.low ?? null,
          close: item.close,
          value: item.volume ?? 0,
        }));
    } catch (error) {
      console.error(`Failed to fetch chart for ${normalized}:`, error);
      throw new NotFoundException(
        `ไม่สามารถดึงข้อมูลกราฟของ ${normalized} ได้`,
      );
    }
  }

  async getMonthlyFinancialData(
    userId: number,
    portfolioId: number,
    assetId: number,
  ) {
    const portfolio = await this.requirePortfolio(userId, portfolioId);

    if (portfolio.portfolio_type !== PortfolioType.TRADER) {
      throw new BadRequestException(
        'ข้อมูลรายเดือนจาก asset_monthly_data ใช้กับพอร์ต Trader เท่านั้น',
      );
    }

    const asset = await this.prisma.assets.findFirst({
      where: { id: assetId, is_active: true },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException('ไม่พบ Asset นี้');
    }

    return this.prisma.asset_monthly_data.findMany({
      where: { asset_id: assetId },
      orderBy: { record_date: 'desc' },
    });
  }

  async getInvestorPortfolioOverview(userId: number, portfolioId: number) {
    const portfolio = await this.requirePortfolioType(
      userId,
      portfolioId,
      PortfolioType.INVESTOR,
    );

    const purchases = await this.prisma.stock_purchases.findMany({
      where: {
        portfolio_id: portfolioId,
        remaining_shares: { gt: 0 },
      },
      orderBy: { purchase_date: 'desc' },
    });

    const symbols = [...new Set(purchases.map((item) => item.stock_symbol))];
    const prices = await this.prisma.market_prices.findMany({
      where: {
        symbol: { in: symbols },
        currency: portfolio.currency ?? 'USD',
      },
    });
    const priceMap = new Map(
      prices.map((item) => [item.symbol, Number(item.price)]),
    );

    const grouped = new Map<
      string,
      {
        stock_symbol: string;
        stock_name: string | null;
        total_shares: number;
        total_cost: number;
      }
    >();

    for (const purchase of purchases) {
      const shares = Number(purchase.remaining_shares);
      const unitCost = Number(purchase.purchase_price);
      const current = grouped.get(purchase.stock_symbol) ?? {
        stock_symbol: purchase.stock_symbol,
        stock_name: purchase.stock_name,
        total_shares: 0,
        total_cost: 0,
      };
      current.total_shares += shares;
      current.total_cost += shares * unitCost;
      grouped.set(purchase.stock_symbol, current);
    }

    const stocks = [...grouped.values()].map((stock) => {
      const averageCost =
        stock.total_shares > 0 ? stock.total_cost / stock.total_shares : 0;
      const currentPrice = priceMap.get(stock.stock_symbol) ?? averageCost;
      const currentValue = currentPrice * stock.total_shares;
      const unrealizedPnl = currentValue - stock.total_cost;

      return {
        ...stock,
        average_cost: averageCost,
        current_price: currentPrice,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent:
          stock.total_cost > 0 ? (unrealizedPnl / stock.total_cost) * 100 : 0,
      };
    });

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        currency: portfolio.currency,
        current_balance: Number(portfolio.current_balance),
        total_invested: stocks.reduce((sum, stock) => sum + stock.total_cost, 0),
        total_value: stocks.reduce((sum, stock) => sum + stock.current_value, 0),
      },
      stocks,
    };
  }

  async getStockNews(
    userId: number,
    portfolioId: number,
    symbol: string,
  ) {
    await this.requireInvestorAsset(userId, portfolioId, symbol);
    const normalized = this.normalizeSymbol(symbol);

    const news = await this.prisma.market_news.findMany({
      where: { stock_symbols: { has: normalized } },
      orderBy: { published_at: 'desc' },
      take: 20,
    });

    return news.map((item) => ({
      ...item,
      sentiment_label: this.getSentimentLabel(item.sentiment),
    }));
  }

  async getCorporateEvents(
    userId: number,
    portfolioId: number,
    symbol: string,
  ) {
    await this.requireInvestorAsset(userId, portfolioId, symbol);
    return this.prisma.corporate_events.findMany({
      where: { stock_symbol: this.normalizeSymbol(symbol) },
      orderBy: { event_date: 'asc' },
    });
  }

  async getTrendingStocks(
    userId: number,
    portfolioId: number,
    sector?: string,
  ) {
    await this.requirePortfolioType(
      userId,
      portfolioId,
      PortfolioType.INVESTOR,
    );

    return this.prisma.trending_stocks.findMany({
      where: sector?.trim()
        ? { sector: { equals: sector.trim(), mode: 'insensitive' } }
        : undefined,
      orderBy: { estimated_growth: 'desc' },
      take: 20,
    });
  }

  async getStockValuation(
    userId: number,
    portfolioId: number,
    symbol: string,
  ): Promise<ValuationResponse> {
    await this.requireInvestorAsset(userId, portfolioId, symbol);
    const normalized = this.normalizeSymbol(symbol);

    try {
      const quoteSummary = await yahooFinance.quoteSummary(normalized, {
        modules: [
          'financialData',
          'defaultKeyStatistics',
          'price',
          'summaryDetail',
        ],
      });
      const basicQuote = await yahooFinance.quote(normalized).catch(() => null);

      const financialData = (quoteSummary.financialData ?? {}) as Record<
        string,
        unknown
      >;
      const keyStats = (quoteSummary.defaultKeyStatistics ?? {}) as Record<
        string,
        unknown
      >;
      const price = (quoteSummary.price ?? {}) as Record<string, unknown>;
      const summaryDetail = (quoteSummary.summaryDetail ?? {}) as Record<
        string,
        unknown
      >;
      const quoteData = (basicQuote ?? {}) as Record<string, unknown>;

      const currentPrice = this.numberValue(
        price.regularMarketPrice,
        summaryDetail.regularMarketPrice,
      );
      const targetLow = this.nullableNumberValue(summaryDetail.targetLowPrice);
      const targetMean = this.nullableNumberValue(
        summaryDetail.targetMeanPrice,
      );
      const targetHigh = this.nullableNumberValue(
        summaryDetail.targetHighPrice,
      );

      const freeCashFlow = this.numberValue(
        financialData.freeCashFlow,
        financialData.operatingCashFlow,
        keyStats.freeCashFlow,
      );
      const growthEstimate = this.numberValue(
        financialData.earningsGrowth,
        keyStats.expectedEarningsGrowth,
        0.05,
      );
      const sharesOutstanding = this.numberValue(
        keyStats.sharesOutstanding,
        price.sharesOutstanding,
        summaryDetail.sharesOutstanding,
        quoteData.sharesOutstanding,
      );

      let effectiveFCF = freeCashFlow;
      let isEstimated = false;
      if (effectiveFCF <= 0) {
        const ebitda = this.numberValue(financialData.ebitda);
        const netIncome = this.numberValue(financialData.netIncome);
        if (ebitda > 0) {
          effectiveFCF = ebitda * 0.7;
          isEstimated = true;
        } else if (netIncome > 0) {
          effectiveFCF = netIncome * 1.2;
          isEstimated = true;
        }
      }

      const discountRate = 0.1;
      const terminalGrowthRate = 0.025;
      const baseGrowthRate = Math.max(0.02, Math.min(0.2, growthEstimate));
      const bearGrowthRate = baseGrowthRate * 0.6;
      const bullGrowthRate = Math.min(0.25, baseGrowthRate * 1.5);

      const bearPrice = this.calculateDCF(
        effectiveFCF,
        bearGrowthRate,
        discountRate,
        terminalGrowthRate,
        sharesOutstanding,
      );
      const basePrice = this.calculateDCF(
        effectiveFCF,
        baseGrowthRate,
        discountRate,
        terminalGrowthRate,
        sharesOutstanding,
      );
      const bullPrice = this.calculateDCF(
        effectiveFCF,
        bullGrowthRate,
        discountRate,
        terminalGrowthRate,
        sharesOutstanding,
      );

      const intrinsicValue = basePrice || targetMean || 0;
      const valuationPercentage =
        intrinsicValue > 0
          ? ((currentPrice - intrinsicValue) / intrinsicValue) * 100
          : 0;

      return {
        currentPrice,
        intrinsicValue,
        valuationPercentage,
        isOvervalued: valuationPercentage > 0,
        scenarios: {
          bear: {
            price: bearPrice || targetLow || currentPrice * 0.85,
            growthRate: bearGrowthRate,
            reasoning: 'Conservative scenario using lower growth assumptions.',
          },
          base: {
            price: basePrice || targetMean || currentPrice,
            growthRate: baseGrowthRate,
            reasoning: 'Base scenario using expected growth assumptions.',
          },
          bull: {
            price: bullPrice || targetHigh || currentPrice * 1.15,
            growthRate: bullGrowthRate,
            reasoning: 'Optimistic scenario using stronger growth assumptions.',
          },
        },
        wallStreetTargets: {
          low: targetLow,
          mean: targetMean,
          high: targetHigh,
        },
        dcfInputs: {
          freeCashFlow: effectiveFCF || null,
          growthRate: baseGrowthRate,
          discountRate,
          terminalGrowthRate,
          sharesOutstanding: sharesOutstanding || null,
          isEstimated,
        },
      };
    } catch (error) {
      console.error(`Failed to fetch valuation for ${normalized}:`, error);
      throw new NotFoundException(
        `ไม่สามารถดึงข้อมูลมูลค่าพื้นฐานของ ${normalized} ได้`,
      );
    }
  }

  private async requirePortfolio(userId: number, portfolioId: number) {
    const portfolio = await this.prisma.portfolios.findFirst({
      where: { id: portfolioId, user_id: userId },
    });

    if (!portfolio) {
      throw new NotFoundException(
        'ไม่พบพอร์ตนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
      );
    }

    return portfolio;
  }

  private async requirePortfolioType(
    userId: number,
    portfolioId: number,
    expectedType: PortfolioType,
  ) {
    const portfolio = await this.requirePortfolio(userId, portfolioId);
    if (portfolio.portfolio_type !== expectedType) {
      throw new BadRequestException(
        `Endpoint นี้รองรับพอร์ต ${expectedType} เท่านั้น`,
      );
    }
    return portfolio;
  }

  private async requireInvestorAsset(
    userId: number,
    portfolioId: number,
    symbol: string,
  ) {
    await this.requirePortfolioType(
      userId,
      portfolioId,
      PortfolioType.INVESTOR,
    );
    return this.requireAssetForPortfolioType(
      PortfolioType.INVESTOR,
      this.normalizeSymbol(symbol),
    );
  }

  private async requireAssetForPortfolioType(
    type: PortfolioType,
    symbol: string,
  ) {
    if (type === PortfolioType.TRADER) {
      const asset = await this.prisma.assets.findFirst({
        where: { symbol, is_active: true },
      });
      if (!asset) {
        throw new NotFoundException(
          `${symbol} ไม่มีอยู่ในรายการ Asset ของ Trader`,
        );
      }
      return asset;
    }

    const stock = await this.prisma.stocks.findFirst({
      where: { symbol, is_active: true },
    });
    if (!stock) {
      throw new NotFoundException(
        `${symbol} ไม่มีอยู่ในรายการหุ้นของ Investor`,
      );
    }
    return stock;
  }

  private normalizeSymbol(symbol: string): string {
    const normalized = symbol?.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('กรุณาระบุ symbol');
    }
    return normalized;
  }

  private toYahooTraderSymbol(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'BTC/USD': 'BTC-USD',
      'ETH/USD': 'ETH-USD',
      'BNB/USD': 'BNB-USD',
      'SOL/USD': 'SOL-USD',
      'XRP/USD': 'XRP-USD',
      'DOGE/USD': 'DOGE-USD',
      'XAU/USD': 'GC=F',
      'EUR/USD': 'EURUSD=X',
      'GBP/USD': 'GBPUSD=X',
      'USD/JPY': 'JPY=X',
      'USD/CHF': 'CHF=X',
      US30: '^DJI',
      NAS100: '^IXIC',
      SPX500: '^GSPC',
    };
    return symbolMap[symbol] ?? symbol;
  }

  private inferTraderMarketRegion(symbol: string): string {
    return symbol.includes('/') || symbol.endsWith('500') || symbol === 'US30'
      ? 'GLOBAL'
      : 'GLOBAL';
  }

  private inferTraderCurrency(symbol: string): string | null {
    const parts = symbol.split('/');
    return parts.length === 2 ? parts[1] ?? null : 'USD';
  }

  private inferStockMarketRegion(symbol: string, country: string | null): string {
    if (symbol.endsWith('.BK') || country?.toUpperCase() === 'THAILAND') {
      return 'TH';
    }
    return 'GLOBAL';
  }

  private getSentimentLabel(sentiment: string): string {
    if (sentiment === 'BULLISH') return 'ข่าวดี';
    if (sentiment === 'BEARISH') return 'ข่าวร้าย';
    return 'ข่าวทั่วไป';
  }

  private calculateDCF(
    freeCashFlow: number,
    growthRate: number,
    discountRate: number,
    terminalGrowthRate: number,
    sharesOutstanding: number,
    years = 5,
  ): number {
    if (
      freeCashFlow <= 0 ||
      sharesOutstanding <= 0 ||
      discountRate <= terminalGrowthRate
    ) {
      return 0;
    }

    let presentValue = 0;
    let currentFCF = freeCashFlow;
    for (let year = 1; year <= years; year += 1) {
      currentFCF *= 1 + growthRate;
      presentValue += currentFCF / Math.pow(1 + discountRate, year);
    }

    const terminalValue =
      (currentFCF * (1 + terminalGrowthRate)) /
      (discountRate - terminalGrowthRate);
    const enterpriseValue =
      presentValue + terminalValue / Math.pow(1 + discountRate, years);

    return Math.max(0, enterpriseValue / sharesOutstanding);
  }

  private numberValue(...values: unknown[]): number {
    for (const value of values) {
      const parsed = this.unwrapNumber(value);
      if (parsed !== null && Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private nullableNumberValue(value: unknown): number | null {
    return this.unwrapNumber(value);
  }

  private unwrapNumber(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value && typeof value === 'object' && 'raw' in value) {
      return this.unwrapNumber((value as { raw?: unknown }).raw);
    }
    return null;
  }
}

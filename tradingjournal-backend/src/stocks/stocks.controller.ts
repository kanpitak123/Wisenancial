import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  MarketDataService,
  StockAnalysisResponse,
  StockAnalysisWithValuationResponse,
  IntrinsicValueAnalysis,
  SeasonalityAnalysis,
  AnalystRecommendation,
  YahooFinanceInterval,
} from './market-data.service';
import { StocksService } from './stocks.service';
import type { StockListingParams } from './stocks.service';

@Controller('stocks')
@UseGuards(JwtAuthGuard)
export class StocksController {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly stocksService: StocksService,
  ) {}

  @Get()
  async getStocks(@Query('search') search?: string) {
    // Fetch stocks from database with optional search filter
    return this.stocksService.getStocks(search);
  }

  @Get('listing')
  async getStockListing(
    @Query('search') search?: string,
    @Query('exchange') exchange?: string,
    @Query('sector') sector?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;
    return this.stocksService.getListing({
      search: search ?? '',
      exchange: (exchange as StockListingParams['exchange']) ?? 'ALL',
      sector: sector ?? 'ALL',
      sortBy: (sortBy as StockListingParams['sortBy']) ?? 'marketCap',
      sortDir: sortDir === 'asc' ? 'asc' : 'desc',
      page: Number.isFinite(parsedPage) ? parsedPage : 1,
      pageSize: Number.isFinite(parsedPageSize) ? parsedPageSize : 10,
    });
  }

  @Get('popular')
  async getPopularStocks() {
    return this.marketDataService.getPopularStocks();
  }

  /**
   * P/E + beta ของหลาย symbol พร้อมกัน — ใช้โดยการ์ด AI Risk Analysis
   *
   * รับเป็น comma list ตามแบบเดียวกับ /market/prices ที่มีอยู่แล้ว คืนเป็น array
   * เรียงตาม symbol ที่ขอมา symbol ที่ Yahoo ไม่รู้จักได้ค่า null ทั้งคู่ ไม่ใช่หายไป
   * เฉย ๆ เพื่อให้ผู้เรียกแยกออกว่า "ไม่มีข้อมูล" กับ "ไม่ได้ขอ"
   */
  @Get('fundamentals')
  async getRiskFundamentals(@Query('symbols') symbols?: string) {
    const requested = (symbols ?? '')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);

    if (requested.length === 0) return [];

    const found =
      await this.marketDataService.getRiskFundamentals(requested);

    return requested.map((symbol) => ({
      symbol,
      peRatio: found.get(symbol)?.peRatio ?? null,
      beta: found.get(symbol)?.beta ?? null,
    }));
  }

  // Real index-level stats (level, change, day/52w range, pivots) for the
  // Market Overview header. Symbol is a Yahoo index symbol, e.g. ^SET.BK.
  @Get('index-quote/:symbol')
  async getIndexQuote(@Param('symbol') symbol: string) {
    return this.marketDataService.getIndexQuote(symbol);
  }

  // Real quotes for the popular Thai (SET) stocks shown in Market Overview.
  @Get('popular-th')
  async getPopularThai() {
    return this.marketDataService.getPopularStockRows([
      'PTT.BK',
      'AOT.BK',
      'DELTA.BK',
      'CPALL.BK',
      'KBANK.BK',
      'ADVANC.BK',
      'GULF.BK',
      'SCB.BK',
    ]);
  }

  @Get('radar')
  async getRadar() {
    return this.stocksService.getRadar();
  }

  @Get('analysis/:symbol')
  async getStockAnalysis(
    @Param('symbol') symbol: string,
    @Query('interval') interval?: string,
    @Query('range') range?: string,
  ): Promise<StockAnalysisResponse> {
    try {
      return await this.marketDataService.getCompleteAnalysis(
        symbol.toUpperCase(),
        {
          interval: interval as YahooFinanceInterval | undefined,
          range,
        },
      );
    } catch (error) {
      throw new Error(`Failed to get analysis for ${symbol}: ${error.message}`, {
        cause: error,
      });
    }
  }

  @Get('analysis/:symbol/:timeframe')
  async getStockAnalysisWithTimeframe(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
  ): Promise<StockAnalysisResponse> {
    try {
      return await this.marketDataService.getCompleteAnalysis(
        symbol.toUpperCase(),
        { timeframe },
      );
    } catch (error) {
      throw new Error(
        `Failed to get analysis for ${symbol} with ${timeframe}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('profile/:symbol')
  async getStockProfile(@Param('symbol') symbol: string) {
    try {
      return await this.marketDataService.getStockProfile(symbol.toUpperCase());
    } catch (error) {
      throw new Error(`Failed to get profile for ${symbol}: ${error.message}`, {
        cause: error,
      });
    }
  }

  @Get('financials/:symbol')
  async getStockFinancials(@Param('symbol') symbol: string) {
    try {
      return await this.marketDataService.getFinancialData(
        symbol.toUpperCase(),
      );
    } catch (error) {
      throw new Error(
        `Failed to get financials for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }

  /**
   * interval/range/before เป็น optional เสริมเหนือ :timeframe เดิม — ไม่ส่งมาเลยพฤติกรรม
   * เหมือนเดิมทุกประการ (ผู้เรียกเดิมอย่าง MarketOverviewSection ไม่กระทบ) ผู้เรียกที่รู้
   * interval/range ของตัวเองแน่ชัดอยู่แล้ว (Stock Terminal chart lazy-load ตอน pan ย้อนหลัง)
   * ส่งมาระบุตรงๆ ได้เลย ไม่ต้องพึ่งการเดา interval/range จาก :timeframe ของฝั่ง backend
   * ซึ่งอาจไม่ตรงกับตาราง timeframe ของฝั่ง frontend เป๊ะๆ
   */
  @Get('historical/:symbol/:timeframe')
  async getHistoricalData(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
    @Query('interval') interval?: string,
    @Query('range') range?: string,
    @Query('before') before?: string,
  ) {
    try {
      const beforeDate = before ? new Date(before) : undefined;

      return await this.marketDataService.getHistoricalData(
        symbol.toUpperCase(),
        {
          timeframe,
          interval: interval as YahooFinanceInterval | undefined,
          range,
          before:
            beforeDate && !Number.isNaN(beforeDate.getTime())
              ? beforeDate
              : undefined,
        },
      );
    } catch (error) {
      throw new Error(
        `Failed to get historical data for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('technical/:symbol/:timeframe')
  async getTechnicalIndicators(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
  ) {
    try {
      return await this.marketDataService.getTechnicalIndicators(
        symbol.toUpperCase(),
        { timeframe },
      );
    } catch (error) {
      throw new Error(
        `Failed to get technical indicators for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('intrinsic-value/:symbol')
  async getIntrinsicValue(
    @Param('symbol') symbol: string,
  ): Promise<IntrinsicValueAnalysis> {
    try {
      const profile = await this.marketDataService.getStockProfile(
        symbol.toUpperCase(),
      );
      const financials = await this.marketDataService.getFinancialData(
        symbol.toUpperCase(),
      );
      return await this.marketDataService.calculateIntrinsicValue(
        symbol.toUpperCase(),
        profile,
        financials,
      );
    } catch (error) {
      throw new Error(
        `Failed to calculate intrinsic value for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('analysis-with-valuation/:symbol')
  async getStockAnalysisWithValuation(
    @Param('symbol') symbol: string,
    @Query('interval') interval?: string,
    @Query('range') range?: string,
  ): Promise<StockAnalysisWithValuationResponse> {
    try {
      return await this.marketDataService.getCompleteAnalysisWithValuation(
        symbol.toUpperCase(),
        {
          interval: interval as YahooFinanceInterval | undefined,
          range,
        },
      );
    } catch (error) {
      throw new Error(
        `Failed to get analysis with valuation for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('analysis-with-valuation/:symbol/:timeframe')
  async getStockAnalysisWithValuationAndTimeframe(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
  ): Promise<StockAnalysisWithValuationResponse> {
    try {
      return await this.marketDataService.getCompleteAnalysisWithValuation(
        symbol.toUpperCase(),
        { timeframe },
      );
    } catch (error) {
      throw new Error(
        `Failed to get analysis with valuation for ${symbol} with ${timeframe}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('analyst/:symbol')
  async getAnalystRecommendations(
    @Param('symbol') symbol: string,
  ): Promise<AnalystRecommendation> {
    try {
      return await this.marketDataService.getAnalystRecommendations(
        symbol.toUpperCase(),
      );
    } catch (error) {
      throw new Error(
        `Failed to get analyst recommendations for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }

  @Get('seasonality/:symbol')
  async getSeasonalityAnalysis(
    @Param('symbol') symbol: string,
    @Query('period') period?: string,
  ): Promise<SeasonalityAnalysis> {
    try {
      return await this.marketDataService.getSeasonalityAnalysis(
        symbol.toUpperCase(),
        period || '5Y',
      );
    } catch (error) {
      throw new Error(
        `Failed to get seasonality analysis for ${symbol}: ${error.message}`,
        { cause: error },
      );
    }
  }
}

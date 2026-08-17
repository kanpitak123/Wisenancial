import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AssetsService } from './assets.service';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('portfolio/:portfolioId')
  getAssetsForPortfolio(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('sector') sector?: string,
  ) {
    return this.assetsService.getAssetsForPortfolio(
      user.userId,
      portfolioId,
      sector,
    );
  }

  @Get('portfolio/:portfolioId/chart')
  getChartData(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('symbol') symbol: string,
    @Query('interval') interval: '1d' | '1wk' | '1mo' = '1d',
  ) {
    return this.assetsService.getChartData(
      user.userId,
      portfolioId,
      symbol,
      interval,
    );
  }

  @Get('portfolio/:portfolioId/:assetId/monthly')
  getMonthlyData(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Param('assetId', ParseIntPipe) assetId: number,
  ) {
    return this.assetsService.getMonthlyFinancialData(
      user.userId,
      portfolioId,
      assetId,
    );
  }

  @Get('portfolio/:portfolioId/investor/overview')
  getInvestorPortfolioOverview(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
  ) {
    return this.assetsService.getInvestorPortfolioOverview(
      user.userId,
      portfolioId,
    );
  }

  @Get('portfolio/:portfolioId/investor/news/:symbol')
  getStockNews(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Param('symbol') symbol: string,
  ) {
    return this.assetsService.getStockNews(user.userId, portfolioId, symbol);
  }

  @Get('portfolio/:portfolioId/investor/events/:symbol')
  getCorporateEvents(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Param('symbol') symbol: string,
  ) {
    return this.assetsService.getCorporateEvents(
      user.userId,
      portfolioId,
      symbol,
    );
  }

  @Get('portfolio/:portfolioId/investor/trending')
  getTrendingStocks(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('sector') sector?: string,
  ) {
    return this.assetsService.getTrendingStocks(
      user.userId,
      portfolioId,
      sector,
    );
  }

  @Get('valuation/:symbol')
  getSymbolValuation(@Param('symbol') symbol: string) {
    return this.assetsService.getSymbolValuation(symbol);
  }

  @Get('portfolio/:portfolioId/investor/valuation/:symbol')
  getStockValuation(
    @CurrentUser() user: AuthUser,
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Param('symbol') symbol: string,
  ) {
    return this.assetsService.getStockValuation(
      user.userId,
      portfolioId,
      symbol,
    );
  }
}

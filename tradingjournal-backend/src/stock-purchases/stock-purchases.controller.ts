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
import { StockPurchasesService } from './stock-purchases.service';

@UseGuards(JwtAuthGuard)
@Controller('stock-purchases')
export class StockPurchasesController {
  constructor(private readonly service: StockPurchasesService) {}

  @Get('portfolio/:portfolioId')
  findAll(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('status') status?: 'OPEN' | 'CLOSED',
  ) {
    return this.service.findAll(portfolioId, user.userId, status);
  }

  @Get('portfolio/:portfolioId/holdings')
  holdings(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getHoldings(portfolioId, user.userId);
  }

  @Get('portfolio/:portfolioId/summary')
  summary(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getSummary(portfolioId, user.userId);
  }

  @Get('portfolio/:portfolioId/overview')
  overview(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getPortfolioOverview(portfolioId, user.userId);
  }

  @Get('portfolio/:portfolioId/sales')
  sales(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getSales(portfolioId, user.userId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user.userId);
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BuyStockDto } from './dto/buy-stock.dto';
import { SellStockDto } from './dto/sell-stock.dto';
import { StockTransactionsService } from './stock-transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('investor/portfolios/:portfolioId/stocks')
export class StockTransactionsController {
  constructor(private readonly service: StockTransactionsService) {}
  @Post('buy') buy(@Param('portfolioId', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Body() dto: BuyStockDto) { return this.service.buy(id, user.userId, dto); }
  @Post('sell') sell(@Param('portfolioId', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Body() dto: SellStockDto) { return this.service.sell(id, user.userId, dto); }
  @Get('sales') sales(@Param('portfolioId', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.sales(id, user.userId); }
}

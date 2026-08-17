import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { InvestorPortfolioService } from './investor-portfolio.service';

/**
 * อ่านภาพรวมพอร์ตฝั่ง Investor
 *
 * แยกจาก StockTransactionsController ('investor/portfolios/:portfolioId/stocks')
 * ซึ่งดูแลเฉพาะการซื้อ/ขาย ส่วนนี้เป็น read model ที่หน้าบ้านเรียกผ่าน
 * investor-portfolio.service.ts
 */
@UseGuards(JwtAuthGuard)
@Controller('investor/portfolios/:portfolioId')
export class InvestorPortfolioController {
  constructor(private readonly service: InvestorPortfolioService) {}

  @Get('dashboard')
  dashboard(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.dashboard(portfolioId, user.userId);
  }

  @Get('timeline')
  timeline(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.timeline(portfolioId, user.userId, from, to);
  }

  @Get('performance')
  performance(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Query('timeframe') timeframe?: string,
  ) {
    return this.service.performance(portfolioId, user.userId, timeframe);
  }
}

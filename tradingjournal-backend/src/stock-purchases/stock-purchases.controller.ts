import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UpdateStockPurchaseDto } from './dto/update-stock-purchase.dto';
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

  /** แก้ได้เฉพาะข้อมูลประกอบ ไม่ใช่ราคา/จำนวนหุ้น (ดู UpdateStockPurchaseDto) */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateStockPurchaseDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  /** ลบได้เฉพาะ lot ที่ยังไม่เคยขาย — ไม่งั้นตอบ 409 */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user.userId);
  }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateDividendDto } from './dto/create-dividend.dto';
import { UpdateDividendDto } from './dto/update-dividend.dto';
import { DividendsService } from './dividends.service';

@UseGuards(JwtAuthGuard)
@Controller('dividends')
export class DividendsController {
  constructor(private readonly service: DividendsService) {}
  @Get('portfolio/:portfolioId') findAll(@Param('portfolioId', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.findAll(id, user.userId); }
  @Get('portfolio/:portfolioId/summary') summary(@Param('portfolioId', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Query('year') year?: string) { return this.service.summary(id, user.userId, year ? Number(year) : undefined); }
  @Post('portfolio/:portfolioId') create(@Param('portfolioId', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Body() dto: CreateDividendDto) { return this.service.create(id, user.userId, dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Body() dto: UpdateDividendDto) { return this.service.update(id, user.userId, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.service.remove(id, user.userId); }
}

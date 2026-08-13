import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CalculatePnlDto } from './dto/calculate-pnl.dto';
import { CloseTradeDto } from './dto/close-trade.dto';
import { CreateTradeDto } from './dto/create-trade.dto';
import { ImportTradesDto } from './dto/import-trades.dto';
import { UpdateTradeDto } from './dto/update-trade.dto';
import { LeaderboardService } from './leaderboard.service';
import { TradesImportService } from './trades-import.service';
import { TradesService } from './trades.service';

@UseGuards(JwtAuthGuard)
@Controller('trades')
export class TradesController {
  constructor(
    private readonly tradesService: TradesService,
    private readonly tradesImportService: TradesImportService,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  @Post('calculate-pnl')
  calculatePnl(@Body() body: CalculatePnlDto) {
    return this.tradesService.calculatePnl(body);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.leaderboardService.getLeaderboard();
  }

  @Get('active')
  findActiveTrades(
    @CurrentUser() user: AuthUser,
    @Query('portfolioId') portfolioId?: string,
  ) {
    return this.tradesService.findActiveTrades(
      user.userId,
      portfolioId ? Number(portfolioId) : undefined,
    );
  }

  @Get('portfolio/:portfolioId')
  findAllByPortfolio(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tradesService.findAllByPortfolio(
      portfolioId,
      user.userId,
    );
  }

  @Post('portfolio/:portfolioId/active')
  createOpenTrade(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTradeDto,
  ) {
    return this.tradesService.createOpenTrade(
      user.userId,
      portfolioId,
      body,
    );
  }

  @Post('portfolio/:portfolioId')
  createClosedTrade(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTradeDto,
  ) {
    return this.tradesService.createClosedTrade(
      user.userId,
      portfolioId,
      body,
    );
  }

  @Patch(':id')
  updateOpenTrade(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateTradeDto,
  ) {
    return this.tradesService.updateOpenTrade(
      id,
      user.userId,
      body,
    );
  }

  @Patch(':id/close')
  closeTrade(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() body: CloseTradeDto,
  ) {
    return this.tradesService.closeTrade(
      id,
      user.userId,
      body,
    );
  }

  @Post('portfolio/:portfolioId/import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importTrades(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportTradesDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'กรุณาอัปโหลดไฟล์ประวัติการเทรด',
      );
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException(
        'รองรับเฉพาะไฟล์ CSV เท่านั้น',
      );
    }

    return this.tradesImportService.importBrokerData(
      portfolioId,
      user.userId,
      file.buffer,
      body.broker,
      body.accountId,
      file.originalname,
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tradesService.remove(id, user.userId);
  }
}

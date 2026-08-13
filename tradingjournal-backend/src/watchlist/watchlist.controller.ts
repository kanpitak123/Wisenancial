import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PortfolioType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AddWatchlistDto } from './dto/watchlist.dto';
import { WatchlistService } from './watchlist.service';

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(
    private readonly watchlistService: WatchlistService,
  ) {}

  /**
   * Canonical user-level route.
   * scope is optional: ALL | TRADER | INVESTOR
   */
  @Get()
  getUserWatchlist(
    @CurrentUser() user: AuthUser,
    @Query('scope')
    scope?: 'ALL' | PortfolioType,
    @Query('currency')
    currency = 'USD',
  ) {
    return this.watchlistService.getUserWatchlist(
      user.userId,
      scope ?? 'ALL',
      currency,
    );
  }

  // Compatibility route retained for existing pages.
  @Get('portfolio/:portfolioId')
  getWatchlist(
    @CurrentUser() user: AuthUser,
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
  ) {
    return this.watchlistService.getWatchlist(
      user.userId,
      portfolioId,
    );
  }

  @Get('portfolio/:portfolioId/check')
  checkSymbol(
    @CurrentUser() user: AuthUser,
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @Query('symbol') symbol: string,
  ) {
    return this.watchlistService.isInWatchlist(
      user.userId,
      portfolioId,
      symbol,
    );
  }

  @Post('portfolio/:portfolioId')
  addToWatchlist(
    @CurrentUser() user: AuthUser,
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @Body() body: AddWatchlistDto,
  ) {
    return this.watchlistService.addToWatchlist(
      user.userId,
      portfolioId,
      body,
    );
  }

  @Delete('portfolio/:portfolioId')
  removeFromWatchlist(
    @CurrentUser() user: AuthUser,
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @Query('symbol') symbol: string,
  ) {
    return this.watchlistService.removeFromWatchlist(
      user.userId,
      portfolioId,
      symbol,
    );
  }
}

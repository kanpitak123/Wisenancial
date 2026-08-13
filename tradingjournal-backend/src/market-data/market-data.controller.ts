import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { FinnhubMarketDataService } from './finnhub-market-data.service';

@UseGuards(JwtAuthGuard)
@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketData: FinnhubMarketDataService,
  ) {}

  @Post('sync/symbol/:symbol')
  syncSymbol(
    @Param('symbol') symbol: string,
    @Query('currency') currency = 'USD',
  ) {
    return this.marketData.syncSymbol(
      symbol,
      currency,
    );
  }

  @Post('sync/portfolio/:portfolioId')
  syncPortfolio(
    @Param(
      'portfolioId',
      ParseIntPipe,
    )
    portfolioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.marketData.syncPortfolio(
      portfolioId,
      user.userId,
    );
  }
}

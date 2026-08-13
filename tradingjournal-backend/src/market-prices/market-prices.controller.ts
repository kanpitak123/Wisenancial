import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpsertMarketPriceDto } from './dto/upsert-market-price.dto';
import { MarketPricesService } from './market-prices.service';

@UseGuards(JwtAuthGuard)
@Controller('market-prices')
export class MarketPricesController {
  constructor(
    private readonly service: MarketPricesService,
  ) {}

  @Get()
  find(
    @Query('symbols') symbols?: string,
    @Query('currency') currency?: string,
  ) {
    return this.service.find(
      symbols
        ?.split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean),
      currency,
    );
  }

  @Post()
  upsert(
    @Body() dto: UpsertMarketPriceDto,
  ) {
    return this.service.upsert(dto);
  }
}

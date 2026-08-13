import { Module } from '@nestjs/common';
import { EarningsCalendarService } from './earnings-calendar.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

@Module({
  controllers: [MarketController],
  providers: [MarketService, EarningsCalendarService],
  exports: [MarketService, EarningsCalendarService],
})
export class MarketModule {}

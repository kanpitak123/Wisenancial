import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinnhubMarketDataService } from './finnhub-market-data.service';
import { MarketDataController } from './market-data.controller';

@Module({
  imports: [PrismaModule],
  controllers: [MarketDataController],
  providers: [FinnhubMarketDataService],
  exports: [FinnhubMarketDataService],
})
export class MarketDataModule {}

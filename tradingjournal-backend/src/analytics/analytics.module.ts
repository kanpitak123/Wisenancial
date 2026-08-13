import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsModule } from '../records/records.module';
import { StockPurchasesModule } from '../stock-purchases/stock-purchases.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { InvestorAnalyticsService } from './investor-analytics.service';
import { TraderAnalyticsService } from './trader-analytics.service';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    PrismaModule,
    RecordsModule,
    StockPurchasesModule,
    MarketModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    TraderAnalyticsService,
    InvestorAnalyticsService,
    AdvancedAnalyticsService,
  ],
  exports: [
    AnalyticsService,
    TraderAnalyticsService,
    InvestorAnalyticsService,
    AdvancedAnalyticsService,
  ],
})
export class AnalyticsModule {}

import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DividendsModule } from '../dividends/dividends.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsModule } from '../records/records.module';
import { StockPurchasesModule } from '../stock-purchases/stock-purchases.module';
import { InvestorPortfolioController } from './investor-portfolio.controller';
import { InvestorPortfolioService } from './investor-portfolio.service';

@Module({
  imports: [
    PrismaModule,
    RecordsModule,
    StockPurchasesModule,
    DividendsModule,
    AnalyticsModule,
  ],
  controllers: [InvestorPortfolioController],
  providers: [InvestorPortfolioService],
  exports: [InvestorPortfolioService],
})
export class InvestorPortfolioModule {}

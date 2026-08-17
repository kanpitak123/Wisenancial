import { Module } from '@nestjs/common';
import { DividendsModule } from './dividends/dividends.module';
import { InvestorPortfolioModule } from './investor-portfolio/investor-portfolio.module';
import { MarketDataModule } from './market-data/market-data.module';
import { MarketPricesModule } from './market-prices/market-prices.module';
import { StockTransactionsModule } from './stock-transactions/stock-transactions.module';

@Module({
  imports: [
    StockTransactionsModule,
    InvestorPortfolioModule,
    DividendsModule,
    MarketPricesModule,
    MarketDataModule,
  ],
  exports: [
    StockTransactionsModule,
    InvestorPortfolioModule,
    DividendsModule,
    MarketPricesModule,
    MarketDataModule,
  ],
})
export class InvestorModule {}

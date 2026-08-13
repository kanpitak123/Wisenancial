import { Module } from '@nestjs/common';
import { DividendsModule } from './dividends/dividends.module';
import { MarketDataModule } from './market-data/market-data.module';
import { MarketPricesModule } from './market-prices/market-prices.module';
import { StockTransactionsModule } from './stock-transactions/stock-transactions.module';

@Module({
  imports: [
    StockTransactionsModule,
    DividendsModule,
    MarketPricesModule,
    MarketDataModule,
  ],
  exports: [
    StockTransactionsModule,
    DividendsModule,
    MarketPricesModule,
    MarketDataModule,
  ],
})
export class InvestorModule {}

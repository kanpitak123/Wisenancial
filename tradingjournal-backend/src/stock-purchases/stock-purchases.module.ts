import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockPurchasesController } from './stock-purchases.controller';
import { StockPurchasesService } from './stock-purchases.service';

@Module({
  imports: [PrismaModule, MarketModule],
  controllers: [StockPurchasesController],
  providers: [StockPurchasesService],
  exports: [StockPurchasesService],
})
export class StockPurchasesModule {}

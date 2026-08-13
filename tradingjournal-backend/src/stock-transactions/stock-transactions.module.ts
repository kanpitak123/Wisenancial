import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsModule } from '../records/records.module';
import { StockTransactionsController } from './stock-transactions.controller';
import { StockTransactionsService } from './stock-transactions.service';

@Module({
  imports: [PrismaModule, RecordsModule],
  controllers: [StockTransactionsController],
  providers: [StockTransactionsService],
  exports: [StockTransactionsService],
})
export class StockTransactionsModule {}

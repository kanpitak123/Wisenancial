import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsModule } from '../records/records.module';
import { LeaderboardService } from './leaderboard.service';
import { PnlCalculatorService } from './pnl-calculator.service';
import { TradesImportService } from './trades-import.service';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [PrismaModule, RecordsModule],
  controllers: [TradesController],
  providers: [
    TradesService,
    TradesImportService,
    LeaderboardService,
    PnlCalculatorService,
  ],
  exports: [TradesService, PnlCalculatorService],
})
export class TradesModule {}

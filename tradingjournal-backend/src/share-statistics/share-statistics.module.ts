import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaidTierGuard } from '../auth/paid-tier.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ShareStatisticsController } from './share-statistics.controller';
import { ShareStatisticsService } from './share-statistics.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    ShareStatisticsController,
  ],
  providers: [
    ShareStatisticsService,
    PaidTierGuard,
  ],
  exports: [
    ShareStatisticsService,
  ],
})
export class ShareStatisticsModule {}

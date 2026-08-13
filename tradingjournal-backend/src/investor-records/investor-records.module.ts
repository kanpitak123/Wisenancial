import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvestorRecordsController } from './investor-records.controller';
import { InvestorRecordsService } from './investor-records.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvestorRecordsController],
  providers: [InvestorRecordsService],
  exports: [InvestorRecordsService],
})
export class InvestorRecordsModule {}

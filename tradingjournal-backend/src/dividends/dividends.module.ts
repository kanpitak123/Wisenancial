import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DividendsController } from './dividends.controller';
import { DividendsService } from './dividends.service';
@Module({
  imports: [PrismaModule],
  controllers: [DividendsController],
  providers: [DividendsService],
  exports: [DividendsService],
})
export class DividendsModule {}

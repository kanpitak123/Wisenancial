import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

@Module({
  imports: [PrismaModule],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
  exports: [PortfoliosService],
})
export class PortfoliosModule {}

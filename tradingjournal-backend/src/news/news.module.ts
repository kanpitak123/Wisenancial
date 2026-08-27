import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NewsController } from './news.controller';
import { NewsEnrichmentService } from './news-enrichment.service';
import { NewsFeedService } from './news-feed.service';
import { NewsGateway } from './news.gateway';
import { NewsService } from './news.service';
import { NewsSyncService } from './news-sync.service';

@Module({
  // JwtModule ถูก register เป็น global ไว้ที่ AuthModule — NewsGateway ใช้ตัวนั้น
  // ตรวจ token ตอน handshake เหมือน ChatGateway ไม่มี JwtModule ของตัวเอง
  imports: [PrismaModule, AiModule, ConfigModule],
  controllers: [NewsController],
  providers: [
    NewsService,
    NewsFeedService,
    NewsSyncService,
    NewsEnrichmentService,
    NewsGateway,
  ],
  exports: [NewsService],
})
export class NewsModule {}

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NewsController } from './news.controller';
import { NewsEnrichmentService } from './news-enrichment.service';
import { NewsFeedService } from './news-feed.service';
import { NewsGateway } from './news.gateway';
import { NewsService } from './news.service';
import { NewsSyncService } from './news-sync.service';

@Module({
  imports: [PrismaModule, AiModule],
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

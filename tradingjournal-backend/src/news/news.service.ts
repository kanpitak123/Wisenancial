import { Injectable } from '@nestjs/common';
import { NewsQueryDto, NewsScope } from './dto/news-query.dto';
import { NewsFeedService } from './news-feed.service';
import { NewsSyncService } from './news-sync.service';

@Injectable()
export class NewsService {
  constructor(
    private readonly feed: NewsFeedService,
    private readonly syncService: NewsSyncService,
  ) {}

  getUnifiedFeed(userId: number, query: NewsQueryDto) {
    return this.feed.getUnifiedFeed(userId, query);
  }

  togglePin(userId: number, scope: NewsScope, newsId: number) {
    return this.feed.togglePin(userId, scope, newsId);
  }

  sync(scope: NewsScope, language: 'en' | 'th') {
    return this.syncService.sync(scope, language);
  }

  analyzePendingTraderNews(language: 'en' | 'th', limit: number) {
    return this.syncService.analyzePendingTraderNews(language, limit);
  }
}

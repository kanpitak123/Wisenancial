import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { NewsQueryDto, NewsScope } from './dto/news-query.dto';
import { NewsService } from './news.service';

@UseGuards(JwtAuthGuard)
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  getNews(@CurrentUser() user: AuthUser, @Query() query: NewsQueryDto) {
    return this.newsService.getUnifiedFeed(user.userId, query);
  }

  @Post(':scope/:id/toggle-pin')
  togglePin(
    @CurrentUser() user: AuthUser,
    @Param('scope') scope: NewsScope,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.newsService.togglePin(user.userId, scope, id);
  }

  @Post('sync/:scope')
  sync(
    @Param('scope') scope: NewsScope,
    @Query('language') language: 'en' | 'th' = 'th',
  ) {
    return this.newsService.sync(scope, language);
  }

  @Post('trader/analyze-pending')
  analyzePendingTraderNews(
    @Query('language') language: 'en' | 'th' = 'th',
    @Query('limit') limit = '50',
  ) {
    return this.newsService.analyzePendingTraderNews(
      language,
      Math.min(100, Math.max(1, Number(limit) || 50)),
    );
  }
}

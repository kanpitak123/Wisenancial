import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TradesModule } from './trades/trades.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GoalsModule } from './goals/goals.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { PostsModule } from './posts/posts.module';
import { ChatModule } from './chat/chat.module';
import { NewsModule } from './news/news.module';
import { AssetsModule } from './assets/assets.module';
import { InvestorModule } from './investor.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { GamificationModule } from './gamification/gamification.module';
import { CoachModule } from './coach/coach.module';
import { StocksModule } from './stocks/stocks.module';
import { MarketInsightsModule } from './market-insights/market-insights.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TradesModule,
    PortfoliosModule,
    AnalyticsModule,
    GoalsModule,
    UsersModule,
    AiModule,
    PostsModule,
    ChatModule,
    NewsModule,
    AssetsModule,
    WatchlistModule,
    InvestorModule,
    BillingModule,
    PaymentsModule,
    GamificationModule,
    CoachModule,
    StocksModule,
    MarketInsightsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

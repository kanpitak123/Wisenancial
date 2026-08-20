import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { HealthModule } from './health/health.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    /**
     * Rate limiting — ตั้งค่าผ่าน env ทั้งหมด
     *   THROTTLE_TTL_SECONDS : ความยาวหน้าต่างเวลา (วินาที)  ดีฟอลต์ 60
     *   THROTTLE_LIMIT       : จำนวนคำขอสูงสุดต่อหน้าต่าง     ดีฟอลต์ 120
     *
     * ดีฟอลต์ตั้งไว้หลวมพอที่จะไม่รบกวนการใช้งานปกติ (หน้า Dashboard ยิงหลาย
     * endpoint พร้อมกันตอนโหลด) แต่ยังกันการยิงถล่มแบบอัตโนมัติได้
     * จะรัดให้แน่นขึ้นตอนขึ้นจริงก็แก้ที่ env ไม่ต้องแก้โค้ด
     */
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),

    MonitoringModule,
    HealthModule,
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
  providers: [
    AppService,
    // ผูก ThrottlerGuard เป็น global guard — ทุก endpoint ถูกจำกัดโดยอัตโนมัติ
    // ไม่ต้องไปติด @UseGuards ทีละที่ (และไม่มีทางลืมติดที่ endpoint ใหม่)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

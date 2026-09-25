import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** เวอร์ชันของโครงไฟล์ export — เพิ่มเมื่อเปลี่ยนรูปแบบจนโปรแกรมที่อ่านไฟล์ต้องปรับตาม */
export const USER_EXPORT_FORMAT_VERSION = 1;

/**
 * ฟิลด์ของบัญชีที่ export ให้ — เลือกทีละฟิลด์ (allow-list) ไม่ใช่ดึงทั้งแถวแล้วตัดออก
 * เพื่อให้คอลัมน์ใหม่ที่เพิ่มเข้า users ในอนาคตไม่หลุดเข้าไฟล์เองโดยไม่มีใครตั้งใจ
 *
 * ไม่มี: password (hash), stripe_customer_id / stripe_subscription_id (รหัสภายในของ
 * ผู้ให้บริการชำระเงิน)
 */
const USER_EXPORT_SELECT = {
  id: true,
  username: true,
  full_name: true,
  email: true,
  role: true,
  subscription_tier: true,
  avatar_url: true,
  bio: true,
  is_public_profile: true,
  points_balance: true,
  ai_token_balance: true,
  current_streak: true,
  longest_streak: true,
  last_active_date: true,
  created_at: true,
  updated_at: true,
} as const;

/**
 * broker_connections: ส่งเฉพาะ metadata ของการเชื่อมต่อ ไม่ส่ง api_key_hash และ
 * oauth_*_encrypted — เป็นความลับที่ผู้ใช้เอาไปใช้ต่อไม่ได้ และการส่งออกไปแม้จะเข้ารหัสอยู่
 * ก็เพิ่มพื้นที่เสี่ยงโดยไม่ได้อะไรกลับมา
 */
const BROKER_CONNECTION_EXPORT_SELECT = {
  id: true,
  portfolio_id: true,
  broker_type: true,
  external_account_id: true,
  broker_server: true,
  status: true,
  last_heartbeat_at: true,
  last_sync_at: true,
  last_error_code: true,
  last_error_at: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
} as const;

/**
 * รวมข้อมูลของผู้ใช้คนเดียวเป็น JSON ก้อนเดียว (สิทธิ์ขอข้อมูลส่วนบุคคลของตัวเอง)
 *
 * ทุก query กรองด้วย userId จาก token — หรือด้วย portfolio ที่เป็นของผู้ใช้คนนี้เท่านั้น
 * ตารางที่ไม่มี user_id ตรง ๆ (records, goals, stock_*, trade_imports) อ้างผ่าน portfolio_id
 *
 * ยังไม่มี pagination/สตรีม: บัญชีที่มีเทรดหลักหมื่นรายการเป็นไฟล์ระดับสิบ MB ซึ่งรับได้
 * แบบ synchronous — ถ้าโตกว่านี้ควรย้ายเป็นงานเบื้องหลัง (ดู docs/internal/phase3-plan.md)
 */
@Injectable()
export class UsersExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExport(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: USER_EXPORT_SELECT,
    });

    if (!user) {
      throw new NotFoundException('ไม่พบบัญชีผู้ใช้');
    }

    const portfolios = await this.prisma.portfolios.findMany({
      where: { user_id: userId },
      orderBy: { id: 'asc' },
    });
    const portfolioIds = portfolios.map((portfolio) => portfolio.id);
    const byPortfolio = { portfolio_id: { in: portfolioIds } };
    const byUser = { user_id: userId };
    const byId = { orderBy: { id: 'asc' as const } };

    const [
      trades,
      tradeScreenshots,
      tradeImports,
      records,
      goals,
      stockPurchases,
      stockSales,
      dividends,
      watchlist,
      posts,
      comments,
      postLikes,
      chatMessages,
      subscriptions,
      userMissions,
      pointTransactions,
      tokenTransactions,
      lessonProgress,
      readinessAssessments,
      coachSessions,
      aiUsageLogs,
      shareLogs,
      pinnedNews,
      pinnedMarketNews,
      brokerConnections,
    ] = await Promise.all([
      this.prisma.trades.findMany({ where: byUser, ...byId }),
      this.prisma.trade_screenshots.findMany({
        where: { trades: byUser },
        ...byId,
      }),
      this.prisma.trade_imports.findMany({ where: byPortfolio, ...byId }),
      this.prisma.records.findMany({ where: byPortfolio, ...byId }),
      this.prisma.goals.findMany({ where: byPortfolio, ...byId }),
      this.prisma.stock_purchases.findMany({ where: byPortfolio, ...byId }),
      this.prisma.stock_sales.findMany({
        where: byPortfolio,
        include: { allocations: true },
        ...byId,
      }),
      this.prisma.dividends.findMany({ where: byUser, ...byId }),
      this.prisma.watchlist.findMany({ where: byUser, ...byId }),
      this.prisma.posts.findMany({ where: byUser, ...byId }),
      this.prisma.comments.findMany({ where: byUser, ...byId }),
      this.prisma.post_likes.findMany({ where: byUser, ...byId }),
      this.prisma.chat_messages.findMany({ where: byUser, ...byId }),
      this.prisma.subscriptions.findMany({
        where: byUser,
        include: { plans: { select: { name: true, duration_days: true } } },
        ...byId,
      }),
      this.prisma.user_missions.findMany({ where: byUser, ...byId }),
      this.prisma.point_transactions.findMany({ where: byUser, ...byId }),
      this.prisma.token_transactions.findMany({ where: byUser, ...byId }),
      this.prisma.lesson_progress.findMany({ where: byUser, ...byId }),
      this.prisma.readiness_assessments.findMany({ where: byUser, ...byId }),
      this.prisma.coach_sessions.findMany({ where: byUser, ...byId }),
      this.prisma.ai_usage_logs.findMany({ where: byUser, ...byId }),
      this.prisma.share_logs.findMany({ where: byUser, ...byId }),
      this.prisma.user_pinned_news.findMany({ where: byUser, ...byId }),
      this.prisma.user_pinned_market_news.findMany({
        where: byUser,
        ...byId,
      }),
      this.prisma.broker_connections.findMany({
        where: byUser,
        select: BROKER_CONNECTION_EXPORT_SELECT,
        ...byId,
      }),
    ]);

    return {
      format_version: USER_EXPORT_FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      user,
      data: {
        portfolios,
        trades,
        trade_screenshots: tradeScreenshots,
        trade_imports: tradeImports,
        records,
        goals,
        stock_purchases: stockPurchases,
        stock_sales: stockSales,
        dividends,
        watchlist,
        community: {
          posts,
          comments,
          post_likes: postLikes,
        },
        chat_messages: chatMessages,
        subscriptions,
        gamification: {
          user_missions: userMissions,
          point_transactions: pointTransactions,
        },
        token_transactions: tokenTransactions,
        lesson_progress: lessonProgress,
        readiness_assessments: readinessAssessments,
        coach_sessions: coachSessions,
        ai_usage_logs: aiUsageLogs,
        share_logs: shareLogs,
        pinned_news: pinnedNews,
        pinned_market_news: pinnedMarketNews,
        broker_connections: brokerConnections,
      },
    };
  }
}

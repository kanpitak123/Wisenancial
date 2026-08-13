-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('PACK_159', 'PACK_219', 'PACK_279', 'PACK_399');

-- CreateEnum
CREATE TYPE "PortfolioType" AS ENUM ('TRADER', 'INVESTOR');

-- CreateEnum
CREATE TYPE "NewsImportance" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NewsSentiment" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "AiTrend" AS ENUM ('UP', 'DOWN', 'SIDEWAY');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "MissionZone" AS ENUM ('DAILY', 'MONTHLY', 'INVITE', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "CoachSessionStatus" AS ENUM ('UPCOMING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'FEE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'TRADE_PNL', 'STOCK_BUY', 'STOCK_SELL', 'DIVIDEND', 'TAX', 'REVERSAL');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'TRADE', 'STOCK_PURCHASE', 'DIVIDEND', 'TRANSFER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "current_plan_id" INTEGER,
    "subscription_tier" "SubscriptionTier",
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "avatar_url" VARCHAR(500),
    "bio" TEXT,
    "is_public_profile" BOOLEAN NOT NULL DEFAULT false,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "ai_token_balance" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "plan_id" INTEGER,
    "status" VARCHAR(20) DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "initial_balance" DECIMAL(15,2) NOT NULL,
    "current_balance" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) DEFAULT 'USD',
    "portfolio_type" "PortfolioType" NOT NULL DEFAULT 'TRADER',
    "investor_cost_method" VARCHAR(10) NOT NULL DEFAULT 'FIFO',
    "icon" VARCHAR(50),
    "color" VARCHAR(20),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" SERIAL NOT NULL,
    "portfolio_id" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "target_profit" DECIMAL(15,2) NOT NULL,
    "goal_type" "PortfolioType" NOT NULL DEFAULT 'TRADER',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_imports" (
    "id" SERIAL NOT NULL,
    "portfolio_id" INTEGER,
    "broker" VARCHAR(50),
    "account_id" VARCHAR(50),
    "source" VARCHAR(30),
    "filename" VARCHAR(255),
    "imported_count" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "portfolio_id" INTEGER,
    "import_id" INTEGER,
    "broker" VARCHAR(50),
    "account_id" VARCHAR(50),
    "ticket_id" VARCHAR(100),
    "source" VARCHAR(30) DEFAULT 'manual',
    "pair" VARCHAR(30) NOT NULL,
    "trade_type" VARCHAR(15) NOT NULL,
    "volume" DECIMAL(10,2),
    "open_price" DECIMAL(18,8),
    "close_price" DECIMAL(18,8),
    "stop_loss" DECIMAL(18,8),
    "take_profit" DECIMAL(18,8),
    "commission" DECIMAL(15,2),
    "swap" DECIMAL(15,2),
    "pnl" DECIMAL(15,2),
    "result_status" VARCHAR(10) DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(6),
    "closed_at" TIMESTAMP(6),
    "timeframe" VARCHAR(20),
    "trend" VARCHAR(50),
    "strategy" VARCHAR(100),
    "emotion" VARCHAR(50),
    "entry_reason" TEXT,
    "note" TEXT,
    "asset_name" VARCHAR(100),
    "rsi" INTEGER,
    "macd" VARCHAR(50),
    "target_points" VARCHAR(50),
    "raw_data" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_screenshots" (
    "id" SERIAL NOT NULL,
    "trade_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_type" VARCHAR(20),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "trade_id" INTEGER,
    "asset_name" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "sentiment" "Sentiment" DEFAULT 'NEUTRAL',
    "post_type" VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_images" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "room_name" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "image_url" VARCHAR(500),
    "edited_at" TIMESTAMP(6),
    "deleted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missions" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "points" INTEGER NOT NULL,
    "target_count" INTEGER NOT NULL DEFAULT 1,
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "zone" "MissionZone" NOT NULL DEFAULT 'DAILY',
    "condition_type" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_missions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "mission_id" INTEGER NOT NULL,
    "current_val" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "country" VARCHAR(10),
    "impact" VARCHAR(20),
    "forecast" VARCHAR(50),
    "previous" VARCHAR(50),
    "actual" VARCHAR(50),
    "date" TIMESTAMP(6) NOT NULL,
    "content" TEXT,
    "source" VARCHAR(100),
    "url" VARCHAR(1000),
    "importance" "NewsImportance" NOT NULL DEFAULT 'MEDIUM',
    "sentiment" "NewsSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "ai_summary" TEXT,
    "market_impact_analysis" TEXT,
    "ai_trend" "AiTrend",
    "ai_impact_probability" DOUBLE PRECISION,
    "ai_translated_summary" JSONB,
    "related_symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_analyzed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_pinned_news" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "news_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pinned_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100),
    "asset_type" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_monthly_data" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "record_date" DATE NOT NULL,
    "open_price" DECIMAL(18,8) NOT NULL,
    "high_price" DECIMAL(18,8) NOT NULL,
    "low_price" DECIMAL(18,8) NOT NULL,
    "close_price" DECIMAL(18,8) NOT NULL,
    "volume" DECIMAL(18,2),

    CONSTRAINT "asset_monthly_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_purchases" (
    "id" SERIAL NOT NULL,
    "portfolio_id" INTEGER NOT NULL,
    "stock_symbol" VARCHAR(50) NOT NULL,
    "stock_name" VARCHAR(100),
    "shares_count" DECIMAL(18,8) NOT NULL,
    "remaining_shares" DECIMAL(18,8) NOT NULL,
    "purchase_price" DECIMAL(18,8) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "purchase_reason" TEXT,
    "expectation" TEXT,
    "target_price" DECIMAL(18,8),
    "stop_loss" DECIMAL(18,8),
    "strategy" VARCHAR(100),
    "emotion" VARCHAR(50),
    "notes" TEXT,
    "folder_name" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "sold_price" DECIMAL(18,8),
    "sold_date" TIMESTAMP(6),
    "closed_at" TIMESTAMP(6),
    "purchase_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" SERIAL NOT NULL,
    "portfolio_id" INTEGER NOT NULL,
    "type" "RecordType" NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "source_id" INTEGER,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversal_of_id" INTEGER,
    "transfer_group_id" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividends" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "portfolio_id" INTEGER,
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100),
    "payment_date" DATE NOT NULL,
    "shares" DECIMAL(18,8) NOT NULL,
    "dividend_per_share" DECIMAL(18,8) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "wht_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
    "tax_withheld" DECIMAL(18,2) NOT NULL,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sales" (
    "id" SERIAL NOT NULL,
    "portfolio_id" INTEGER NOT NULL,
    "stock_symbol" VARCHAR(50) NOT NULL,
    "shares_sold" DECIMAL(18,8) NOT NULL,
    "sold_price" DECIMAL(18,8) NOT NULL,
    "gross_proceeds" DECIMAL(18,2) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_proceeds" DECIMAL(18,2) NOT NULL,
    "cost_basis" DECIMAL(18,2) NOT NULL,
    "realized_pnl" DECIMAL(18,2) NOT NULL,
    "cost_method" VARCHAR(10) NOT NULL,
    "sold_date" TIMESTAMP(6) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sale_allocations" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "shares" DECIMAL(18,8) NOT NULL,
    "unit_cost" DECIMAL(18,8) NOT NULL,
    "cost_basis" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_sale_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_prices" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "price" DECIMAL(18,8) NOT NULL,
    "price_date" TIMESTAMP(6) NOT NULL,
    "source" VARCHAR(50),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100),
    "asset_type" VARCHAR(30) NOT NULL DEFAULT 'STOCK',
    "market_region" VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sector" VARCHAR(100),
    "industry" VARCHAR(100),
    "exchange" VARCHAR(50),
    "currency" VARCHAR(10),
    "country" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trending_stocks" (
    "id" SERIAL NOT NULL,
    "stock_symbol" VARCHAR(50) NOT NULL,
    "stock_name" VARCHAR(150),
    "sector" VARCHAR(100),
    "recommendation" VARCHAR(20) NOT NULL,
    "estimated_growth" DECIMAL(7,2),
    "reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trending_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_events" (
    "id" SERIAL NOT NULL,
    "stock_symbol" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "event_date" TIMESTAMP(6) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,8),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_news" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT,
    "source" VARCHAR(100),
    "url" VARCHAR(1000),
    "importance" "NewsImportance" NOT NULL DEFAULT 'MEDIUM',
    "sentiment" "NewsSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "ai_summary" TEXT,
    "stock_impact_analysis" TEXT,
    "ai_trend" "AiTrend",
    "ai_impact_probability" DOUBLE PRECISION,
    "ai_translated_summary" JSONB,
    "sector" VARCHAR(100),
    "stock_symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_pinned_market_news" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "market_news_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pinned_market_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "lesson_id" VARCHAR(50) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_assessments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "assess_date" DATE NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(500),
    "headline_en" VARCHAR(255) NOT NULL,
    "headline_th" VARCHAR(255) NOT NULL,
    "bio_en" TEXT NOT NULL,
    "bio_th" TEXT NOT NULL,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "years_experience" INTEGER NOT NULL DEFAULT 0,
    "hourly_rate_thb" INTEGER NOT NULL DEFAULT 0,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_availability" (
    "id" SERIAL NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "slot" TIMESTAMP(6) NOT NULL,
    "is_booked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_reviews" (
    "id" SERIAL NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "author" VARCHAR(100) NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_sessions" (
    "id" SERIAL NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "status" "CoachSessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "topic" TEXT,
    "meeting_url" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "model_used" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(50),
    "tokens_input" INTEGER NOT NULL DEFAULT 0,
    "tokens_output" INTEGER NOT NULL DEFAULT 0,
    "credits_deducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    "error_code" VARCHAR(50),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "portfolios_user_id_portfolio_type_idx" ON "portfolios"("user_id", "portfolio_type");

-- CreateIndex
CREATE UNIQUE INDEX "goals_portfolio_id_year_month_key" ON "goals"("portfolio_id", "year", "month");

-- CreateIndex
CREATE INDEX "trades_user_id_idx" ON "trades"("user_id");

-- CreateIndex
CREATE INDEX "trades_portfolio_id_idx" ON "trades"("portfolio_id");

-- CreateIndex
CREATE INDEX "trades_ticket_id_idx" ON "trades"("ticket_id");

-- CreateIndex
CREATE INDEX "trades_closed_at_idx" ON "trades"("closed_at");

-- CreateIndex
CREATE INDEX "posts_user_id_idx" ON "posts"("user_id");

-- CreateIndex
CREATE INDEX "posts_asset_name_idx" ON "posts"("asset_name");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_post_id_user_id_key" ON "post_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_messages_room_name_idx" ON "chat_messages"("room_name");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "chat_messages_user_id_idx" ON "chat_messages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_missions_user_id_mission_id_key" ON "user_missions"("user_id", "mission_id");

-- CreateIndex
CREATE INDEX "news_country_idx" ON "news"("country");

-- CreateIndex
CREATE INDEX "news_impact_idx" ON "news"("impact");

-- CreateIndex
CREATE INDEX "news_sentiment_importance_idx" ON "news"("sentiment", "importance");

-- CreateIndex
CREATE INDEX "news_date_idx" ON "news"("date");

-- CreateIndex
CREATE UNIQUE INDEX "news_title_date_key" ON "news"("title", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_pinned_news_user_id_news_id_key" ON "user_pinned_news"("user_id", "news_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_symbol_key" ON "assets"("symbol");

-- CreateIndex
CREATE INDEX "asset_monthly_data_asset_id_idx" ON "asset_monthly_data"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_monthly_data_asset_id_record_date_key" ON "asset_monthly_data"("asset_id", "record_date");

-- CreateIndex
CREATE INDEX "stock_purchases_portfolio_id_stock_symbol_idx" ON "stock_purchases"("portfolio_id", "stock_symbol");

-- CreateIndex
CREATE INDEX "stock_purchases_status_idx" ON "stock_purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "records_reversal_of_id_key" ON "records"("reversal_of_id");

-- CreateIndex
CREATE INDEX "records_portfolio_id_occurred_at_idx" ON "records"("portfolio_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "records_portfolio_id_source_source_id_type_key" ON "records"("portfolio_id", "source", "source_id", "type");

-- CreateIndex
CREATE INDEX "dividends_user_id_payment_date_idx" ON "dividends"("user_id", "payment_date");

-- CreateIndex
CREATE INDEX "dividends_portfolio_id_idx" ON "dividends"("portfolio_id");

-- CreateIndex
CREATE INDEX "dividends_portfolio_id_status_idx" ON "dividends"("portfolio_id", "status");

-- CreateIndex
CREATE INDEX "stock_sales_portfolio_id_sold_date_idx" ON "stock_sales"("portfolio_id", "sold_date");

-- CreateIndex
CREATE INDEX "stock_sales_portfolio_id_stock_symbol_idx" ON "stock_sales"("portfolio_id", "stock_symbol");

-- CreateIndex
CREATE INDEX "stock_sale_allocations_sale_id_idx" ON "stock_sale_allocations"("sale_id");

-- CreateIndex
CREATE INDEX "stock_sale_allocations_purchase_id_idx" ON "stock_sale_allocations"("purchase_id");

-- CreateIndex
CREATE INDEX "market_prices_price_date_idx" ON "market_prices"("price_date");

-- CreateIndex
CREATE UNIQUE INDEX "market_prices_symbol_currency_key" ON "market_prices"("symbol", "currency");

-- CreateIndex
CREATE INDEX "watchlist_user_id_asset_type_idx" ON "watchlist"("user_id", "asset_type");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_user_id_symbol_key" ON "watchlist"("user_id", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_symbol_key" ON "stocks"("symbol");

-- CreateIndex
CREATE INDEX "stocks_sector_idx" ON "stocks"("sector");

-- CreateIndex
CREATE INDEX "stocks_exchange_idx" ON "stocks"("exchange");

-- CreateIndex
CREATE INDEX "stocks_is_active_idx" ON "stocks"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "trending_stocks_stock_symbol_key" ON "trending_stocks"("stock_symbol");

-- CreateIndex
CREATE INDEX "trending_stocks_recommendation_sector_idx" ON "trending_stocks"("recommendation", "sector");

-- CreateIndex
CREATE INDEX "corporate_events_stock_symbol_event_date_idx" ON "corporate_events"("stock_symbol", "event_date");

-- CreateIndex
CREATE INDEX "market_news_sentiment_sector_idx" ON "market_news"("sentiment", "sector");

-- CreateIndex
CREATE INDEX "market_news_importance_idx" ON "market_news"("importance");

-- CreateIndex
CREATE INDEX "market_news_published_at_idx" ON "market_news"("published_at");

-- CreateIndex
CREATE INDEX "user_pinned_market_news_market_news_id_idx" ON "user_pinned_market_news"("market_news_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_pinned_market_news_user_id_market_news_id_key" ON "user_pinned_market_news"("user_id", "market_news_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_user_id_lesson_id_key" ON "lesson_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "readiness_assessments_user_id_idx" ON "readiness_assessments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_assessments_user_id_assess_date_key" ON "readiness_assessments"("user_id", "assess_date");

-- CreateIndex
CREATE INDEX "coaches_is_active_idx" ON "coaches"("is_active");

-- CreateIndex
CREATE INDEX "coach_availability_coach_id_is_booked_idx" ON "coach_availability"("coach_id", "is_booked");

-- CreateIndex
CREATE UNIQUE INDEX "coach_availability_coach_id_slot_key" ON "coach_availability"("coach_id", "slot");

-- CreateIndex
CREATE INDEX "coach_reviews_coach_id_idx" ON "coach_reviews"("coach_id");

-- CreateIndex
CREATE INDEX "coach_sessions_user_id_status_idx" ON "coach_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "coach_sessions_coach_id_idx" ON "coach_sessions"("coach_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_created_at_idx" ON "ai_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_model_used_idx" ON "ai_usage_logs"("model_used");

-- CreateIndex
CREATE INDEX "ai_usage_logs_status_idx" ON "ai_usage_logs"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_current_plan_id_fkey" FOREIGN KEY ("current_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trade_imports" ADD CONSTRAINT "trade_imports_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "trade_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_screenshots" ADD CONSTRAINT "trade_screenshots_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_pinned_news" ADD CONSTRAINT "user_pinned_news_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_pinned_news" ADD CONSTRAINT "user_pinned_news_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_monthly_data" ADD CONSTRAINT "asset_monthly_data_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_sales" ADD CONSTRAINT "stock_sales_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_sale_allocations" ADD CONSTRAINT "stock_sale_allocations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "stock_sales"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_sale_allocations" ADD CONSTRAINT "stock_sale_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "stock_purchases"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_pinned_market_news" ADD CONSTRAINT "user_pinned_market_news_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_pinned_market_news" ADD CONSTRAINT "user_pinned_market_news_market_news_id_fkey" FOREIGN KEY ("market_news_id") REFERENCES "market_news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "readiness_assessments" ADD CONSTRAINT "readiness_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

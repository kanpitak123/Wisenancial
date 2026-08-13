-- Share images and persistent share activity logs.

CREATE TABLE "share_logs" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "portfolio_id" INTEGER NOT NULL,
  "portfolio_type" "PortfolioType" NOT NULL,
  "platform" VARCHAR(30) NOT NULL,
  "content_type" VARCHAR(30) NOT NULL DEFAULT 'MESSAGE',
  "message" TEXT,
  "image_url" VARCHAR(500),
  "public_url" VARCHAR(500),
  "stats_snapshot" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "share_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "share_logs"
ADD CONSTRAINT "share_logs_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "share_logs"
ADD CONSTRAINT "share_logs_portfolio_id_fkey"
FOREIGN KEY ("portfolio_id")
REFERENCES "portfolios"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "share_logs_user_id_created_at_idx"
ON "share_logs"("user_id", "created_at");

CREATE INDEX "share_logs_portfolio_id_created_at_idx"
ON "share_logs"("portfolio_id", "created_at");

CREATE INDEX "share_logs_platform_idx"
ON "share_logs"("platform");

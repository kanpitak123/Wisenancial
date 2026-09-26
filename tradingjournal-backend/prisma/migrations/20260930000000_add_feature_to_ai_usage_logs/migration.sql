-- Per-feature AI usage logging: which feature (chart_insight, portfolio_review, ...) a call
-- was for. Nullable so existing rows stay valid (they predate flat per-feature pricing).
-- Additive only: one nullable column and one index; no data is touched.

-- AlterTable
ALTER TABLE "ai_usage_logs" ADD COLUMN     "feature" VARCHAR(40);

-- CreateIndex
CREATE INDEX "ai_usage_logs_feature_created_at_idx" ON "ai_usage_logs"("feature", "created_at");

-- Unified Posts V3
-- Use this migration only if the earlier unified-post migrations were never applied.

CREATE TYPE "PostReferenceType" AS ENUM (
  'NONE',
  'TRADE',
  'STOCK_PURCHASE',
  'STOCK_SALE',
  'DIVIDEND',
  'PORTFOLIO'
);

ALTER TABLE "posts"
ADD COLUMN "portfolio_id" INTEGER,
ADD COLUMN "portfolio_type" "PortfolioType",
ADD COLUMN "asset_symbol" VARCHAR(50),
ADD COLUMN "reference_type" "PostReferenceType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "reference_id" INTEGER;

UPDATE "posts" AS p
SET
  "portfolio_id" = t."portfolio_id",
  "portfolio_type" = 'TRADER',
  "asset_symbol" = p."asset_name",
  "reference_type" = 'TRADE',
  "reference_id" = p."trade_id"
FROM "trades" AS t
WHERE p."trade_id" = t."id"
  AND t."portfolio_id" IS NOT NULL;

DELETE FROM "posts"
WHERE "portfolio_id" IS NULL
   OR "portfolio_type" IS NULL;

ALTER TABLE "posts"
ALTER COLUMN "portfolio_id" SET NOT NULL,
ALTER COLUMN "portfolio_type" SET NOT NULL,
ALTER COLUMN "sentiment" SET NOT NULL;

ALTER TABLE "posts"
DROP CONSTRAINT IF EXISTS "posts_trade_id_fkey";

DROP INDEX IF EXISTS "posts_asset_name_idx";

ALTER TABLE "posts"
DROP COLUMN "trade_id",
DROP COLUMN "asset_name";

ALTER TABLE "posts"
ADD CONSTRAINT "posts_portfolio_id_fkey"
FOREIGN KEY ("portfolio_id")
REFERENCES "portfolios"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "posts_portfolio_id_portfolio_type_idx"
ON "posts"("portfolio_id", "portfolio_type");

CREATE INDEX "posts_asset_symbol_idx"
ON "posts"("asset_symbol");

CREATE INDEX "posts_reference_type_reference_id_idx"
ON "posts"("reference_type", "reference_id");

CREATE INDEX "posts_created_at_idx"
ON "posts"("created_at");

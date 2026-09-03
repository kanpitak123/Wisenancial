-- Phase 3A — formalize trades.source into an enum + link trades to broker_connections
-- NOT YET APPLIED — depends on 20260902160000_add_broker_connections having been applied
-- first (adds the broker_connections table this migration's FK points at).
--
-- Pre-migration data check performed 2026-09-02 against the live Supabase DB:
--   SELECT source, COUNT(*) FROM trades GROUP BY source;  ->  15 rows, all source = 'manual'
--   SELECT COUNT(*) FROM trades WHERE source IS NULL;      ->  0
-- No unexpected values found — every existing row is 'manual'. No rows currently use
-- 'import' (trade_imports is empty, 0 rows), but IMPORT is still added to the enum since
-- upsertImportedClosedTrade() already writes the literal string 'import' today.

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('MANUAL', 'IMPORT', 'MT4_SYNC', 'MT5_SYNC', 'WEBULL_SYNC');

-- AlterTable: safe type change with an explicit backfill, not a blind DROP/ADD.
-- USING (UPPER("source"))::"TradeSource" maps the existing free-text values
-- ('manual' -> 'MANUAL', 'import' -> 'IMPORT') and, by construction, makes Postgres
-- itself reject (abort the whole migration) any row whose value doesn't case-fold onto
-- one of the enum's five labels -- an unexpected value fails loudly here instead of being
-- silently coerced or dropped.
ALTER TABLE "trades" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "trades" ALTER COLUMN "source" TYPE "TradeSource" USING (UPPER("source"))::"TradeSource";
ALTER TABLE "trades" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- AlterTable: nullable link to the broker_connections row that synced this trade
-- (null for MANUAL/IMPORT rows, always set for *_SYNC rows going forward).
ALTER TABLE "trades" ADD COLUMN "broker_connection_id" INTEGER;

-- CreateIndex
CREATE INDEX "trades_broker_connection_id_idx" ON "trades"("broker_connection_id");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_broker_connection_id_fkey" FOREIGN KEY ("broker_connection_id") REFERENCES "broker_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

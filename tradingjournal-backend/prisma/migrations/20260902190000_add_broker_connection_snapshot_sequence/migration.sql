-- Phase 3 pre-EA hardening — guard against a stale/out-of-order FULL positions
-- snapshot regressing newer broker state (Phase 3 hardening review §2).
-- NOT YET APPLIED — additive only (one nullable column on an existing table). Depends
-- on 20260902160000_add_broker_connections having been applied first (this migration's
-- ALTER TABLE targets that migration's broker_connections table).
--
-- null = no FULL positions snapshot has been accepted for this connection yet. Every
-- existing row (if any) gets null here, which is exactly the "accept anything" starting
-- state applyPositionsSnapshot() already expects for a brand-new connection.

ALTER TABLE "broker_connections" ADD COLUMN "last_snapshot_sequence" INTEGER;

-- MT5 setup-wizard error surfacing — additive only (three nullable columns on an
-- existing table, no backfill needed). Every existing row gets NULL for all three,
-- which is exactly "no error recorded yet" — the correct starting state.
--
-- Populated by Mt5SyncService.ingest() on a rejected request worth showing the user
-- (TOFU account mismatch, portfolio unbound, malformed payload), cleared again on the
-- next successful heartbeat/sync. See broker_connections model comment in schema.prisma.

ALTER TABLE "broker_connections" ADD COLUMN "last_error_code" VARCHAR(50);
ALTER TABLE "broker_connections" ADD COLUMN "last_error_message" TEXT;
ALTER TABLE "broker_connections" ADD COLUMN "last_error_at" TIMESTAMP(6);

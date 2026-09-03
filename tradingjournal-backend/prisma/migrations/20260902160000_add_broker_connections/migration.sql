-- Phase 2 — broker abstraction + connection management foundation
-- NOT YET APPLIED — additive only (new enums + new table + one nullable FK-backed
-- relation column on an existing table). Does not touch, alter, or drop any existing
-- table, column, or row. Safe to review before running `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM (
  'MT4',
  'MT5',
  'WEBULL',
  'DIME'
);

-- CreateEnum
CREATE TYPE "BrokerConnectionStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'REVOKED',
  'ERROR',
  'DISCONNECTED'
);

-- CreateTable
CREATE TABLE "broker_connections" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "portfolio_id" INTEGER,
    "broker_type" "BrokerType" NOT NULL,
    "external_account_id" VARCHAR(50),
    "broker_server" VARCHAR(100),
    "api_key_hash" VARCHAR(64),
    "oauth_access_token_encrypted" TEXT,
    "oauth_refresh_token_encrypted" TEXT,
    "oauth_token_expires_at" TIMESTAMP(6),
    "status" "BrokerConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_heartbeat_at" TIMESTAMP(6),
    "last_sync_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "broker_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broker_connections_api_key_hash_key" ON "broker_connections"("api_key_hash");

-- CreateIndex
CREATE INDEX "broker_connections_user_id_idx" ON "broker_connections"("user_id");

-- CreateIndex
CREATE INDEX "broker_connections_portfolio_id_idx" ON "broker_connections"("portfolio_id");

-- CreateIndex
CREATE INDEX "broker_connections_status_idx" ON "broker_connections"("status");

-- CreateIndex
CREATE INDEX "broker_connections_broker_type_external_account_id_idx" ON "broker_connections"("broker_type", "external_account_id");

-- AddForeignKey
ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

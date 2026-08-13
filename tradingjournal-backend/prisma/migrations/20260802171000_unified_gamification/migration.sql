-- Unified Gamification + Missions
-- Existing mission/user mission data is discarded because the current project
-- is still in the disposable-data merge phase.

TRUNCATE TABLE "user_missions" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "missions" RESTART IDENTITY CASCADE;

CREATE TYPE "MissionFrequency" AS ENUM (
  'ONCE',
  'DAILY',
  'WEEKLY',
  'MONTHLY'
);

CREATE TYPE "MissionStatus" AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'CLAIMED',
  'EXPIRED'
);

CREATE TYPE "MissionAudience" AS ENUM (
  'ALL',
  'TRADER',
  'INVESTOR'
);

CREATE TYPE "MissionEventType" AS ENUM (
  'LOGIN',
  'TRADE_CREATED',
  'TRADE_CLOSED',
  'JOURNAL_COMPLETED',
  'TRADE_IMPORTED',
  'STOCK_PURCHASED',
  'STOCK_SOLD',
  'DIVIDEND_RECEIVED',
  'PORTFOLIO_REVIEWED',
  'GOAL_COMPLETED',
  'POST_CREATED',
  'COMMENT_CREATED',
  'PROFILE_COMPLETED'
);

ALTER TABLE "missions"
ADD COLUMN "code" VARCHAR(80),
ADD COLUMN "audience" "MissionAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN "event_type" "MissionEventType",
ADD COLUMN "starts_at" TIMESTAMP(6),
ADD COLUMN "ends_at" TIMESTAMP(6),
ADD COLUMN "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "missions"
SET
  "code" = CONCAT('LEGACY_', "id"),
  "event_type" = 'LOGIN';

ALTER TABLE "missions"
ALTER COLUMN "code" SET NOT NULL,
ALTER COLUMN "event_type" SET NOT NULL;

ALTER TABLE "missions"
ALTER COLUMN "frequency" DROP DEFAULT;

ALTER TABLE "missions"
ALTER COLUMN "frequency" TYPE "MissionFrequency"
USING "frequency"::"MissionFrequency";

ALTER TABLE "missions"
ALTER COLUMN "frequency" SET DEFAULT 'ONCE';

ALTER TABLE "missions"
DROP COLUMN "condition_type";

CREATE UNIQUE INDEX "missions_code_key"
ON "missions"("code");

CREATE INDEX "missions_is_active_frequency_idx"
ON "missions"("is_active", "frequency");

CREATE INDEX "missions_audience_event_type_idx"
ON "missions"("audience", "event_type");

DROP INDEX IF EXISTS "user_missions_user_id_mission_id_key";

ALTER TABLE "user_missions"
ADD COLUMN "period_key" VARCHAR(20),
ADD COLUMN "claimed_at" TIMESTAMP(6),
ADD COLUMN "expires_at" TIMESTAMP(6);

UPDATE "user_missions"
SET "period_key" = TO_CHAR("created_at", 'YYYY-MM-DD');

ALTER TABLE "user_missions"
ALTER COLUMN "period_key" SET NOT NULL;

ALTER TABLE "user_missions"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "user_missions"
ALTER COLUMN "status" TYPE "MissionStatus"
USING "status"::"MissionStatus";

ALTER TABLE "user_missions"
ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

CREATE UNIQUE INDEX "user_missions_user_id_mission_id_period_key_key"
ON "user_missions"("user_id", "mission_id", "period_key");

CREATE INDEX "user_missions_user_id_status_idx"
ON "user_missions"("user_id", "status");

CREATE INDEX "user_missions_period_key_expires_at_idx"
ON "user_missions"("period_key", "expires_at");

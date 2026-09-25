-- Account deletion (soft delete + 30-day grace period).
--
-- users.deletion_scheduled_at is NULL for every normal account (all existing rows get
-- NULL, which is the correct "not scheduled for deletion" state — purely additive, no
-- data is rewritten and no existing column/constraint is touched).
--
-- When a user requests deletion the column is set to now() + 30 days. A successful login
-- before that moment clears it (cancelling the deletion); a daily job hard-deletes the
-- accounts whose moment has passed (all user-owned tables already ON DELETE CASCADE).
--
-- The index serves the daily purge query (WHERE deletion_scheduled_at <= now()).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletion_scheduled_at" TIMESTAMP(6);

-- CreateIndex
CREATE INDEX "users_deletion_scheduled_at_idx" ON "users"("deletion_scheduled_at");

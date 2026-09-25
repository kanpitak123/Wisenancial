-- Email flows (password reset + email verification).
--
-- One new enum, one nullable column on users, and one new table for hashed one-time tokens.
-- Deleting a user cascades to their tokens (ON DELETE CASCADE), so the account-purge job is
-- unaffected.
--
-- Backfill: every user that exists when this runs registered before email verification
-- existed, so they are treated as verified from their registration time. Only new sign-ups
-- start unverified. This is the ONLY statement that changes existing rows.
--
-- Generated offline with `prisma migrate diff` (+ the backfill below); not applied until
-- reviewed.

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(6);

-- Backfill: existing users predate verification. created_at is nullable in this schema, so fall
-- back to the moment of the migration for any row without one.
UPDATE "users" SET "email_verified_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
WHERE "email_verified_at" IS NULL;

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_created_at_idx" ON "email_tokens"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Records consent to the Terms of Service + Privacy Policy at signup (Phase 3 / B3).
--
-- Purely additive: two nullable columns on "users". Every existing row gets NULL/NULL, which
-- means "no consent was recorded" - existing users registered before the checkbox existed and
-- are deliberately NOT backfilled (we cannot claim a consent nobody gave). No existing data is
-- read, changed or deleted.
--
--   accepted_terms_version  the version the user saw when ticking the box (e.g. 'draft-0.1'),
--                           checked by the server against CURRENT_TERMS_VERSION
--   accepted_terms_at       set by the server at registration, never taken from the client
--
-- Generated offline with `prisma migrate diff`; NOT applied to any database.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accepted_terms_at" TIMESTAMP(6),
ADD COLUMN     "accepted_terms_version" VARCHAR(32);

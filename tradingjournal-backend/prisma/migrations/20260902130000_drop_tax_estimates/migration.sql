-- ⚠️ DESTRUCTIVE — NOT YET APPLIED — proposed as part of Phase 1 tax feature removal
--
-- Drops the tax_estimates table created in 20260829144102_add_tax_estimates.
-- As of 2026-09-02 this table contains 1 row (id=3, user_id=12, tax_year='2569',
-- form_type='ภ.ง.ด.90') which was exported to a backup JSON file before this
-- migration was written. Do NOT run `prisma migrate deploy`/`migrate dev` against
-- the live database until that backup has been confirmed and the data loss is
-- explicitly accepted — this operation is irreversible.

-- DropForeignKey
ALTER TABLE "tax_estimates" DROP CONSTRAINT "tax_estimates_user_id_fkey";

-- DropTable
DROP TABLE "tax_estimates";

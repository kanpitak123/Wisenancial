/*
  Warnings:

  - You are about to drop the column `portfolio_id` on the `watchlist` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `watchlist` table. The data in that column could be lost. The data in that column will be cast from `VarChar(150)` to `VarChar(100)`.
  - A unique constraint covering the columns `[user_id,symbol]` on the table `watchlist` will be added. If there are existing duplicate values, this will fail.

*/


-- DropForeignKey
ALTER TABLE "watchlist"
DROP CONSTRAINT IF EXISTS "watchlist_portfolio_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "watchlist_portfolio_id_asset_type_idx";

-- DropIndex
DROP INDEX IF EXISTS "watchlist_portfolio_id_symbol_key";

-- DropIndex
DROP INDEX IF EXISTS "watchlist_user_id_portfolio_id_idx";

-- AlterTable
ALTER TABLE "watchlist" DROP COLUMN "portfolio_id",
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- CreateIndex
CREATE INDEX "watchlist_user_id_asset_type_idx" ON "watchlist"("user_id", "asset_type");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_user_id_symbol_key" ON "watchlist"("user_id", "symbol");

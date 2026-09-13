-- DropForeignKey
ALTER TABLE "stock_sale_allocations" DROP CONSTRAINT "stock_sale_allocations_purchase_id_fkey";

-- AddForeignKey
ALTER TABLE "stock_sale_allocations" ADD CONSTRAINT "stock_sale_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "stock_purchases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

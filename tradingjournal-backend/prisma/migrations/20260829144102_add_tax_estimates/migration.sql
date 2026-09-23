-- CreateTable
CREATE TABLE "tax_estimates" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tax_year" VARCHAR(10) NOT NULL,
    "form_type" VARCHAR(20) NOT NULL,
    "income_json" JSONB NOT NULL,
    "deductions_json" JSONB NOT NULL,
    "withholding_tax" DECIMAL(15,2) NOT NULL,
    "result_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_estimates_user_id_tax_year_key" ON "tax_estimates"("user_id", "tax_year");

-- AddForeignKey
ALTER TABLE "tax_estimates" ADD CONSTRAINT "tax_estimates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

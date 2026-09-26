-- Shadow second pass (news-analysis / claude-guardrails): additive, nullable, on
-- market_news only. Every existing row gets NULL = "never analysed".
-- NOT APPLIED — review, then run `npx prisma migrate deploy` deliberately.

-- AlterTable
ALTER TABLE "market_news" ADD COLUMN     "ai_analysis" JSONB,
ADD COLUMN     "ai_analysis_at" TIMESTAMP(6);

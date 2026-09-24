-- Chunk A (Gemini first-pass news enrichment): a model-confidence score, additive
-- and nullable like ai_impact_probability, on both news and market_news. Every
-- existing row gets NULL, which is the correct "no confidence recorded yet" state.
-- Used by a later chunk (Wise_ai) to trigger a selective second pass on
-- Gemini-flagged high-importance OR low-confidence market_news rows.

ALTER TABLE "news" ADD COLUMN "ai_confidence" DOUBLE PRECISION;
ALTER TABLE "market_news" ADD COLUMN "ai_confidence" DOUBLE PRECISION;

# news-analysis (vendored)

Source: `wisenancial-ai-services.zip` → `claude-guardrails-service/` (git `0e824a3`,
"consolidate wisenancial ai services package"; identical to the earlier `Wise_ai` module,
`014b42d`). Copied into the backend as plain source — there is no npm package.

Local changes only:
- Prettier applied (repo style); CRLF → LF.
- `news-analysis.module.ts` and `index.ts` dropped. Nothing here is registered in Nest DI:
  `NewsGuardrailsSecondPassService` builds `NewsAnalysisService` per item with a locked-down
  executor (`src/ai/news-guardrails.executor.ts`).
- Specs and golden fixtures moved next to the code (`*.spec.ts`, `golden/`).
- `envelope.schema.json` was reconstructed from the `SpecEnvelope` interface (the upstream file was
  never shipped); `service.spec.ts` reads it from this folder.

Do not edit the analysis logic here without re-running the golden specs. Wiring lives in
`src/news/news-guardrails-second-pass.service.ts`.

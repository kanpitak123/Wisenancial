# AI Modules Integration Discovery — Gemini News Classifier & Wise_ai (Anthropic)

Date: 2026-09-24 · Read-only discovery, no code changes made to the Wisenancial repo.

## Follow-up checklist

- [ ] Billing-enabled Gemini key → run the 3 before/after examples → user reviews → enable flag
- [ ] Valid ANTHROPIC_API_KEY (sk-ant-) → start Chunk B (Wise_ai second pass)

## 0. Existing AI layer (for reference)

`tradingjournal-backend/src/ai/`:

- **`AiManagerService`** (`ai-manager.service.ts`) — single point of contact with every LLM vendor. Two entry points:
  - `executeAiRequest<T>({userId, modelId, prompt, systemPrompt, ...})` — **user-paid**. Checks `ai_token_balance >= MIN_CREDIT_BALANCE` (10), calls the provider, charges credits + writes `ai_usage_logs`/`token_transactions` in one `Serializable` transaction. **No cross-provider fallback** here by design (credit rates differ up to 300x between models — silent fallback would over/undercharge).
  - `executeSystemAiRequest<T>({modelId?, prompt, systemPrompt, ...})` — **system-paid, no credit deduction**. Walks `AI_SYSTEM_FALLBACK_ORDER` (`groq-llama3 → gemini-2.5-flash → gpt-4o → claude-sonnet-5`), skipping unconfigured providers, retrying the next model only on a non-`permanent` failure. This is what background jobs (news enrichment) use.
- **`ai-provider.interface.ts`** — `IAiProvider { id, isConfigured(), generateJsonResponse<T>(options) }`. Every vendor (`groq.provider.ts`, `gemini.provider.ts`, `openai.provider.ts`, `anthropic.provider.ts`) implements this one method; `AiManagerService` never imports a vendor SDK directly. Also owns `parseJsonResponse()` (strips ```json fences, falls back to the outermost `{...}`/`[...]` span) and `AiResponseParseError` (classified as retryable `upstream-error`, not `permanent`).
- **`ai.models.ts`** — `AI_MODEL_REGISTRY`: `groq-llama3`, `gemini-2.5-flash` (upstream `gemini-3.6-flash`), `gpt-4o`, `claude-sonnet-5` (upstream `claude-sonnet-5`). Credits per 1k tokens, input/output split (Claude: 60/300, i.e. Claude output is priced ~5x its input and 300x groq's).
- **`PaidTierGuard`** (`src/auth/paid-tier.guard.ts`) — a *subscription-tier* gate (`subscription_tier`/active `subscriptions` row), separate from the credit system. Used on some feature endpoints (`analytics`, `market-insights`, `share-statistics`, `coach`) but **not** currently on any `/ai/*` route — those are gated by `JwtAuthGuard` + the credit balance check inside `AiManagerService` itself.
- Existing AI endpoints (`ai.controller.ts`, all behind `@UseGuards(JwtAuthGuard)`): `POST /ai/analyze`, `POST /ai/portfolio/:id/review`, `POST /ai/portfolio/risk-analysis`, `GET /ai/recommendations/growth`, `POST /ai/education/quiz`, `POST /ai/news/enrich`.
- **News enrichment today**: `NewsEnrichmentService.enrichTraderNews()` / `enrichInvestorArticle()` (`src/news/news-enrichment.service.ts`) call `AiService.enrichNewsArticle()` (`src/ai/ai.service.ts`), which calls `manager.executeSystemAiRequest()` — **system-paid, synchronous, in the request/cron path**, with a hardcoded system prompt (`NEWS_ENRICHMENT_SYSTEM_PROMPT`) requiring exactly this JSON shape:
  ```
  { aiSummary, aiTrend: UP|DOWN|SIDEWAY, aiImpactProbability: 0-100,
    stockImpactAnalysis, sector, importance: HIGH|MEDIUM|LOW,
    sentiment: BULLISH|BEARISH|NEUTRAL, aiTranslatedSummary }
  ```
  This writes directly to `news` table columns (`importance`, `sentiment`, `ai_summary`, `market_impact_analysis`, `ai_trend`, `ai_impact_probability`, `ai_translated_summary`) and broadcasts via `NewsGateway`. **This exact shape/these exact columns are the real integration contract** — not a specific frontend store, since the frontend reads news rows directly.
  There is also a **user-paid** variant, `enrichUserNewsArticle()` (billed via `executeAiRequest`), exposed at `POST /ai/news/enrich` with a `modelId` — used for an on-demand "analyze this article" action, separate from the automatic/cron path.
- Frontend consumers of the *portfolio* AI endpoints (for the "don't break without a migration plan" constraint): `AiStore.ts`, `services/ai.service.ts`, `composables/useAi.ts`, `components/analytics/AiRiskAnalysisCard.vue`, `components/analytics/AiPortfolioAdvisorCard.vue`. News enrichment has no dedicated frontend AI store — the news pages just read the `news` rows the cron job already wrote.

---

## 1. Module: Gemini News Classifier (`News_AI_(Gemini)/`)

**Purpose.** Financial news classification/analysis — would replace or improve the same territory as `news-enrichment.service.ts` / `AiService.enrichNewsArticle()`. Two generations exist in the repo: a legacy V.4 single-label classifier (`gemini_news_classifier.py`, sentiment/importance/confidence) and the shipped V.5 "dual-impact" agent (`gemini_news_classifier_v5.py`) which adds category, market stance (incl. `MIXED`), dual positive/negative impact lists with asset-class + mechanism + timeframe, chain-of-thought reasoning, an anti-inducement regex scanner, and a neutrality score. V.4 output is derivable from V.5 (`classify_backward_compatible()`), so V.5 is the one to evaluate.

**Trained/fine-tuned?** No. `requirements.txt` has only `fastapi`, `uvicorn`, `pydantic`, `pytest`, `requests` — zero ML libraries (no torch/sklearn/numpy). It's pure prompt engineering: an 8-example few-shot block + a Gemini `responseJsonSchema` structured-output call over plain `urllib`/`fetch`. **However**, `VersionResult.md` documents that two *earlier, not-shipped* versions (V.2/V.3) did use real supervised ML (TF-IDF + Logistic Regression on Gemini-generated pseudo-labels, shipped as `.joblib` artifacts) and performed worse (~66% / ~57% accuracy vs V.4's ~94%/88% and V.5's ~82%/78%) — the team tried classic ML and abandoned it. Nothing in the current commit is a local model.

**Language/runtime/entrypoints.** Python 3.14, stdlib HTTP (`urllib.request`), designed to run as a standalone FastAPI microservice (`backend/main.py`, `uvicorn`, port from `$PORT`/8000, open CORS unless `CORS_ORIGINS` is set) exposing `/ai/news/v5/analyze`, `/ai/news/v5/analyze-batch`, `/ai/news/classify` (V.4-compat), `/ai/news/classify-batch`, `/ai/news/health`. **The team has already also hand-ported this to TypeScript** in `nestjs/` — a self-contained `NewsClassifierService`/`NewsClassifierController`/`NewsClassifierModule` with its own DTOs, mounted at the same `/ai/news/*` paths, using native `fetch` with `AbortController`-based timeouts.

**Input/output** (from the Pydantic models / TS interfaces, identical on both sides):
```ts
// in: { article_id?: string, title: string (≤1200), description?: string (≤2000) }
// out (V.5):
{
  article_id, news_category: MACROECONOMIC|CENTRAL_BANK|CORPORATE_EARNINGS|
    GEOPOLITICAL_COMMODITIES|REGULATORY_LEGAL|GENERAL_FINANCIAL,
  importance: HIGH|MEDIUM|LOW,
  market_stance: BULLISH|BEARISH|MIXED|NEUTRAL,
  confidence: number, review_required: boolean,
  reasoning_steps: { key_facts[], transmission_mechanism, counter_perspective },
  dual_impact_analysis: {
    positive_impacts: [{target, asset_class, mechanism, timeframe}],
    negative_impacts: [...]
  },
  uncertainties: string[], neutrality_score: number,
  compliance_disclaimer: string, compliance_flags: string[],
  model, prompt_version, cached
}
```
This shape has **no mapping to the existing `news` table columns** — unlike Wise_ai (below), nobody has written a `toEnrichmentResult()`-style adapter. The `frontend-integration/` files (`NewsDualImpactCard.vue`, `NewsImpactBadge.vue`, `news-classifier.store.ts`) are **new UI components for this new shape**, not a drop-in for existing news cards — a materially bigger integration footprint than it first appears.

**Model IDs / env vars / cost.** `model-manifest.json`: recommended engine `gemini-flash-lite-latest`, compatible with `gemini-flash-lite-latest`, `gemini-3.6-flash`, `gemini-2.5-flash`, `gemini-1.5-flash` — notably `gemini-3.6-flash` is the exact `upstreamModel` already registered as `gemini-2.5-flash` in Wisenancial's own `AI_MODEL_REGISTRY`, so no new provider wiring is needed if the team accepts that model; `gemini-flash-lite-latest` specifically would need a new registry entry. Env vars (names only): `GEMINI_API_KEY`, `GEMINI_MODEL`, `CLASSIFIER_CONFIDENCE_THRESHOLD`, `AGENT_NEUTRALITY_THRESHOLD`, `CLASSIFIER_CACHE_TTL_SECONDS`, `GEMINI_MAX_RETRIES`, `GEMINI_TIMEOUT_SECONDS`/`GEMINI_TIMEOUT_MS`, `CORS_ORIGINS` (FastAPI only). **Cost**: the full 8-example few-shot array is re-embedded in *every single prompt* (`fewshot_examples_v5.json` is 25,556 bytes ≈ 6,000-6,500 input tokens just for the examples, every call — no prompt caching used), capped at `maxOutputTokens: 1000`. On Wisenancial's own credit table for the Gemini tier (5/1k input, 15/1k output) that's roughly 35-40 credits/call before any output — cheap relative to Claude, but the unbounded few-shot re-send is wasteful and a good candidate for Gemini's context-caching feature if adopted.

**Prompts.** Live inline in `gemini_news_classifier_v5.py::_build_prompt()` (Python) and byte-identical in `nestjs/news-classifier.service.ts::buildPromptV5()` (TypeScript) — plain template strings, **already fully portable**, no LangChain/output-parser dependency on either side.

**Tests, error handling, robustness.** `test_classifier.py` has 4 unit tests, all against the **V.4** classifier only (examples-loaded, health-check, one success case, one low-confidence-triggers-review case, one cache-hit case) — **V.5, the version actually served by default, has zero test coverage** on either the Python or TypeScript side. Retry: exponential backoff with jitter on HTTP 429/5xx, 3 attempts — reasonable. JSON-parsing robustness is weak: both implementations do a single bare `json.loads(text)` / `JSON.parse(text)` on the model's response text with **no fence-stripping and no fallback span extraction** (contrast with Wisenancial's own `parseJsonResponse()`, which handles ```json fences and malformed prose-wrapped JSON) — a truncated or fence-wrapped response becomes an uncaught parse error → 502, where Wisenancial's own provider layer would have recovered.

**🔴 Secret scan of the whole module tree AND git history: clean.** No real API keys found (Gemini `AIza…`, OpenAI `sk-…`, Anthropic `sk-ant-…`, Groq `gsk_…`), no `.env` files, no connection strings, checked both as text and as extracted strings from the three compiled `.pyc` files. The only `api_key`-adjacent matches are placeholders (`"your-gemini-api-key"`, `"fake-key-for-testing"`, `"test-api-key"`) and error-message strings. *(This matches the scan already run earlier this session on the same 3 commits now on `main`.)*

**Committed artifacts that shouldn't be in git.** `backend/__pycache__/*.cpython-314.pyc` (3 compiled files) are committed despite the module shipping its own `gitignore.additions` file listing `__pycache__/`, `*.pyc`, `.venv/`, `env/`, `.env*` — **that file was never actually merged into the repo's real `.gitignore`**, so the exclusions it lists were never applied. No `.env`, no venv, no data dumps found.

**🔴 Security/architecture flags (must fix before any merge).** The `nestjs/news-classifier.controller.ts` has **no `@UseGuards(...)` at all** — unauthenticated, unmetered, publicly reachable if mounted as-is. It also does not go through `AiManagerService` in any way (own `fetch`, own retry, own API key), so it participates in **none** of: JWT auth, credit deduction, `ai_usage_logs`, or the fallback chain. The companion Vue store (`news-classifier.store.ts`) calls a **bare `axios` instance** (not the app's shared `boot/axios.ts` instance that attaches the JWT and handles refresh) directly at `${VITE_API_URL}/ai/news/v5/analyze` — i.e. even in its intended deployment (mounted on the main NestJS app, given the port-3000 default) it was built to be called with no auth header, straight from the browser. As shipped, this is a direct violation of every one of the user's stated hard constraints.

---

## 2. Module: Wise_ai (Anthropic) — `https://github.com/Whit3list/Wise_ai.git`

**Clone: succeeded.** Cloned read-only to `C:\Users\iamre\Desktop\_ai_modules\Wise_ai` (outside the Wisenancial repo, not a submodule, nothing copied in). Single commit (`014b42d`, "News AI module: two-sided financial news analysis with enforced guardrails").

**Purpose.** Same territory as the Gemini module and as `news-enrichment.service.ts`: turns raw news into neutral, two-sided (positive/negative factor) analysis in Thai, with per-horizon (short/medium/long) impact, claim status (confirmed/unconfirmed/rumor), source-conflict detection, and same-event clustering across syndicated copies. Explicitly designed **as a drop-in replacement/enhancement for the existing news-enrichment pipeline**, not a new parallel feature.

**Trained/fine-tuned?** No — pure prompt engineering (system prompt + 5 few-shot examples in `prompt.ts`), zero ML dependencies. `package.json` literally states "no runtime dependencies beyond `@nestjs/common`" (peer dep only; `jest`/`ts-jest`/`typescript` are dev-only).

**Language/runtime/entrypoints.** Native TypeScript, already a NestJS `DynamicModule` (`news-analysis.module.ts`, `forRoot`/`forRootAsync`) exporting `NewsAnalysisService`. **No separate service, no Python, no HTTP hop** — it's a library meant to be imported directly into the existing backend process. Ported from a Python reference implementation (`ai_core/pipeline.py` etc., not included in this repo) — that porting work is already done.

**Input/output** (`src/types.ts`, `src/news-analysis.service.ts`):
```ts
analyse(articles: NewsArticleInput[], opts?: { now?, modelId?, requestId? }): Promise<NewsAnalysisResult>
// NewsArticleInput: { sourceId, headline, content, source, publishedAt, relatedSymbols?, market?, sector?, url? }
// NewsAnalysisResult: { requestId, feature:'news_analysis', status: success|partial|insufficient_data|error,
//   analysis: NewsAnalysis|null, confidence, confidenceReason, warnings[], sources[], dataAsOf,
//   eventId, independentSourceCount, modelVersion, schemaVersion, issues[], trace }
// NewsAnalysis: { headline, summary[≤3], positiveFactors[], negativeFactors[], counterpointNote,
//   newsTone, sentiment (8-value), sentimentReason, impact:{shortTerm,mediumTerm,longTerm}, affected[],
//   claimStatus, conflicts[], missingContext[] }
```
Two adapters are provided, both already written:
- `toSpecEnvelope()` — full snake_case wire shape per the team's own spec (for a future richer API).
- **`toEnrichmentResult()`** — maps the rich analysis losslessly-as-possible onto the **exact existing `NewsEnrichmentResult` shape** (`aiSummary`, `aiTrend`, `aiImpactProbability`, `stockImpactAnalysis`, `sector`, `importance`, `sentiment`, `fromFallback`) with every lossy-mapping decision documented inline (e.g. 8-value sentiment collapsed to 3-value, confidence 0-1 scaled to the existing 0-100 column, `importance` — which the new schema doesn't have a concept of — derived from source count + horizon strength as "a genuinely new heuristic, not a port of anything"). **This is the one piece of work needed to make the existing frontend/DB contract keep working with zero backend changes**, and it's already done.

**Model IDs / env vars / cost.** The module itself is **provider-agnostic** — it takes an injected `SYSTEM_AI_EXECUTOR` (structurally identical to `AiManagerService.executeSystemAiRequest`: same method name, same request shape `{modelId?, prompt, systemPrompt, temperature?, maxOutputTokens?}`, same return shape `{data, model, usage}`) and an optional `modelId` string forwarded straight through — it does not hardcode a provider. It was developed and benchmarked against **Claude Sonnet** ("Sonnet 4.6" via `--model sonnet` in their harness) — presumably resolving to Wisenancial's own `claude-sonnet-5` registry entry. No module-specific env vars — it uses whatever the host's `AiManagerService` already uses. **🔴 One finding worth verifying directly, not taken on faith**: `HANDOVER.md` states *"In the environment this was developed against, `ANTHROPIC_API_KEY` held a Groq-format key (`gsk_…`), so Claude models were silently disabled while other providers kept working. Verify yours starts with `sk-ant-`."* This is the team reporting a possible live misconfiguration in Wisenancial's own environment, not a secret found in their repo — I did not open or verify the actual key value myself (out of scope for a read-only, no-values-printed scan), but this is worth checking directly since it would mean `AI_SYSTEM_FALLBACK_ORDER`'s Claude tier has been silently unreachable. **Cost/latency, measured, not estimated**: ~$0.068/article (~2,007 input / 5,742 output tokens) and **~47 seconds per article** — the team's own report states plainly this is *"not suitable for a synchronous request path."* At Wisenancial's Claude credit rate (60/1k in, 300/1k out) that's roughly (2007/1000×60)+(5742/1000×300) ≈ **1,845 credits per article** if ever run through the user-paid path — far too expensive for that; it must stay on the system-paid, background side, and even there the 47s latency requires it to run out-of-band (queue/cron), not inline in a request handler the way `enrichTraderNews()` currently runs.

**Prompts.** Native TypeScript in `src/prompt.ts` (507 lines) — no porting needed, already the target language.

**Tests, error handling, robustness.** By far the most rigorously tested of the two modules: 126 unit tests across `precheck.spec.ts`, `validate.spec.ts`, `guardrails.spec.ts`, `clustering.spec.ts`, `service.spec.ts` (including deliberate mutation tests — break a rule, confirm exactly one test fails, restore it), plus 10 hand-built "golden" scenarios run **live against a real model** (earnings-beat-with-weak-guidance, press-release-only, conflicting sources, empty content, stale news, clickbait, rumor, syndicated duplicates, loss-with-improving-cash-flow, inflation-above-forecast) scored 10/10, plus 3/3 clean on real full-length articles. `MODEL-REPORT.md` documents defects **actually caught by live runs** and fixed with regression tests (a false "invented number" flag on English number-words, a Thai combining-character headline-length miscount, the model citing an outlet name instead of a source id, a 0-1-vs-0-100 probability scale bug). Robustness: validates the model's JSON, retries once with the specific validation errors fed back as feedback, then degrades to a safe `AI_OUTPUT_INVALID` error envelope rather than ever surfacing malformed output — notably more defensive than either Gemini implementation's bare `JSON.parse`. The team is also explicit about what is **not** yet measured: no human domain-expert review of analysis *quality* (only contract-compliance), Thai fluency unassessed by a native speaker, no adversarial/prompt-injection testing, no inter-run consistency measurement, only tested at n=10 batch size.

**🔴 Secret scan of the whole tree and git history: clean.** Single commit, `git log --all` and a pattern scan (Gemini/OpenAI/Anthropic/Groq key shapes, connection strings) across every commit in the clone found nothing. `.gitignore` already correctly excludes `.env`, `*.env` (with `.env.example` allowed), `node_modules/`. No `.pyc`/venv (it's TS-only) and `git ls-files` confirms nothing sensitive is tracked.

**Committed artifacts that shouldn't be in git.** None found — this is a clean deliverable (test fixtures in `test/golden/*.json` are synthetic scenario data, not real secrets or real user data).

---

## 3. Proposed integration design

### Wise_ai (Anthropic) → **Recommendation: (A) Port/integrate directly into the NestJS AI layer**

This is barely a recommendation — it's already built that way. It's a pure-TypeScript library with zero runtime dependencies, already structured as a NestJS `DynamicModule`, already takes `AiManagerService` through a duck-typed interface with no adapter needed, and already ships `toEnrichmentResult()` so the existing `news` table columns and frontend keep working unchanged. The only real engineering work is: (1) wire `NewsAnalysisModule.forRootAsync({imports:[AiModule], useFactory:(ai)=>ai, inject:[AiManagerService]})` into `AiModule` or `NewsModule`, (2) replace the synchronous call in `NewsEnrichmentService.enrichTraderNews()`/cron path with an async/queued call, because 47s per article cannot sit inline in a request or a tight cron loop, (3) decide whether to call this for every article or selectively (the team's own `HANDOVER.md` suggests reserving it for "high importance, low confidence, or a symbol the user holds" given the ~$0.068/article cost), (4) verify the `ANTHROPIC_API_KEY` format concern above before relying on it.

### Gemini News Classifier → **Recommendation: (A) Port, but treat the existing `nestjs/` code as a rough draft, not a mergeable module**

Also technically an (A) candidate — no ML dependencies, plain prompt + REST call, and a TypeScript port already exists — but that port (`nestjs/news-classifier.service.ts`/`.controller.ts`) was built as a **standalone, unauthenticated, uncredited side-controller**, not as a citizen of the existing AI layer. Recommend: (1) do **not** merge `nestjs/` as-is — strip its own `fetch`/retry/API-key handling and reimplement `analyzeV5()`'s prompt+schema logic as a proper `IAiProvider`-shaped call through `AiManagerService` (or, if the team wants Gemini's native `responseJsonSchema` structured-output feature specifically — which `GeminiProvider` in `ai/providers/gemini.provider.ts` may or may not already use, worth checking — as a purpose-built system-prompt call via `executeSystemAiRequest`/`executeAiRequest` like the news-enrichment prompt already is); (2) write a `toEnrichmentResult()`-equivalent adapter (none exists) if the goal is to slot into the existing `news` columns, or explicitly scope this as a **new** feature (new columns, new `NewsDualImpactCard.vue` UI, new endpoint) if the richer dual-impact/compliance-flag output is the actual goal — the team's own frontend-integration files suggest they intended the latter; (3) put the interval/few-shot examples behind Gemini's prompt/context caching instead of re-sending ~6k tokens of examples every call.

### Hard-constraints checklist (against the recommended (A) design for both)

| Constraint | Wise_ai | Gemini module |
|---|---|---|
| Frontend never calls the AI directly | ✅ already true — it's backend-only, no HTTP surface of its own | 🔴 **violated as shipped** — store calls a bare axios instance with no JWT straight at `/ai/news/v5/analyze`; must be rebuilt to go through an authenticated NestJS endpoint |
| Every call goes through NestJS auth + credit + `PaidTierGuard` where applicable | ✅ rides `executeSystemAiRequest` (system-paid, no user credit needed for background enrichment — consistent with how enrichment works today); if ever exposed as a user-triggered "deep analysis" button, route it through `executeAiRequest` + a guard given the ~1,845-credit cost per call | 🔴 **violated as shipped** — its own controller has no guard, no credit deduction, no usage logging at all |
| API keys stay server-side | ✅ | ✅ on the Python/FastAPI side; the TS port is also server-side, just unauthenticated |
| Fallback chain remains a backstop | ✅ natively — `modelId` is optional and forwarded straight to `executeSystemAiRequest`, which already falls back through `AI_SYSTEM_FALLBACK_ORDER` if the preferred model fails | ✅ achievable once ported to go through `AiManagerService` instead of a hardcoded single Gemini call |
| Response shapes the frontend depends on don't break | ✅ `toEnrichmentResult()` already guarantees this | 🔴 no mapping exists yet; either build one or treat this as new UI, not a silent replacement |

### Conflicts/overlaps

- **The two modules directly compete** — both are "turn a news article into structured, neutral market analysis," both could plug into the same `NewsEnrichmentService` call site. Running both unconditionally would double-call an LLM per article for no reason.
- **A layered design may be more valuable than picking one**: Wise_ai's own docs suggest "run a cheap classifier over everything, and [the expensive] analysis only where it earns its cost." The Gemini module (cheap, fast, ~35-40 credits/call) is a natural fit for that first-pass tier; Wise_ai (expensive, slow, ~1,845-credit-equivalent, 47s) is a natural fit for the selective deep-dive tier on high-importance/low-confidence/user-held-symbol articles the cheap pass flags. This is worth putting to both teams as an option rather than treating it as an either/or.
- **Both overlap with the existing `news-enrichment.service.ts`/`AiService.enrichNewsArticle()` prompt**, which already does a simpler version of the same job (single sentiment/trend/importance call, no dual-impact, no guardrail scanning, no source-conflict detection). Whichever module is adopted should **replace** that hardcoded prompt, not run alongside it.
- **Model registry overlap**: Gemini module's `gemini-3.6-flash` compatible-engine already exists in `AI_MODEL_REGISTRY` as `gemini-2.5-flash`'s upstream — no new provider work needed there if that model is accepted. Wise_ai needs nothing new if `claude-sonnet-5` is acceptable; the `HANDOVER.md`'s request to "register `claude-opus-5`" (the model the prompt was actually tuned against) would be new registry work and a pricier tier.

### Questions to ask each team

**Gemini team (Buomman):**
1. Is `News_AI_(Gemini)/` meant to replace `news-enrichment.service.ts`'s existing enrichment call outright, or to power a **new**, separate "dual-impact" feature/UI (the new Vue components suggest the latter — please confirm)?
2. The `nestjs/` controller has no auth guard and the frontend store bypasses the app's shared authenticated axios instance — was this intentional for a standalone prototype, or an oversight before handoff?
3. Was V.5 (the shipped default) tested at all beyond the accuracy numbers in `VersionResult.md`? `test_classifier.py` only covers V.4.
4. Any objection to dropping `gemini_news_classifier.py` (V.4) and the abandoned V.2/V.3 ML-model history references now that V.5 is the recommended version, to reduce surface area?
5. What's the expected call volume — every incoming news article, or only some? (Affects whether the ~6k-token few-shot resend per call needs caching before launch.)

**Wise_ai team (Whit3list):**
1. Confirm intended integration point: replace `enrichTraderNews()`'s current call outright, keep it as an opt-in "deep analysis" feature, or both (cheap pass + selective deep pass)?
2. Please verify directly whether `ANTHROPIC_API_KEY` in the real Wisenancial environment is actually a valid `sk-ant-…` key — `HANDOVER.md` flags this as a real concern from your own dev environment, not a hypothetical.
3. Given the 47s/article latency, what's the intended execution model on the host side — a queue, a slower cron cadence, both? Do you have a recommended concurrency/rate limit against Anthropic's API?
4. `claude-opus-5` isn't in Wisenancial's model registry (only `claude-sonnet-5` is) — is Sonnet an acceptable production substitute given all published results already used it, or does quality meaningfully depend on Opus?
5. Given the explicit "no human review of analysis quality yet" and "no adversarial/prompt-injection testing yet" gaps in `MODEL-REPORT.md` — what's the plan to close those before this touches real user-facing Thai financial analysis at volume?

---

## Chunk 0 — Facts (read-only)

Date: 2026-09-24. No code changed; one one-off read-only DB script was written and deleted after use (`tradingjournal-backend/_tmp-chunk0-facts.mjs`, same pattern as prior sessions' `_prisma_migrations` checks).

### 1. Overlap analysis and proposed split

**Neither module is actually pre-scoped to TRADER or INVESTOR** — both are generic financial-news analyzers:

- **Gemini V.5** (`News_AI_(Gemini)/README.md:16`) explicitly tags asset class as `EQUITIES | FIXED_INCOME | FOREX | COMMODITIES | CRYPTO | GENERAL`, and its news categories (`MACROECONOMIC`, `CENTRAL_BANK`, `CORPORATE_EARNINGS`, `GEOPOLITICAL_COMMODITIES`, `REGULATORY_LEGAL`, `GENERAL_FINANCIAL`) span both macro/calendar-style news (TRADER-relevant) and corporate-specific news (INVESTOR-relevant). It was built to cover everything.
- **Wise_ai**'s `NewsArticleInput` (`_ai_modules/Wise_ai/src/types.ts:150-160`) has `relatedSymbols`, `sector`, `market` — symbol/sector-anchored shape that fits `market_news.stock_symbols` naturally, but nothing in `HANDOVER.md`/`MODEL-REPORT.md` restricts it to stocks only; it's provider-agnostic and scope-agnostic by design, and `toEnrichmentResult()` targets the *shared* `NewsEnrichmentResult` contract used by both `enrichTraderNews()` and `enrichInvestorArticle()`.

So the split can't come from "what each module is built to analyze" — both claim the same territory. It has to come from **the existing architecture's own table/cadence split**, which already exists and is a hard constraint neither module should fight:

| | `news` (TRADER, economic calendar) | `market_news` (INVESTOR, stock news) |
|---|---|---|
| Sync cadence | `NewsSyncService` — Forex calendar sync (frequent; the code comment at `news-sync.service.ts:117-122` explicitly contrasts it against the hourly stock cadence) | `@Cron(CronExpression.EVERY_HOUR)`, ~20 articles/run (`news-sync.service.ts:124,350`) |
| Row volume (measured, see §2) | 196 rows / 14 days ≈ 14.0/day | 223 rows / 14 days ≈ 15.9/day |
| Content shape | Structured economic-calendar fields (`country`, `impact`, `forecast`, `previous`, `actual`) — not free-text articles | Free-text news articles with `stock_symbols`, `sector` |

**Proposed split — by role, not by portfolio type:**
1. **Gemini replaces the existing cheap first-pass enrichment on BOTH tables** — it's fast, ~35-40 credits/call, and its asset-class/category breadth genuinely fits both the calendar-event shape (`news`) and free-text articles (`market_news`). This directly replaces `AiService.enrichNewsArticle()`'s current hardcoded prompt in `enrichTraderNews()` and `enrichInvestorArticle()`, once a `toEnrichmentResult()`-equivalent adapter is written for it (per the existing discovery report, none exists yet — needed either way).
2. **Wise_ai runs ONLY as a selective, async second pass on `market_news` (INVESTOR side only)** — never on `news`/TRADER. Reasons: (a) 47s/article and ~$0.068/article make it uneconomical and latency-incompatible with TRADER's tighter calendar-sync cadence; (b) `news` rows are structured economic-calendar data, not the kind of multi-source, claim-status, source-conflict-detection article analysis Wise_ai is built for (`ClaimStatus`, `SourceConflict`, `syndicatedCopyIds` — all assume free-text articles from possibly-multiple wire sources, matching `market_news`, not calendar events); (c) `market_news`'s lower, hourly-batched volume (vs `news`'s continuous calendar feed) is the only one of the two that's realistically affordable even with selective filtering (see §2 cost math).
3. This directly matches Wise_ai's own recommendation in `HANDOVER.md:100`: *"run a cheap classifier over everything, and this analysis only where it earns its cost — high importance, low confidence, or a symbol the user holds."* Gemini is that cheap classifier; Wise_ai is the selective deep-dive, and the selection criteria (Gemini-flagged `importance: HIGH` or `review_required`/low-confidence, or a symbol present in any user's held positions) comes from Gemini's own first-pass output — a natural two-stage pipeline, not two competing modules.

No item would ever be double-analyzed under this split: every article gets exactly one Gemini pass; only a filtered subset of `market_news` articles additionally gets a Wise_ai pass, and Wise_ai's result (via `toEnrichmentResult()`) simply overwrites the same `news`/`market_news` columns Gemini already wrote — same contract, upgraded value, same row.

### 2. Cost estimate

Read-only query against the real Neon DB, 14-day window ending 2026-09-24T14:27:29Z:

| Table | Total rows (14d) | Rows/day (avg) | `importance=HIGH` (AI-assigned) | High-impact % |
|---|---|---|---|---|
| `news` (TRADER) | 196 | 14.00 | 17 | 8.7% |
| `market_news` (INVESTOR) | 223 | 15.93 | 19 | 8.5% |
| **Combined** | **419** | **29.93** | **36** | **8.6%** |

(`news` also has a raw, non-AI `impact` field from the economic-calendar source itself — `High`: 23/196 = 11.7% — included for reference but the AI-assigned `importance` column is the more relevant "worth a deep pass" signal since it's the same signal Wise_ai's own recommendation refers to.)

**Cost basis**: Wise_ai's own measured figure, verified directly in their repo (`MODEL-REPORT.md:63`): **~$0.0683/article** (avg 2,007 input / 5,742 output tokens, Claude Sonnet). Assumption: this average holds regardless of article length variance in the real feed — their sample size was small (10 golden scenarios + 3 real articles), so treat this as a rough planning figure, not a guarantee.

**Scenario (a) — every new article gets a Wise_ai pass:**
| Scope | Daily cost | Monthly cost (×30) |
|---|---|---|
| `market_news` only (recommended target) | 15.93 × $0.0683 ≈ **$1.09** | ≈ **$32.65** |
| `news` only (not recommended) | 14.00 × $0.0683 ≈ **$0.96** | ≈ **$28.69** |
| Both combined (not recommended) | 29.93 × $0.0683 ≈ **$2.04** | ≈ **$61.34** |

**Scenario (b) — only `importance=HIGH` items get a Wise_ai pass** (using the 8.5%/8.7% measured fractions above as a proxy for "high-impact," acknowledging this is circular if Wise_ai itself is meant to help *determine* importance — in the proposed two-stage design, Gemini's first-pass `importance` is what gates the Wise_ai second pass, so this fraction is a reasonable estimate of how often that gate would open):
| Scope | Daily cost | Monthly cost (×30) |
|---|---|---|
| `market_news` only (recommended target) | 15.93 × 0.085 × $0.0683 ≈ **$0.093** | ≈ **$2.78** |
| `news` only (not recommended) | 14.00 × 0.087 × $0.0683 ≈ **$0.083** | ≈ **$2.49** |
| Both combined (not recommended) | 29.93 × 0.086 × $0.0683 ≈ **$0.176** | ≈ **$5.27** |

**Bottom line for the recommended design** (Wise_ai on `market_news`, selective only): **≈$2.78/month**, comfortably affordable, vs. **≈$32.65/month** if run unconditionally on every INVESTOR article, vs. **≈$61.34/month** if (against the recommendation above) also run unconditionally on TRADER's `news` table.

### 3. ANTHROPIC_API_KEY prefix check

`ANTHROPIC_API_KEY` is set in `tradingjournal-backend/.env` — **does NOT start with `sk-ant-`** (value not printed, prefix checked only). This confirms Wise_ai's own `HANDOVER.md` warning is a live, real issue in this environment right now, not a hypothetical: Claude/Anthropic is very likely silently unreachable through `AI_SYSTEM_FALLBACK_ORDER` today. **This should be fixed independently of the integration work** — it affects the existing fallback chain regardless of whether either new module is adopted. Recommend rotating/replacing this env var with a real `sk-ant-…` key as a standalone, immediate fix, separate from this integration project.

### 4. Vendoring approach

**Recommendation: the user's proposed approach — vendor Wise_ai's source into `tradingjournal-backend/src/ai/modules/wise-ai/` with a `SOURCE.md` pinning the repo URL and commit `014b42d`.**

No existing vendoring convention was found in this repo — grepped for `SOURCE.md`, `vendor/`, `third_party`/`third-party` across the whole tree; the only incidental hits were an unrelated "source" mention in `docs/mt5-investor-password-spike.md` and a comment in the Gemini module's own Python file, neither a real precedent. `package.json` also has no `git+https://...` style dependency anywhere, so there's no existing pattern to match against or break — this would be a first for the repo either way.

Evaluated against alternatives:
- **Git submodule**: requires every contributor to have access to `github.com/Whit3list/Wise_ai` (currently a private/external team repo) just to run `git clone --recursive` or `submodule update` — a real onboarding friction point, and submodules are easy to forget to update, silently leaving contributors on a stale pin without any build-time signal. Rejected.
- **Git subtree**: solves the submodule-friction problem (code is really there, no separate clone step) but adds `git subtree pull` tooling overhead and unusual merge history for what is a small (~15-file), zero-runtime-dependency module — heavier tooling than the module's size justifies. Rejected.
- **npm package**: not available — Wise_ai has no published package, and standing one up (private registry or git-URL dependency) is more infrastructure than warranted for one module from one team, though worth revisiting if more modules like this appear.
- **Plain vendor + `SOURCE.md`** (user's proposal): simplest option — `npm ci` stays fully self-contained (no external network access needed at install time beyond npm itself), every contributor sees the exact code in their normal `git clone`, and the pin is a single human-readable file stating exactly what commit was copied and when. The tradeoff is manual upgrades (someone has to diff and re-copy on a Wise_ai update) — acceptable given the module is complete/stable (single commit, no active development cadence implied) and small enough to diff by hand.

**Recommendation stands as proposed**: vendor + `SOURCE.md`. Suggest the `SOURCE.md` also record the exact list of files copied (so a future diff against upstream is unambiguous) and a one-line note that local modifications, if any become necessary, should be documented in the same file rather than silently diverging from upstream.

---

## Chunk A — blocked on schema decision (RESOLVED — see "Chunk A — Gemini first-pass enrichment" below)

**Resolved 2026-09-24: user chose option 1** — add a migration for a nullable `ai_confidence Float?` on both `news` and `market_news`, mirroring `ai_impact_probability`. This keeps Chunk 0's original "high-importance OR low-confidence" Wise_ai trigger intact (no scope change). Implementation, verification, and a new blocker hit along the way are documented in the section below.

Original read-only investigation preserved below for reference.

Date: 2026-09-24. Read-only investigation only — no code changed, nothing implemented, nothing committed. Stopped at the Step-1 gate as instructed, before writing any Prisma migration.

### What already exists (no migration needed for this part)

Both `news` (`schema.prisma:646-680`) and `market_news` (`schema.prisma:960-984`) already have an `importance NewsImportance @default(MEDIUM)` column, and `NewsImportance` (`schema.prisma:32-36`) is exactly `HIGH | MEDIUM | LOW` — a byte-for-byte match to Gemini V.5's `importance` output field. **Persisting Gemini's importance requires zero schema changes.**

### What's missing

Neither table has anywhere to store a **confidence** score:

- `news`: `id, title, country, impact, forecast, previous, actual, date, content, source, url, importance, sentiment, ai_summary, market_impact_analysis, ai_trend, ai_impact_probability, ai_translated_summary, related_symbols, ai_analyzed_at, created_at, updated_at` — no numeric confidence/score field.
- `market_news`: `id, title, content, source, url, importance, sentiment, ai_summary, stock_impact_analysis, ai_trend, ai_impact_probability, ai_translated_summary, sector, stock_symbols, published_at, created_at, updated_at` — same gap.

Two columns look superficially reusable but aren't safe to repurpose without a migration:
- `ai_impact_probability Float?` — already has a defined, different meaning (the *magnitude* of likely market impact, 0-100, written by the current hardcoded prompt today via `analysis.aiImpactProbability`, `news-enrichment.service.ts:38`). Overloading it with Gemini's confidence (a *how-sure-is-the-model* score, 0-1 scale per the module's `NewsClassificationResult.confidence`) would conflate two different signals in one column and corrupt whatever currently reads `aiImpactProbability`.
- `ai_translated_summary Json?` — already has a fixed contract, `{ en: string; th: string }` (`ai-news.types.ts:22`), and is read directly by the frontend as `translatedSummary` (`news-feed.service.ts:172,225`). Stashing a `confidence` key inside this JSON blob alongside the translation would work technically (Prisma won't stop it) but silently changes a field the frontend already depends on for a fixed shape, and burying enrichment metadata inside a "translated summary" field is exactly the kind of interface-shape drift the user's hard constraints (`toEnrichmentResult` "existing contract" requirement) are meant to prevent.

### Confirmed while investigating (useful for the next decision)

- Current enrichment flow: `NewsEnrichmentService.enrichTraderNews()`/`enrichInvestorArticle()` → `AiService.enrichNewsArticle()` (`ai.service.ts:234`) → `AiManagerService.executeSystemAiRequest()` (`ai.service.ts:244`) — **system-paid, no `ai_token_balance` deduction today**, confirming the discovery report. A Gemini-backed replacement that also goes through `executeSystemAiRequest`/`AiManagerService` would inherit this for free — no new deduction call needs to be added or guarded against.
- `toEnrichmentResult()`-equivalent for Gemini still doesn't exist (confirmed, matches the original discovery report) — this would need to be written regardless of the schema question below.

### Options for the user to pick from (none implemented)

1. **Add a migration**: one nullable column per table, e.g. `ai_confidence Float?` on both `news` and `market_news` (mirrors the existing `ai_impact_probability Float?` pattern exactly — same type, same nullability, same "AI metadata, not core data" character). Smallest, cleanest option, but is a real migration on production tables (additive/nullable, so low-risk, but still schema-changing) — needs your sign-off before any migration file is written or applied to Neon.
2. **Don't persist confidence separately — derive Wise_ai's selection trigger from `importance` alone.** The original Chunk 0 plan said Wise_ai should run on "Gemini-flagged high-importance **or** low-confidence" items; if confidence isn't stored, the second-pass trigger becomes "importance = HIGH" only. This avoids any migration entirely but narrows the selection criteria from what Chunk 0 proposed — a real behavior change from what was agreed, not just an implementation detail, so flagging it rather than deciding it silently.
3. **Store confidence in a new, clearly-scoped JSON field** rather than overloading `ai_translated_summary` — e.g. a single `ai_metadata Json?` column added via migration, reserved for enrichment-provider metadata (confidence today, room for `model`/`promptVersion`/`reviewRequired` later without repeated migrations). Also requires a migration, but a JSON column is cheaper to extend later than adding a new scalar column per future signal. Same sign-off requirement as option 1.

**Stopping here per instructions.** No migration file was created, nothing was implemented in `src/ai/`, no feature flag or provider was added, and no tests were written — all of that is gated on which option above you pick (or confirmation that option 2's narrower "HIGH-importance-only" trigger is acceptable). Chunk 2's `.gitignore` item (`__pycache__/`, `*.pyc`) was also left untouched since it's part of the same chunk's implementation work, not the investigation.

---

## Chunk A — Gemini first-pass enrichment

Date: 2026-09-24. Implementation complete and unit-tested; **two independent real-world blockers prevented full end-to-end verification** (details below) — nothing was committed, per instructions.

### 1. Migration

`prisma/migrations/20260924000000_add_ai_confidence_to_news_tables/migration.sql` — additive, nullable `ai_confidence DOUBLE PRECISION` on both `news` and `market_news`, matching `ai_impact_probability`'s existing type/nullability exactly. `schema.prisma` updated to match (`news` model + `market_news` model), each with a comment explaining the column's purpose and pointing at the other table's twin.

**🔴 Not yet applied to Neon.** `npx prisma migrate deploy` was blocked by this session's own sandbox: *"Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Production Deploy]."* This is a harness-level guardrail on this specific background session, not a database or permissions problem — `prisma migrate status` (read-only, ran cleanly) confirms the new migration is the only one pending, on top of an otherwise-clean baseline (13 migrations already applied, nothing else outstanding). **You need to either run `npx prisma migrate deploy` yourself in `tradingjournal-backend/`, or grant this session's Bash tool permission for that command** before this chunk can be considered live.

### 2. `npx prisma generate` — also blocked, cascades into typecheck

Same sandbox, different reason: *"Reason: [Modify Shared Resources]."* This is pure local codegen (reads `schema.prisma`, writes `node_modules/.prisma/client`), not a DB write, but was blocked too. Consequence: the generated Prisma Client still doesn't know about `ai_confidence`, so `npx tsc --noEmit` in `tradingjournal-backend/` currently reports exactly 2 errors, both and only this:

```
src/news/news-enrichment.service.ts(44,9): error TS2353: Object literal may only specify known properties, and 'ai_confidence' does not exist in type '(Without<newsUpdateInput, newsUncheckedUpdateInput> & newsUncheckedUpdateInput) | (Without<...> & newsUpdateInput)'.
src/news/news-sync.service.ts(389,9): error TS2353: Object literal may only specify known properties, and 'ai_confidence' does not exist in type 'market_newsUncheckedCreateInput'.
```

Both lines are exactly the `ai_confidence: analysis.confidence` write this chunk added — this is the expected, sole symptom of the client being stale, not a real bug. **Run `npx prisma migrate deploy && npx prisma generate` in `tradingjournal-backend/`, then re-run `npx tsc --noEmit` to confirm 0 errors** — I could not do this final confirmation myself.

### 3. What was implemented

- **`src/ai/gemini-news-classifier.prompt.ts`** — ported prompt: News_AI_(Gemini) V.5's neutrality mandate (non-advisory / balanced / grounded / probabilistic) and its `FORBIDDEN_ADVISORY_PATTERNS` anti-inducement regex list (ported verbatim, English + Thai), combined with this repo's own `investmentGuardrail()`/`concisenessRule()` conventions. Deliberately does **not** port V.5's own dual-impact output schema (`news_category`, `market_stance`, `dual_impact_analysis`, `reasoning_steps`, ...) — that has no existing UI/column mapping (per the original discovery report) and porting it would have been a new feature, not this chunk's brief. Instead the prompt asks Gemini to answer directly in the existing `NewsEnrichmentResult` JSON contract plus a `confidence` field. Few-shot examples trimmed from the original 8 (~6-6.5k tokens, resent every call, flagged as wasteful in the discovery report) to 2, re-labelled onto the existing contract — real examples from `fewshot_examples_v5.json`, not invented ones.
- **`src/ai/gemini-news-classifier.service.ts`** (`GeminiNewsClassifierService`) — single-attempt call through `AiManagerService.executeSystemAiRequest({modelId: 'gemini-2.5-flash', preferredOnly: true, ...})` (never calls the Gemini API directly). Validates every field's presence/type/enum membership and re-runs the ported anti-inducement scan against the model's actual output (a well-formed JSON response can still contain forbidden advisory language — a bare `JSON.parse` success doesn't catch that). Any validation failure throws `GeminiClassificationValidationError`, treated identically to a network failure by the caller.
- **`src/ai/ai-manager.service.ts`** — `executeSystemAiRequest` gained two new optional request fields: `preferredOnly` (try exactly one model, no chain-walk — used for the Gemini-only attempt above) and `excludeProviders` (skip specific providers — used so the post-Gemini-failure fallback doesn't immediately retry Gemini a second time inside the existing chain, since `gemini-2.5-flash` sits 2nd in `AI_SYSTEM_FALLBACK_ORDER`). Both are additive, default-off params; existing call sites (chart insight, portfolio review, etc.) are unaffected.
- **`src/ai/ai.service.ts`** — `enrichNewsArticle()` gained an optional 5th parameter, `{excludeProviders?}`, threaded straight to the manager call above. Existing 4-arg call sites (unchanged) behave identically.
- **`src/ai/ai-news.types.ts`** — new `NewsEnrichmentOutcome` type (`NewsEnrichmentResult` + `confidence: number | null` + `servedBy: 'gemini' | 'legacy-chain' | 'fallback-chain'`).
- **`src/ai/ai.module.ts`** — registered `GeminiNewsClassifierService` as a provider/export.
- **`src/news/news-enrichment.service.ts`** — new `enrichWithFallback()` gate: reads `GEMINI_NEWS_ENRICHMENT_ENABLED` (`=== 'true'`, matching this repo's existing flag convention — see `MT5_CLOUD_SPIKE_ENABLED`). Off (default): behaves exactly as before, `geminiClassifier` never touched (constructor param is optional, so the existing hand-constructed unit test with only 3 args still compiles and passes unmodified). On: tries `GeminiNewsClassifierService.classify()` once; on any failure, logs the reason and falls back to `AiService.enrichNewsArticle(..., {excludeProviders: ['gemini']})` — the existing groq→openai→anthropic chain, Gemini skipped since it just failed. Logs which path served each item (`gemini` / `legacy-chain` / `fallback-chain`) via the Nest `Logger`. `enrichTraderNews()` now also writes `ai_confidence: analysis.confidence` (`null` on any non-Gemini path). `enrichInvestorArticle()` now returns the full `NewsEnrichmentOutcome` (was previously a bare pass-through of `ai.enrichNewsArticle()`).
- **`src/news/news-sync.service.ts`** — `market_news` create/update `data` object now also sets `ai_confidence: analysis.confidence`, flowing from `enrichInvestorArticle()`'s richer return type.
- **`ai_token_balance` / credit deduction**: confirmed unchanged — `executeSystemAiRequest` never touches `ai_token_balance` on either the Gemini or fallback path (only `executeAiRequest`, the user-billed method, does). The Gemini path stays exactly as system-paid/free-to-the-user as the existing enrichment path always was.
- **`.gitignore`** (root) — added `__pycache__/` and `*.pyc` (the 3 already-committed `.pyc` files under `News_AI_(Gemini)/backend/__pycache__/` from Buomman's commits are untouched — this only stops new ones, noted in the comment).
- **`.env.production.example`** — documented `GEMINI_NEWS_ENRICHMENT_ENABLED=false` next to the existing `GEMINI_API_KEY` block.

### 4. Tests — all 5 required scenarios, plus classifier-level coverage

`src/ai/gemini-news-classifier.service.spec.ts` (6 tests): successful classification through a mocked `AiManagerService` (asserts `preferredOnly: true`, `modelId: 'gemini-2.5-flash'`); confidence/impact-probability clamping; **malformed output** via an invalid `importance` enum value; **malformed output** via a missing required field; **malformed output** via forbidden advisory language slipping into the response; a plain provider/network failure propagating unchanged.

`src/news/news-enrichment.gemini-fallback.spec.ts` (5 tests, one per required scenario): **flag off → unchanged** (Gemini never called, `ai_confidence` null, legacy summary persisted — proves zero behavior change for the default state); **flag on, Gemini serves** (importance + confidence both persisted correctly, no fallback call made); **flag on, Gemini fails (network/timeout) → fallback chain**, asserting `excludeProviders: ['gemini']` was passed; **flag on, Gemini malformed output → fallback chain**, same assertion; **`enrichInvestorArticle` (market_news path) carries confidence through** when Gemini serves.

Full backend suite: **596/596 passing** (`npx jest` in `tradingjournal-backend/`), including all 11 new tests above and the 2 pre-existing `news-enrichment.service.spec.ts` tests unmodified. Note: `ts-jest` in this repo's config doesn't strictly type-check per file, so these tests pass despite the 2 pending `tsc` errors above — they're real signal that the *logic* is correct, but don't substitute for the post-`prisma generate` typecheck confirmation still needed.

### 5. Frontend regression (untouched by this chunk, run anyway per instructions)

- `npx vitest run`: **526/526 passing**, no regressions.
- `npx vue-tsc --noEmit`: clean, 0 errors.
- `npx quasar build`: **Build succeeded**, 0 ESLint errors (only a pre-existing, unrelated dynamic-import chunking warning about `boot/axios.ts`).

### 6. Real small-batch sync verification — blocked (a *different*, live/environmental issue)

Attempted a read-only-safe verification: pulled 3 real recent headlines (2 from `news`, 1 from `market_news`, plain `SELECT`, no schema dependency on `ai_confidence`) and called the Gemini API directly with both the old and new system prompts, without persisting anything (sidesteps both blockers above). **All 6 calls (3 headlines × before/after) failed with HTTP 429**: *"You exceeded your current quota, please check your plan and billing details."* This is the real `GEMINI_API_KEY` in this environment hitting its actual rate/quota limit right now — unrelated to this chunk's code, and a third, independent thing worth your attention (on top of the already-flagged `ANTHROPIC_API_KEY` prefix issue from Chunk 0). **3 concrete before/after examples could not be captured** as a result. The verification script was deleted after use (`_tmp-chunkA-before-after.mjs`, same throwaway pattern as prior sessions).

### 7. Post-migration confirmation (2026-09-25)

The user rotated the Neon password, updated `DATABASE_URL`/`DIRECT_URL` themselves, created a Neon branch as a backup, and ran `npx prisma migrate deploy` + `npx prisma generate` themselves (not this session — a new standing rule now prohibits this session from reading/echoing `.env` credentials through shell commands at all).

- **`npx prisma migrate status`**: *"Database schema is up to date! · 13 migrations found in prisma/migrations"* — fully in sync, 0 pending. The `ai_confidence` migration is live on Neon.
- **`npx tsc --noEmit`** (backend): **0 errors** — confirms the 2 errors reported earlier were exactly and only the stale-Prisma-client symptom, now resolved.
- **Full regression, re-run clean:**
  - Backend `npx jest`: **596/596 passing**.
  - Frontend `npx vitest run`: **526/526 passing**.
  - Frontend `npx vue-tsc --noEmit`: 0 errors.
  - Frontend `npx quasar build`: **Build succeeded**, 0 ESLint errors (same pre-existing, unrelated dynamic-import warning about `boot/axios.ts` as before — not introduced by this chunk).
- **Before/after examples: still not captured, deliberately skipped this round.** Per explicit instruction, this session made **no Gemini API calls** in this pass — the current key is free-tier, capped at 20 requests/day (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, see the quota details recorded earlier in this section), already exhausted, and too small for this workload regardless of reset timing. Waiting on a billing-enabled Gemini key before running the 3 concrete before/after examples.

### Summary — what's left before this chunk is fully closed out

1. ~~Apply the migration~~ **Done** (user-run, confirmed above).
2. ~~Regenerate the Prisma Client~~ **Done** (user-run, confirmed above).
3. ~~Re-run `npx tsc --noEmit`~~ **Done — 0 errors.**
4. **Still pending**: a billing-enabled Gemini API key, then re-run the small-batch before/after comparison for the 3 concrete examples originally requested.
5. Nothing was committed — all of Chunk A (migration file, schema.prisma, 4 modified `src/ai`/`src/news` files, 2 new prompt/service files, 2 new spec files, `.gitignore`, `.env.production.example`) is sitting as uncommitted working-tree changes, same as every other chunk this session. Still waiting for explicit approval before any commit.

# AI services handover — integration discovery & plan

Date: 2026-09-26 · Investigation only. No repo code changed. Package: `wisenancial-ai-services.zip`,
extracted to `C:\Users\iamre\Desktop\ai-services-handover` (outside the repo).

Cost figures below are **estimates from assumed list prices and token counts**, not measurements from our
account (exception: Claude guardrails, whose per-article cost is the vendor's own measurement). Re-check
current provider pricing before deciding anything.

## 1. Package hygiene / secret scan

- Zip contains a `.git` with **1 commit** (`0e824a3`, "consolidate wisenancial ai services package").
- History scan (regex over every patch: Anthropic `sk-ant-`, OpenAI `sk-`, Gemini `AIza`, Groq `gsk_`,
  HF `hf_`, Stripe, AWS `AKIA`, DB URLs with credentials, PEM private keys): **not found**. Only
  `.env.example` was ever committed (no real values). gitleaks/trufflehog are not installed here, so this is
  a regex scan, not a full entropy scan.
- Working tree: no `.env`, no real keys. Test files use fake keys.
- Housekeeping: `News_AI_(Gemini)/backend/__pycache__/*.pyc` is committed; `HANDOVER_GUIDE.md` is actually a
  `.gitignore` body; root `README.md` is a title only. Neither matters for us.

## 2. claude-guardrails-service

**It is the same code as the `Wise_ai` clone we already reviewed** (`Desktop\_ai_modules\Wise_ai`): 34 files
compared, identical apart from CRLF line endings. Nothing new to evaluate beyond
`Claude outputs/ai-modules-integration-discovery.md` §2 (that discovery still applies).

Tests, run in the extracted copy: `npm install` OK, `tsc --noEmit` clean, **jest 125/126 pass**. The one
failure is `service.spec.ts` "the reference schema file is where the task description says it is": it reads
`schemas/envelope.schema.json`, which lives outside the package and is not shipped. Environmental, not a
logic bug (the rest of that block uses a hard-coded field list). Treat as "126 claimed → 125 pass + 1
missing-fixture" until the schema file is supplied or the test is skipped.

**Not yet in our repo** (no `NewsAnalysis*` reference under `tradingjournal-backend/src`).

### How it plugs into our pipeline

| Concern | Fit |
|---|---|
| Entry point | `NewsAnalysisService.analyse(articles[], {modelId, requestId})`, takes an injected `SYSTEM_AI_EXECUTOR` that is structurally identical to `AiManagerService.executeSystemAiRequest`. So `AiModule` can pass `AiManagerService` straight in. |
| Credits | Must stay on the **system-paid** path (`executeSystemAiRequest`, no credit deduction). Via the user-paid path it would be ~1,845 Claude credits/article (60/1k in, 300/1k out on ~2k in / ~5.7k out). Never expose it on a user endpoint without a budget. |
| Fallback | **Gap.** `executeSystemAiRequest` walks `AI_SYSTEM_FALLBACK_ORDER` (groq → gemini → gpt-4o → claude), so passing `modelId: 'claude-sonnet-5'` without `preferredOnly` silently serves a Groq model on a prompt validated only against Claude. The executor we hand it must be a thin wrapper that sets `preferredOnly: true`. Same pattern as `GeminiNewsClassifierService`. On Claude failure the module returns an error envelope (`AI_OUTPUT_INVALID`) instead of throwing, so the caller keeps the existing `news` row untouched. |
| Latency | ~47 s/article measured by the vendor. Cannot run inside `enrichTraderNews`/`runInvestorSync` (investor sync already takes ~50 s/run for 20 articles). Must be out-of-band: separate cron/queue draining a "needs second pass" set. |
| Data contract | Rich output does not fit `news` columns. `toEnrichmentResult()` maps onto `NewsEnrichmentResult` (8→3-value sentiment, 0-1→0-100 probability, `importance` is a new heuristic). Rich fields (positive/negative factors, claim status, conflicts) need a new nullable JSON column (e.g. `ai_analysis Json?`) on `news` and `market_news`. Additive migration. |
| Trigger | The `ai_confidence` column (added in 68ea0d0) exists for this: second pass when `importance = HIGH` or `ai_confidence < 0.80`. |
| Key | Needs a valid `ANTHROPIC_API_KEY` (`sk-ant-`). Our notes say the current one is broken; blocked until replaced. |

### Overlap with what we have

- Partial overlap only: our advisory-language regex scan (`gemini-news-classifier.prompt.ts`) is a small subset
  of its guardrails (invented-number check, source-id citation check, claim status, conflicts, clustering of
  syndicated duplicates). Its validation/retry-with-feedback loop is stricter than our single-shot
  `validateAndNormalize`. Its clustering overlaps with our `removeDuplicates()` in `news-sync.service.ts`
  (title-level only), so keep ours and don't run both.
- It is a **second-pass upgrade**, not a replacement for first-pass enrichment (cost/latency make that
  impossible).
- Unmeasured by the vendor: expert-reviewed analysis quality, Thai fluency by a native speaker, prompt
  injection, run-to-run consistency, batches larger than 10.

## 3. News_AI_(Gemini) vs what we integrated in `68ea0d0`

**The zip ships V.4** (`model-manifest.json` version V.4, created 2026-09-21; single-label
sentiment/importance/confidence). What we integrated in 68ea0d0 was ported from the **V.5** dual-impact
module (that directory was later deleted, `31746cf`). So the zip is *older* than our source, not an update.

| Item | Zip (V.4) | Ours (68ea0d0) | Verdict |
|---|---|---|---|
| Few-shot | 9 examples, 3×3 sentiment×importance grid (~5.4 KB ≈ 1.4k tokens), articles + labels only | 2 examples in our contract shape (~0.6k tokens) | **Optional merge**: the balanced-grid idea is good (fixes class skew), but the 9 examples must be re-shaped to `NewsEnrichmentResult` and labels come from `human_review_sim_from_ai_prelabel`, i.e. AI pre-labels, `human_reviewed: false`. Do a human pass on them first. |
| Dedup cache | SHA-256 in-memory, 24 h TTL | none | **Skip for sync**: the DB already dedups (`ai_analyzed_at`, only new/changed rows are enriched). Only worth adding for a repeated on-demand path. |
| Review flag `< 0.80` | `review_required = confidence < 0.80` | stores `ai_confidence`, no flag | **Keep ours**: `ai_confidence` is the data; the 0.80 cutoff belongs in the second-pass selector (config), not a new column. Calibrate 0.80 on our own data first. |
| Neutrality / anti-inducement scan | absent in V.4 | present (Thai + English patterns) | Ours is better. |
| Temperature / output cap | `temperature: 0`, `maxOutputTokens: 180` | not set / 1000 | **Cheap win**: set temperature 0 for classification (verify our provider layer exposes it), tighten the output cap after reviewing real output length. |
| Accuracy claims | valid 94%/88%, **test 78%/76%** (n=50 test, pseudo-labels) | none measured | Treat as indicative only. |
| Robustness | bare `JSON.parse`, unauthenticated controller, own `fetch`, bypasses AiManager | via `AiManagerService`, fenced-JSON parsing, validation, fallback chain | Ours is safer. Do not mount their controller. |
| Model | `gemini-flash-lite-latest` default | `gemini-2.5-flash` id → upstream `gemini-3.6-flash` | Flash-lite would need a new registry entry; decide on cost after the before/after review. |

**Recommendation: keep ours, cherry-pick.** Do not swap. Merge only (a) temperature 0, (b) the balanced
few-shot idea once labels are human-reviewed, (c) the 0.80 threshold as a config value for the second-pass
selector. The `frontend-integration/` Vue files target the V.4/V.5 API shapes and are not needed.

## 4. sentiment-service (Qwen2.5-7B-Instruct + LoRA v8) — hosting estimate only, not run

What the code does: FastAPI `POST /predict`, system prompt "Output only one word: Bullish, Bearish, or
Neutral", `max_new_tokens=10`. Loads base `Qwen/Qwen2.5-7B-Instruct` (downloaded from HF at start, ~15 GB)
+ 161 MB LoRA adapter. On CUDA: bitsandbytes 4-bit NF4. On CPU: float32 fallback. The adapter README is the
generic PEFT template: **no accuracy/eval numbers are shipped**, so there is no evidence it beats Gemini or
Groq. It only produces the 3-value sentiment we already get from every enrichment call.

| Sizing | Estimate |
|---|---|
| GPU (4-bit) | ~5–6 GB weights + KV/activations, so a **16 GB card is enough (T4)**; 24 GB (L4/A10G) gives headroom for concurrency. |
| Host RAM | 16 GB minimum, 32 GB comfortable (model load peaks in RAM before quantizing). |
| Disk | ~20 GB (base model cache + adapter + CUDA/torch image). |
| CPU-only | Needs ~30 GB RAM for fp32 and would be seconds-per-item slow. Not viable. |
| Cost, always-on | T4-class ≈ **$250–400/month**; L4/A10G-class ≈ **$500–800/month** (typical on-demand cloud rates; verify). |
| Cost, scale-to-zero serverless GPU | Billed per second; cold start pulls a 15 GB model, so 1–3 min first-request latency unless kept warm. Only sensible for batch use. |
| Break-even | At our volume (see §5, ~15–20k items/month) this is **~$12–40 per 1,000 items** vs **~$0.2–1.2 per 1,000** for API models. It only pays off above several hundred thousand items/month. |

**Recommendation: do not host it now.** Revisit only if we have a concrete need the APIs don't meet (cost at
large scale, data-residency, offline) and an evaluation showing it matches Gemini/Groq on our labelled set.

## 5. Integration plan

### Current volume (from `news-sync.service.ts`)
Investor: hourly, up to 20 articles/run → ≤ ~480/day ≈ **~14k/month**. Trader: economic events, enriched
only when new/actual changed, so a few hundred to low thousands/month. Working assumption **15–20k items/month**.

### Cost per 1,000 news items (estimates)
Assumed per-item tokens: ours ≈ 1.4k in / 0.3k out; V.4 prompt ≈ 2.1k in / 0.1k out; Groq ≈ 1.5k in / 0.35k
out. Assumed prices per 1M tokens: Groq gpt-oss-20b $0.075 in / $0.30 out; Gemini flash-tier
$0.30 in / $2.50 out (flash-lite $0.10 / $0.40); Claude: vendor-measured per article. Gemini "thinking"
tokens, if enabled, raise output cost.

| Provider / path | Est. cost per 1,000 items | At ~20k items/month |
|---|---|---|
| Groq (current head of fallback chain, first pass) | ~$0.2 | ~$4 |
| Gemini flash, our contract (Chunk A) | ~$1.2 | ~$23 |
| Gemini flash-lite, our contract | ~$0.3 | ~$5 |
| Gemini flash + V.4 9-example prompt | ~$0.9 | ~$18 |
| Claude guardrails, every item | ~$68 (vendor: ~$0.068/article, ~47 s each) | ~$1,360 |
| Claude guardrails, selective (~10% of items) | ~$7 per 1,000 total items | ~$136 |
| Qwen self-host (fixed GPU cost) | ~$12–40 | $250–800 |

The Claude number shows why the second pass must be selective, and capped by a daily budget.

### Order
1. **Unblock keys** (nothing else can be validated without them): billing-enabled `GEMINI_API_KEY`
   (free tier is 20 requests/day and already exhausted), and a valid `ANTHROPIC_API_KEY` (`sk-ant-`).
2. **Chunk A (already merged, flag off)**: run the 3 before/after examples, review, then flip
   `GEMINI_NEWS_ENRICHMENT_ENABLED`. Add temperature 0. Watch `ai_confidence` distribution for a week to
   calibrate the 0.80 cutoff.
3. **Chunk B — guardrails second pass, shadow mode first.** Copy `claude-guardrails-service/src` into
   `src/ai/news-analysis/` (it is a library with only a `@nestjs/common` peer dep; do not add its
   package.json or jest config). Add the executor wrapper (`preferredOnly`), an additive `ai_analysis Json?`
   migration, a separate cron that drains the selector (HIGH importance or confidence < threshold),
   sequentially, under a daily budget. Shadow mode writes only `ai_analysis`; a second flag lets
   `toEnrichmentResult()` overwrite the visible columns after a human reviews a sample. Port its spec files
   into our jest setup, skip the schema-file test.
4. **Frontend** is unchanged until Chunk B is out of shadow (news pages read `news` rows). A "two-sided
   factors" view is a separate, later decision.
5. **Sentiment service**: park. No integration work.

### Feature flags (all default OFF)
| Flag | Status | Purpose |
|---|---|---|
| `GEMINI_NEWS_ENRICHMENT_ENABLED` | exists | Gemini first pass; falls back to groq/openai/anthropic chain on any failure. |
| `NEWS_GUARDRAILS_ENABLED` | new | Master switch for the second-pass cron. |
| `NEWS_GUARDRAILS_MODE` = `shadow` \| `write` | new | `shadow` stores `ai_analysis` only; `write` also overwrites visible columns. Default `shadow`. |
| `NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD` | new | Default 0.80 (selector: confidence below, or importance HIGH). |
| `NEWS_GUARDRAILS_DAILY_BUDGET` | new | Max articles/day (hard stop; protects Claude spend). |
| `SENTIMENT_SERVICE_ENABLED`, `SENTIMENT_SERVICE_URL` | not built | Only if the sentiment service is ever adopted. |

### Keys needed (names only)
- `GEMINI_API_KEY` — billing-enabled (Chunk A).
- `ANTHROPIC_API_KEY` — valid `sk-ant-` key (Chunk B; also the last tier of the fallback chain).
- `GROQ_API_KEY` — already working, stays as the base first-pass provider.
- None for the sentiment service (public Qwen weights); hosting account only, if ever adopted.

### Risks
- Silent provider substitution on the guardrail call (fixed by `preferredOnly`).
- 47 s/article blocks any inline use, so it needs a queue/cron.
- Claude spend runaway, mitigated by the budget flag and the ≤10% selector.
- Vendor-reported quality numbers are contract-compliance and AI-pre-label based, not expert-reviewed.
- Thai output quality unverified by a native speaker for both Gemini and Claude paths.
- Advisory-language wording has legal-review overlap with the new `/terms` and `/privacy` work.

## 6. Implementation status (branch `feat/news-guardrails-shadow`, local commits, not pushed)

Built without any provider key; every test uses mocks. All flags default OFF.

| Item | Status |
|---|---|
| Gemini classifier: `temperature: 0` | Done (`gemini-news-classifier.service.ts`, asserted in its spec). |
| 0.80 threshold as config | Done as `NEWS_GUARDRAILS_CONFIDENCE_THRESHOLD` (default 0.80), used by the second-pass selector only. |
| 9-example balanced few-shot | **Held** until the labels get a human review (they are AI pre-labels, `human_reviewed: false`). |
| Guardrails module | Vendored as source into `src/ai/news-analysis/` (see `VENDORED.md`). 126/126 tests pass there, including the schema test. |
| `envelope.schema.json` test | Fixed: the upstream file was never shipped, so a schema was reconstructed from the `SpecEnvelope` interface and lives next to the code; the test now also checks its properties against the envelope keys. |
| Second pass | `NewsGuardrailsSecondPassService` (`src/news/`), separate 10-minute cron, sequential, system-paid only, Claude only via `ClaudeOnlySystemExecutor` (`preferredOnly: true`, model id forced, no path to `executeAiRequest`). |
| Selector / budget | `importance = HIGH` OR `ai_confidence < threshold`, unanalysed, newest first, within `NEWS_GUARDRAILS_MAX_AGE_HOURS`; hard cap `NEWS_GUARDRAILS_DAILY_BUDGET` (default 20/UTC day, counted from stamped rows so restarts cannot reset it); `NEWS_GUARDRAILS_BATCH_SIZE` per tick (default 3). |
| Storage | `market_news.ai_analysis Json?` + `ai_analysis_at Timestamp?`, migration `20260929000000_add_ai_analysis_to_market_news` — **NOT APPLIED**. |
| Provider failure | A thrown provider call persists nothing and stops the tick; the row is retried next tick. A model answer that fails validation twice is persisted as an error envelope so it is not re-selected forever. |

Differences from the plan above:
- **Shadow only.** No `NEWS_GUARDRAILS_MODE=write` and no `toEnrichmentResult()` overwrite were built; nothing user-visible changes.
  Add that only after a human reviews a sample of stored envelopes.
- **`market_news` only**, not `news`: trader rows are economic-calendar events with no article body for the analysis to cite.
- A second column, `ai_analysis_at`, was added next to the JSON one: it is the "analysed" marker and what the daily budget counts.
- The "~10%" is an expected outcome of the selector once the threshold is calibrated, not a separate cap; the daily budget is the hard limit
  (about $1.4/day worst case at the default 20, using the vendor's ~$0.07/article).

To turn it on later: apply the migration, set a valid `ANTHROPIC_API_KEY`, set `NEWS_GUARDRAILS_ENABLED=true`, watch
`market_news.ai_analysis` (its `trace`, `usage`, and `selected_by` fields), and review envelopes before considering write mode.

## 7. Parked: sentiment-service (Qwen2.5-7B + LoRA v8)

Decision: **parked, no integration work.** It only yields the 3-value sentiment every enrichment call already returns, ships no
accuracy numbers, and costs a fixed ~$250–800/month for a GPU host versus ~$0.2–1.2 per 1,000 items on the APIs (§4). No flag,
env var, or code exists for it. Revisit only with a concrete need the APIs do not meet (scale, data residency, offline) and an
evaluation on our own labelled set showing it matches Gemini/Groq.

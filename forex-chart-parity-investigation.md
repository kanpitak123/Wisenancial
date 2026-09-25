# Forex Asset Explorer chart parity — investigation (Phase A)

Date: 2026-09-25 · Read-only investigation, no code changes. Reported bug (from Rem's manual testing): Forex Asset Explorer's candlestick chart is not realtime (last candle doesn't update) and panning left/right doesn't lazy-load older candles. Stock Explorer (`localhost:9000/#/stock/AAPL`) does both correctly and its pan/zoom is confirmed OK — used here only as the reference implementation, not touched.

Standing rule followed: every env var / provider mentioned below is by name only; no `.env` value was read, echoed, or printed. `C:\Users\iamre\OneDrive\Desktop\TradingJournal` was not touched.

---

## 1. Pages/components — fully separate implementations, no sharing today

| | Stock Explorer | Forex Asset Explorer |
|---|---|---|
| Route | `/stock/:symbol` → `StockTerminalPage.vue` (`router/routes.ts:128-130`) → renders `StockAnalysisPage.vue` | `/AssetExplorer` (Trader mode) → `AssetExplorerPage.vue` (`src/pages/trader/AssetExplorerPage.vue`) |
| Chart component | `components/charts/PriceChart.vue` — a real, standalone, prop-driven component with its own emits (`needOlderHistory`) and exposed method (`applyLiveBar`) | **No separate component** — chart is built entirely inline inside `AssetExplorerPage.vue` (`createChart`/`addSeries` calls directly in the page's `<script setup>`, lines 25-57) |
| State/store | Page-local refs in `StockAnalysisPage.vue` (`chartBars`, `olderHistory`, etc.) + `useLivePrice` composable | `AssetStore.ts` (Pinia) — `chartData`, `fetchChartData()` |
| Data service | `stocksService` (`src/services/stocks.service.ts`) hitting `/stocks/...` | `assetService` (`src/services/asset.service.ts`) hitting `/assets/portfolio/:portfolioId/chart` |
| Backend module | `stocks.controller.ts` / `market-data.service.ts` | `assets.controller.ts` / `assets.service.ts` |
| Realtime price source | `useLivePrice` composable → `market.controller.ts` / `market.service.ts` (`/market/quotes/realtime`) | **None** |

**Verdict: zero sharing.** Different page, different chart component (one is a real reusable `.vue` component with a clean prop/emit contract; the other is ad-hoc code embedded in the page), different Pinia/local-state pattern, different backend controller, different service files. This means "fix Forex" today would mean writing a second, parallel copy of everything Stock already has — exactly the situation Phase A's fix-plan ask (item 5) is meant to avoid.

---

## 2. How Stock does it (the reference implementation)

### 2(a) — History lazy-load on pan

**Visible-range subscription** — `PriceChart.vue:242`: `chart.value.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange)`, set up once in `buildChart()` (called `onMounted`), torn down in `destroyChart()` (`:272`, `onBeforeUnmount`).

**Trigger threshold + debounce** — `PriceChart.vue:253-265`:
```ts
const HISTORY_EDGE_THRESHOLD_BARS = 10;
const HISTORY_EDGE_DEBOUNCE_MS = 150;
function handleVisibleLogicalRangeChange(range: LogicalRange | null) {
  if (!range || range.from > HISTORY_EDGE_THRESHOLD_BARS) return;
  if (historyEdgeTimer !== null) clearTimeout(historyEdgeTimer);
  historyEdgeTimer = setTimeout(() => { historyEdgeTimer = null; emit('needOlderHistory'); }, HISTORY_EDGE_DEBOUNCE_MS);
}
```
Fires when the visible range's left edge (`range.from`) gets within 10 bars of the earliest loaded bar; debounced 150ms because the underlying library event fires 50+ times per drag (per the code's own comment). The component only emits an event — it does not decide whether to actually fetch.

**The "load older bars" call** — `StockAnalysisPage.vue:1043-1089` (`onNeedOlderHistory`), listening on `PriceChart`'s `@need-older-history`:
```ts
const response = await api.get<HistoricalDataPoint[]>(
  `/stocks/historical/${selectedSymbol.value}/${selectedTimeframe.value}`,
  { params: { interval: selectedInterval.value, range: selectedRange.value, before: new Date(earliest.time * 1000).toISOString() } },
);
```
`before` = ISO timestamp of the currently-earliest loaded bar.

**Loading guard (prevents overlapping/duplicate fetches)** — `StockAnalysisPage.vue:1030-1047`:
- `loadingOlderHistory` ref — set `true` before the request, reset in `finally`; `onNeedOlderHistory` returns immediately if already `true`.
- `exhaustedHistoryKey` ref, keyed by `` `${symbol}:${timeframe}` `` (`historyRequestKey`, `:1032`) — once a request for that key returns no genuinely-older bars, further calls for the *same* key are skipped without a network call. Reset whenever `historyRequestKey` changes (`:1034-1041`).
- Staleness check after `await`: `if (key !== historyRequestKey.value) return;` (`:1067`) — discards a response that arrives after the user has already switched symbol/timeframe.
- "Exhausted" detection is by **content**, not just emptiness: `hasNewOlderBars = olderPoints.some(p => p.time < earliest.time)` (`:1070`) — a response that's non-empty but entirely overlapping with what's already loaded still correctly marks the key exhausted (`:1072-1077`).

**Dedupe/merge with existing bars**:
- Prepend: `olderHistory.value = [...response.data, ...olderHistory.value]` (`:1079`).
- Combine: `chartBars` computed (`:524-526`) = `toCandlestickData([...olderHistory.value, ...sortedHistory.value])`.
- `toCandlestickData()` (`src/utils/price-chart.ts:79-105`) calls `sortedUniqueByTime()` (`:69-77`), which puts everything in a `Map` keyed by timestamp (last write wins) then sorts ascending — this is the actual dedupe, needed because "Yahoo can return a bar at a time that already exists" (per its own comment) and `lightweight-charts.setData()` throws on duplicate/out-of-order timestamps.
- **Preserving pan/zoom position on prepend** — `PriceChart.vue:310-334`: the `watch(() => props.bars, ...)` handler detects a prepend specifically via `isPrependUpdate(oldBars, newBars)` (`src/utils/price-chart.ts:228-241` — checks that the *tail* of the new array matches the old array element-for-element, not just the last bar, to avoid false positives from daily/weekly bars that happen to share a closing timestamp), then after `series.setData()` it shifts the previously-visible logical range by exactly the number of newly-prepended bars (`:326-330`) so the user's scroll position doesn't jump. A plain symbol/timeframe change instead calls `fitContent()` (`:337-338`), which is the correct behavior there.

**Backend `before` support** — `stocks.controller.ts:175-203` (`GET /stocks/historical/:symbol/:timeframe?interval&range&before`) → `market-data.service.ts:866-916` (`MarketDataService.getHistoricalData`):
```ts
const period2 = before ?? new Date();
const period1 = new Date(period2);
period1.setDate(period1.getDate() - windowDays);
result = await yahooFinance.chart(symbol, { period1, period2, interval: resolvedInterval });
```
When `before` is absent, `period2` is "now" (normal initial load). When present, the whole window slides to end at `before` instead — this is what makes repeated pans keep walking further back instead of re-fetching the same range. An empty result when `before` was supplied is treated as "hit the data provider's history boundary" (e.g. IPO date), not an error (`:894-898`), which is what lets `exhaustedHistoryKey` above correctly stop.

### 2(b) — Realtime updates

**Mechanism: polling, not websocket/SSE.** `src/composables/useLivePrice.ts`:
- `DEFAULT_INTERVAL_MS = 15_000` (`:33`) — `setInterval(() => fetchOnce(), intervalMs)` (`:101-108`).
- Each tick: `GET /market/quotes/realtime?symbols=<SYMBOL>` (`:62-64`).
- Pauses entirely when the tab is hidden (`document.visibilitychange`, `:111-126`) and refreshes immediately on refocus rather than waiting for the next interval tick.
- `requestSeq` counter (`:49,59,67`) discards a response that arrives after a newer request was already issued or after the symbol changed mid-flight.
- Consumed in `StockAnalysisPage.vue:276` (`useLivePrice(selectedSymbol, {...})` → `liveQuote`).

**Applying the tick to the chart without resetting pan/zoom** — `StockAnalysisPage.vue:1103-1129`:
```ts
watch(liveQuote, (quote) => {
  ...
  const merged = mergeLivePrice(lastBar, quote.price);
  if (merged) priceChartRef.value?.applyLiveBar(merged);
});
```
`mergeLivePrice()` (`src/utils/price-chart.ts:171-187`) folds the new price into the *existing* last bar's OHLC (`close` updated, `high`/`low` extended if the tick breached them) rather than fabricating a new bar. `PriceChart.vue`'s exposed `applyLiveBar()` (`:284-302`, `defineExpose` at `:302`) calls `series.update(bar)` — **not** `setData()` — which is the one call in the whole library that updates a series without touching the user's current scroll/zoom state (documented explicitly in the component's own comment at `:281-283`).

**New-trading-day handling** — `isNewerTradingDay()` (`price-chart.ts:195-207`) detects when the live tick belongs to a day with no loaded bar yet (rather than guessing an `open` for a bar that doesn't exist) and triggers a real refetch instead, throttled to once per day via `rolloverRefetchedDay` (`StockAnalysisPage.vue:1092-1119`).

**Backend `/market/quotes/realtime`** — `market.service.ts`:
- Process-wide (not per-user) cache, TTL **12s** (`realtimeTtlMs`, `:68`) — deliberately shorter than the 15s client poll interval so every client sees fresh-enough data, but many clients watching the same symbol still only cost ~5 upstream calls/minute (comment at `:60-65`).
- In-flight request de-duplication (`realtimeInFlight` map, `:74-77, 197-207`) — if the cache expires with many requests landing simultaneously, only one upstream call is made; the rest await the same promise.
- Provider: `new YahooFinance().quote(symbol)` (`:216`) — the **exact same `yahoo-finance2` npm package** already a dependency and already used for chart history (see item 3).

---

## 3. What Forex currently does (and doesn't)

**Chart history**: `AssetStore.fetchChartData()` (`src/stores/AssetStore.ts:136-167`) → `assetService.getChart(portfolioId, symbol, interval)` (`src/services/asset.service.ts:47-...`, sends only `symbol` + `interval`, **no** `before`/`from`/`to` param) → `GET /assets/portfolio/:portfolioId/chart` (`assets.controller.ts:32-45`, accepts only `symbol` + `interval` query params — no `before` param exists in the route signature at all) → `AssetsService.getChartData()` (`assets.service.ts:110-151`):
```ts
const result = await yahooFinance.chart(yahooSymbol, { period1: '2023-01-01', interval });
```
`period1` is a **hardcoded literal date**, not a sliding window — every call for a given symbol/interval returns the identical range regardless of how far the user has already scrolled. `AssetStore.fetchChartData()` then does `this.chartData = data` — a full replace, no concept of "older" vs "newer" bars, no merge, no dedupe-by-timestamp beyond whatever the single Yahoo response already guarantees.

`AssetExplorerPage.vue`'s chart rendering (`updateChartData()`, `:100-106`) calls `candlestickSeries.setData(...)` followed by `chart?.timeScale().fitContent()` on every update — the same "reset the view" pattern Stock deliberately avoids for both lazy-load and live-tick cases.

**Data provider — same as Stock, not a different one.** `AssetsService.getChartData()` calls the identical `yahooFinance.chart()` method from the same `yahoo-finance2` package Stock's `MarketDataService.getHistoricalData()` uses. Forex/crypto/indices symbols are mapped to real Yahoo tickers via `AssetsService.toYahooTraderSymbol()` (`assets.service.ts:554-572`, **private method**): `EUR/USD → EURUSD=X`, `GBP/USD → GBPUSD=X`, `USD/JPY → JPY=X`, `USD/CHF → CHF=X`, `XAU/USD → GC=F` (gold futures), plus crypto (`BTC/USD → BTC-USD`, etc.) and index tickers (`US30 → ^DJI`, etc.).

**Does the provider support a before/endTime-style param?** Yes — proven by Stock's own `MarketDataService.getHistoricalData()` calling the exact same `yahooFinance.chart(symbol, { period1, period2, interval })` signature with a sliding `period2`. Forex's `AssetsService.getChartData()` simply never implemented the windowing — it's a **missing implementation, not a provider limitation.**

**Does the provider offer live/last-tick data for forex?** `MarketService.fetchRealtimeQuote()` calls the generic `yahooFinance.quote(symbol)` — the same call already serving stock realtime prices. Yahoo's quote endpoint is symbol-namespace-agnostic in the same library, so `EURUSD=X`/`GC=F`/`^DJI` etc. very likely resolve through the identical code path with a `regularMarketPrice` field, the same way the chart-history endpoint already successfully serves those tickers today. **This was not verified with a live call in this investigation** (would require an outbound network request, outside a pure read-only code investigation) — flagging it as a high-confidence but unverified assumption for Phase B to confirm with one real test call before relying on it, rather than asserting it as certain.

**Rate limits / cost**: Yahoo's endpoint is the same **free, unofficial, undocumented-rate-limit** API already in use for both stock and forex chart data (per the existing code comments in `useLivePrice.ts:7-10` and `market.service.ts:64-65`, and this session's own memory of "finnhub.io blocked at network level; gpt-4o quota + Anthropic key broken, groq/gemini work" — a separate, unrelated service-status note, not about Yahoo specifically). No hard numeric limit is documented anywhere in this repo for Yahoo; the existing mitigation pattern (process-wide TTL cache + in-flight dedup) is precisely what protects against it today for stocks, and the same pattern would need to protect forex realtime polling too.

**MetaApi cost-model docs** (`docs/mt5-investor-password-spike.md`) exist but are **not relevant here** — they cover the cost of MetaApi's *own brokerage-account connector* (a user's real MT5 trading account: positions, balance, deal history), a completely different use case from sourcing a public forex market price feed for a chart. No MetaApi-cost-model document anywhere in the repo discusses forex market-data pricing.

---

## 4. Precise gap list (Forex vs Stock mechanism)

| Stock mechanism | Forex today | Gap |
|---|---|---|
| `PriceChart.vue` — reusable component with `bars`/`priceLines`/`overlays` props, `needOlderHistory` emit, `applyLiveBar` exposed method | Chart built inline in `AssetExplorerPage.vue`, no reusable component at all | **Missing entirely** — no shared/reusable chart component exists for Forex to adopt without first extracting one |
| `subscribeVisibleLogicalRangeChange` + 10-bar/150ms-debounced edge detection (`PriceChart.vue:242,253-265`) | No time-range subscription anywhere in `AssetExplorerPage.vue` | **Missing** |
| `GET /stocks/historical/:symbol/:timeframe?before=` sliding-window backend (`market-data.service.ts:878-898`) | `GET /assets/portfolio/:portfolioId/chart` has no `before` param; `period1` hardcoded to `'2023-01-01'` (`assets.service.ts:130`) | **Missing** — needs a new query param + windowing logic port, same provider |
| `loadingOlderHistory` + `exhaustedHistoryKey` guards (`StockAnalysisPage.vue:1030-1047`) | No pagination-loading guard of any kind (the existing `generation` staleness guard in `AssetStore.ts` protects against rapid symbol-switching, not overlapping pagination fetches — different problem) | **Missing** |
| Prepend detection + logical-range-shift to preserve scroll position (`PriceChart.vue:310-334`, `isPrependUpdate`) | `updateChartData()` always calls `setData()` + `fitContent()` (`AssetExplorerPage.vue:100-106`) — any future merge would still reset the view | **Missing** |
| Dedupe-by-timestamp merge (`sortedUniqueByTime`, `price-chart.ts:69-77`) | `AssetStore.chartData = data` full replace, no merge/dedupe logic exists to reuse | **Missing** |
| `useLivePrice` polling composable, 15s interval, tab-visibility pause, request-seq guard (`useLivePrice.ts`) | Nothing — `AssetStore` has no polling, no live-quote fetch of any kind | **Missing entirely** |
| `mergeLivePrice()` + `series.update()` via exposed `applyLiveBar` (`price-chart.ts:171-187`, `PriceChart.vue:284-302`) | No incremental update path exists — the chart has never called anything but `setData()` | **Missing entirely** |
| Backend `/market/quotes/realtime` — 12s TTL cache + in-flight dedup (`market.service.ts:55-77`) | Same endpoint exists but is only ever called with stock-style symbols today; untested/unverified against forex-mapped Yahoo tickers | **Untested extension**, not missing infrastructure — the endpoint itself is symbol-agnostic |
| `toYahooTraderSymbol()` forex-ticker mapping | Exists, but is a **private** method on `AssetsService` (`assets.service.ts:554`) | **Needs extraction** to be reusable by `MarketService` for a forex realtime endpoint |
| `handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true }` zoom-drift fix (`PriceChart.vue:236`, commit `a0e8cb6`) | `AssetExplorerPage.vue`'s inline `createChart()` call (`:28-41`) sets no `handleScale` option at all — uses the library default (`mouseWheel: true`) | **Pre-existing, separate bug** — likely already has the same zoom-drift issue Stock had before `a0e8cb6`, independent of the two reported bugs. Not what Rem reported, but directly relevant to item 5's "don't regress this fix" instruction: Forex doesn't have the fix to regress *yet*, but a new shared component must carry it, and it's worth fixing this drift for Forex too while doing the work. |

---

## 5. Proposed fix plan (investigation only — not implemented)

**Preferred approach: extract Stock's logic into shared composables/component, then have both Stock and Forex consume them — not duplicate for Forex.**

1. **Extract `PriceChart.vue` as the shared chart component.** It's already generic (`bars`/`displayType`/`priceLines`/`overlays` props, no stock-specific assumptions in the component itself — `CandlestickPoint` is a plain `{time,open,high,low,close}` shape). `AssetExplorerPage.vue` would replace its inline `createChart`/`addSeries` block with `<PriceChart :bars="..." @need-older-history="..." ref="priceChartRef" />`, inheriting the zoom-drift fix, the lazy-load emit, and the `applyLiveBar` exposed method for free — this directly satisfies "must not regress chart-zoom-drift-fix" since it becomes the same component, same fix, not a reimplementation.
2. **Extract `src/utils/price-chart.ts`'s pure functions as-is** (`toCandlestickData`, `sortedUniqueByTime`, `mergeLivePrice`, `isNewerTradingDay`/`toTradingDay`, `isPrependUpdate`) — these have zero stock-specific logic already; Forex can import them directly, no forking needed.
3. **New composable `useOlderHistory` (or similar), factored out of `StockAnalysisPage.vue`'s `onNeedOlderHistory`/`loadingOlderHistory`/`exhaustedHistoryKey` block** — parameterize the endpoint URL and the request-key so both Stock and a new Forex consumer share the guard logic instead of each page reimplementing loading/exhausted flags by hand. (Today this logic lives inline in the page, not already a composable — extracting it is new refactoring work, not a copy-paste.)
4. **Backend: add `before` query param support to `AssetsService.getChartData()` / `assets.controller.ts`**, porting `MarketDataService.getHistoricalData()`'s exact `period1`/`period2` windowing pattern (`market-data.service.ts:878-898`) — same provider, same library call shape, just needs the same param added to the Trader/Forex path. Small, low-risk, no new dependency.
5. **Extract `AssetsService.toYahooTraderSymbol()` out of its `private` scope** into a shared location (e.g. a small shared util or exported from `AssetsService`) so `MarketService`'s realtime-quote path can map Forex tickers the same way the chart path already does.
6. **Realtime: reuse `useLivePrice` + `/market/quotes/realtime` as-is for Forex**, passing the Yahoo-mapped forex symbol. **This needs one live verification call in Phase B before committing to this plan** — confirm `yahooFinance.quote('EURUSD=X')` (and a couple of the other mapped tickers: `GC=F`, `^DJI`) actually return a usable `regularMarketPrice`, since this was not tested in this read-only investigation. If it works, **no new provider, no new API key, and no paid plan are needed for the realtime piece** — it would ride the exact same free Yahoo integration and the same 12s-TTL/in-flight-dedup cache pattern already protecting the stock realtime endpoint from rate-limit risk.

### 🔴 Explicit flags for the user to decide separately (none of these are implemented or assumed here)

- **No Prisma schema change is anticipated** by this plan — everything above is service/component-layer work on data that's already fetched live from Yahoo, not stored. Flagging only because the instruction asked to check; nothing here requires one.
- **No new data provider is anticipated** — the plan above deliberately reuses the existing Yahoo Finance integration for both history-pagination and realtime, since it already demonstrably serves forex-mapped tickers for chart history today. This is contingent on item 6's verification call succeeding.
- **No new API key is anticipated** for the same reason — `yahoo-finance2` requires no API key today (it's the same unofficial/free client already in `package.json`).
- **If** the verification call in step 6 fails (Yahoo's `quote()` doesn't return usable live forex ticks, or is unreliable/rate-limited specifically for the forex ticker namespace in practice), the fallback options would be: (a) a dedicated forex-quote provider (new dependency + likely a new API key + possibly a paid tier — do not assume free), or (b) MetaApi (already partially integrated for the unrelated MT5-broker-connector spike, but per `docs/mt5-investor-password-spike.md`, MetaApi's pay-as-you-go has **no free tier** and bills from the first call — a real cost decision, not a code decision). **Neither of these is recommended or assumed here** — purely flagging them as the contingency path if step 6's assumption doesn't hold.

### Respecting the existing chart-zoom-drift-fix

Found via `git log --all --grep`: commit `a0e8cb6` ("fix(stocks): stop mouse-wheel zoom drift on the price chart"), part of a 3-commit trail (`9e35f73` lazy-load feature → `97f39b6` backend `before`-cursor support → `a0e8cb6` zoom-drift fix). The fix is `PriceChart.vue:236`'s explicit `handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true }` (overriding the library's default `handleScale: true`, which enables mouse-wheel zoom that conflicts with normal page-scroll wheel events once the chart sits in a scrollable page). No separate doc file named "chart-zoom-drift-fix" exists — the fix lives entirely in that code + its commit message. **Because the fix plan above proposes Forex consume the actual `PriceChart.vue` component rather than a copy, this fix is inherited automatically and cannot be silently dropped** — the only way to regress it would be to fork/duplicate the component instead of sharing it, which is exactly what this plan recommends against.

---

---

## Phase B — implementation (2026-09-25)

Standing credential rule followed throughout — no `.env` value was read/echoed at any point. `C:\Users\iamre\OneDrive\Desktop\TradingJournal` untouched. No schema/migration changes. Nothing committed — everything below is staged as working-tree changes for review.

### Step 0 — working tree hygiene

`HEAD` was still exactly `68ea0d0` (this session's own last commit) — no new commits appeared. `git status`/`git diff --stat` showed the identical pre-existing WIP already catalogued in `Claude outputs/phase1-investigation.md` §6 (MT5 cloud-spike module, dividends tax-summary removal + related mocks changes, `Project_tacflow/`, the two `.bat` launchers) — nothing new, nothing conflicting. None of it overlaps with the files this work touches. Left entirely untouched, no stash needed.

### Step 1 — one-time live provider verification (PASSED)

Using the actual backend Yahoo Finance integration (`yahoo-finance2`, same `new YahooFinance()` instantiation pattern as `assets.service.ts`/`market.service.ts`), via a throwaway script deleted immediately after:

- **(a) Historical window older than 2023-01-01**: requested 2018-01-01..2019-01-01 for both symbols. `EURUSD=X`: **262 bars** returned. `GC=F`: **251 bars** returned. Older bars are genuinely available — confirms the provider was never the limiting factor, only the missing `before` param.
- **(b) Quote freshness**: fetched `EURUSD=X`'s quote twice, 30s apart. Result: **price and timestamp were identical across both calls** (`1.1385632` @ `2026-09-25T07:06:10.000Z` both times), staleness at the second check measured at **0.72 minutes** (~43s) — well under the 15-minute stop-gate bar, and no rate-limit error at any point. Reporting this plainly rather than glossing over it: the two specific samples happening to land on the same underlying tick is consistent with Yahoo's free/unofficial forex feed ticking on a cadence slower than 30s (plausible and unsurprising for a free feed), not evidence of >15min staleness — the literal stop conditions the coordinator defined (no older bars / >15min stale / rate-limit errors) were not met, so this proceeded to Step 2 rather than stopping. No older-bars problem, no staleness-beyond-bar problem, no rate limit.

**Verdict: PASS.** Proceeded to Step 2.

### Step 2 — implementation

**Backend:**
- **`src/market/trader-symbol.util.ts`** (new) — `toYahooTraderSymbol()` extracted out of `AssetsService`'s private method (was chart-only) so `MarketService` can reuse the identical mapping for realtime quotes. `AssetsService.getChartData()` now imports it instead of duplicating it.
- **`src/assets/assets.service.ts`** / **`assets.controller.ts`** — `getChartData()` gained an optional `before?: Date` param, threaded from a new `before` query string on `GET /assets/portfolio/:portfolioId/chart`. No `before` → `period1` stays the exact original hardcoded `'2023-01-01'` (zero behavior change for the default/first-load path). With `before` → `period1`/`period2` slide the same way `MarketDataService.getHistoricalData()` already does for Stock, using a new `CHART_WINDOW_DAYS` map (365/1825/5475 days for 1d/1wk/1mo — Forex has no user-facing "range" picker like Stock does, so a fixed per-interval window stands in for it).
- **`src/market/market.service.ts`** — `fetchRealtimeQuote()` now maps the requested symbol through `toYahooTraderSymbol()` before calling Yahoo (a no-op for real stock tickers), while the **cached/returned `RealtimeQuote.symbol` stays the original app-level symbol** — deliberately surgical so no existing caller matching by requested symbol is affected. **Found and fixed a real bug while testing this**: the shared `round()` hardcodes `.toFixed(2)`, correct for stock USD prices but destructive for forex (`1.138567` → `1.14`, losing all pip-level precision — ticks would visually never appear to move). Fixed with a new `roundTraderPrice()` used **only** for confirmed Trader-symbol prices (magnitude-based: 5 decimals under 10, 3 under 1000, else 2) — the original `round()` is untouched, so stock precision is unaffected (verified — see regression results below).

**Frontend:**
- **`src/pages/trader/AssetExplorerPage.vue`** — inline `createChart`/`addSeries` block **removed entirely**, replaced with `<PriceChart>` (the exact Stock component, not a fork — `git diff --stat` on `PriceChart.vue` shows **zero changes**, confirming nothing was duplicated). Support/resistance lines converted from manual `createPriceLine` calls to `PriceChart`'s existing `priceLines` prop. Wired `@need-older-history`, `applyLiveBar` (via template ref), and the same day-rollover-refetch guard Stock uses (`isNewerTradingDay`/`toTradingDay`, reused as-is from `price-chart.ts`).
- **`src/composables/useOlderHistoryLoader.ts`** (new) — the shared composable, extracted faithfully from `StockAnalysisPage.vue`'s original `onNeedOlderHistory`/`loadingOlderHistory`/`exhaustedHistoryKey` inline logic (same guard semantics, same silent-console.error-only failure handling, same content-based exhaustion check). `StockAnalysisPage.vue` was refactored to consume it too — **both pages now share one implementation**, not two.
- **`src/utils/price-chart.ts`** — `sortedUniqueByTime` exported (was module-private) for the composable to reuse; `PriceBarInput`'s `open`/`high`/`low` widened from `number` to `number | null` (Forex rows can have a null OHLC leg; `isUsableNumber()` already filtered these at runtime, this only makes the type honest — zero behavior change).
- **`src/services/asset.service.ts`** — `getChart()` gained an optional `before?: Date` param, sent as `?before=<ISO>` only when present.
- **`src/utils/forex-market-hours.ts`** (new) — `isForexMarketOpen(date)`, a pure function approximating the standard forex session calendar (open Mon-Thu all day, Sun from 22:00 UTC, Fri until 22:00 UTC; closed Saturday and the rest of Sunday). Explicitly documented as a calendar approximation, not a full market-holiday calendar.
- **Realtime wiring**: `useLivePrice` (unmodified) reused directly in `AssetExplorerPage.vue`, gated by a computed `enabled` ref — `isForexMarketOpen()` re-checked every 60s via a local timer, applied **only** to the actual FX/gold symbols (`EUR/USD`, `GBP/USD`, `USD/JPY`, `USD/CHF`, `XAU/USD`); crypto symbols (`BTC/USD` etc.) are left ungated since crypto trades 24/7, and index symbols (`US30`/`NAS100`/`SPX500`) are also left ungated — indices have their own equity-market-hours calendar, explicitly out of scope per the coordinator's "forex market hours" wording, and leaving them ungated is not a regression (nothing gated them before either). Ticks merge into the last bar via `mergeLivePrice()` + `series.update()` (never `setData()`) — structurally incapable of synthesizing a new/fake candle, since `mergeLivePrice()` only ever mutates the existing last bar.

**Chart-zoom-drift-fix (commit `a0e8cb6`) — confirmed for the Forex path.** Since `AssetExplorerPage.vue` now renders the literal same `PriceChart.vue` component (not a copy), and that component has no prop to override its hardcoded `handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true }`, the fix is structurally inherited — there is no code path left in the Forex page that could regress it, short of forking the component (which this plan deliberately avoided).

### Step 3 — verification

**Backend**: `tsc --noEmit` → 0 errors. `jest` → **604/604 passing** (596 baseline + 8 new: 4 in `assets-chart-before-cursor.spec.ts` covering the `before`/no-`before` param behavior and the Investor-portfolio no-translation case, 4 in `market.forex-symbol.spec.ts` covering the Yahoo-ticker mapping, the stock no-op case, and the pip-precision fix).

**Frontend**: `vue-tsc --noEmit` → 0 errors. `vitest run` → **530/530 passing** (526 baseline + 4 new `forex-market-hours.spec.ts` tests). `quasar build` → **Build succeeded**, 0 ESLint errors. The existing `StockAnalysisPage.spec.ts` lazy-load regression suite (22 tests, unmodified) **passed unchanged against the refactored composable** — direct unit-level confirmation the extraction didn't alter Stock's behavior.

**Live Playwright — Forex (PASSED, clean evidence captured):** `qa/6-forex-chart-parity.mjs`, using the existing `qa/.auth/qa-paid.json` session (no `QA_PASSWORD` read/needed — reused an existing storage state, per the established `qa/` pattern):
- **EURUSD**: panning left fired **5 `before`-parameterized requests**, each returning bars (259-261 per page) strictly older than the previously-loaded range — e.g. requests walked `2021→2020→2019→2018→2017`, every response's `latestBar` at or before the prior page's `earliestBar`. **No duplicate bars past the initial load's earliest timestamp.**
- **XAUUSD**: same pattern, 5 requests, same non-overlapping walk-back confirmed.
- **Zoom-drift interaction**: 8 repeated wheel-scroll cycles on both symbols produced no console/page errors; screenshots captured (`qa/screenshots/6-forex-{EURUSD,XAUUSD}-after-scroll.png`) for visual spot-check. (Noting plainly: this is a no-error + screenshot check, not a pixel-level zoom-measurement — the same rigor the existing `5-asset-explorer-forex.mjs` QA script already uses for chart interaction, and the fix itself is structurally guaranteed by component-reuse as explained above, not by this check alone.)
- **Realtime**: with EURUSD selected, observed **4 polls over 65 seconds** to `/market/quotes/realtime`, all `200`, all returning a valid price (`1.1383`) — confirms the polling mechanism that was previously completely absent now genuinely runs end-to-end against the live app.

**Live Playwright — Stock regression: BLOCKED, not completed.** Mid-script (during the Forex phase's 65-second realtime wait), the QA session's access token expired; by the time the Stock phase ran, **the refresh token itself had also expired** (`POST /auth/refresh → 401 "Refresh Token หมดอายุหรือไม่ถูกต้อง"`, confirmed via a second, standalone attempt). Regenerating the session requires `QA_PASSWORD`, which this session does not have and — per the standing credential rule — will not attempt to obtain. **Compensating evidence in place of the live run**: `PriceChart.vue` and `useLivePrice.ts` (everything Stock's chart rendering and realtime-tick handling depend on) have **zero changes** (confirmed via `git diff --stat`); the only Stock-side file touched, `StockAnalysisPage.vue`, had only its lazy-load-guard block replaced with the shared composable, and its own 22-test regression suite passed unchanged. This is strong but not equivalent to a live browser confirmation.

**To close this out**: run `QA_PASSWORD=... node qa/auth.setup.mjs` (refreshes `qa/.auth/qa-paid.json`), then `node qa/6b-stock-regression-only.mjs` — a short (~40s), already-written, standalone re-run of just the Stock pan/zoom/lazy-load/realtime checks, scoped deliberately short so it can't outlive the access-token window the way the full combined script did.

### Files touched (all uncommitted, staged for review)

Backend: `src/market/trader-symbol.util.ts` (new), `src/assets/assets-chart-before-cursor.spec.ts` (new), `src/market/market.forex-symbol.spec.ts` (new), `src/assets/assets.controller.ts`, `src/assets/assets.service.ts`, `src/market/market.service.ts`.

Frontend: `src/composables/useOlderHistoryLoader.ts` (new), `src/utils/forex-market-hours.ts` (new), `src/utils/forex-market-hours.spec.ts` (new), `qa/6-forex-chart-parity.mjs` (new), `qa/6b-stock-regression-only.mjs` (new), `src/pages/trader/AssetExplorerPage.vue`, `src/pages/investor/StockAnalysisPage.vue`, `src/services/asset.service.ts`, `src/utils/price-chart.ts`.

Nothing committed. Nothing pushed. Waiting for explicit approval before any commit, per instructions.

## Stopping point

Phase B implementation and verification are complete except for the Stock live-Playwright regression, which is blocked on an expired QA session requiring `QA_PASSWORD` (not available to this session). Everything else — Step 1 provider verification, full implementation, backend/frontend lint+typecheck+unit-test regression, and Forex live Playwright verification — passed cleanly.

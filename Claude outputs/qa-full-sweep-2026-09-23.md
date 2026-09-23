# QA Full Sweep — 2026-09-23 (resume after 2026-09-22 crash)

**Round plan:** this round covers Shared + Stock (2.1–2.3). Forex (2.4–2.5) is a separate
round/session by design (to avoid hitting the same usage-limit crash again).

**Reporting policy from this point on:** each topic's result is written to this file
immediately after that topic finishes testing — not batched at the end — so a crash mid-sweep
doesn't lose completed work.

---

## 0. Pre-flight status check (done before resuming any test topic)

- **Dev servers:** both were down (as expected after yesterday's crash). Restarted both:
  - Backend `nest start --watch` on :3000 — compiled clean, `Database Connected!` x2, `Nest application successfully started`. `GET /health` → `200 {"status":"ok","dependencies":{"database":{"status":"up"}}}`.
  - Frontend `quasar dev` on :9000 — up, served at http://localhost:9000/.
- **Playwright:** package `playwright@1.63.0` already in `tradingjournal-frontend/node_modules`. Browser binaries already installed at `~/AppData/Local/ms-playwright/` (chromium-1234, chromium-1243, chromium_headless_shell). No install step needed.
- **`qa-full-sweep-*.md` from yesterday:** **none found anywhere on disk** (checked whole repo, whole home dir). Nothing was ever written to a file before the crash — this is exactly the gap item 3 of the recovery instructions is fixing. There is no partial file to resume from; this file is a fresh start for today's round.
- **Login check — `qafree@wisenancial.test` / `qa@wisenancial.test`:**
  - Both accounts in the Supabase DB were **created 2026-09-22** (yesterday, during the crashed session) — these are NOT the same rows described in the 2026-08-17 memory note; that memory is stale.
  - Tried the memory password (`<QA_PASSWORD>`) against `POST /auth/login` for `qafree@wisenancial.test` → **401 Unauthorized**. So a different password was set yesterday, or registration used a different value.
  - Could not recover the actual plaintext password (bcrypt is one-way). Asked you — you approved resetting both to `<QA_PASSWORD>` (the established QA convention). Done via direct DB update (bcrypt, 12 rounds, matching `AUTH_CONSTANTS.bcryptSaltRounds`).
  - **Verified:** `POST /auth/login` now returns 200 + valid JWT for both `qafree@wisenancial.test` and `qa@wisenancial.test` with password `<QA_PASSWORD>`. Ready to use.
- **Leftover DB data from yesterday (queried, NOT deleted):**
  - `qafree@wisenancial.test` (id 15): tier `null` (free), 0 portfolios, 0 of everything — clean, nothing to preserve as evidence.
  - `qa@wisenancial.test` (id 14): tier `PACK_279`, `ai_token_balance = 5000`, 3 portfolios:
    - `QA Forex Main` (id 15, TRADER, balance 10000) — 2 community posts under it ("QA test post ...").
    - `QA Forex DeleteTest` (id 18, TRADER, balance 5000) — **still exists**; name implies a delete-portfolio test was planned/attempted but the portfolio is still there. Could mean that test wasn't reached, or delete silently failed. Worth checking as part of 2.1/2.3 rather than assuming.
    - `QA Stock Main` (id 17, INVESTOR, balance 15600) — has real trading data:
      - `stock_purchases`: AAPL x2 (10 shares @ $150 each, both still OPEN, created ~2 min apart at 15:04:52 and 15:06:56) — two separate identical-looking buys, not obviously a duplicate-submit artifact (2 min gap), but flagging since it's unusual to buy the same thing twice in a row during a test.
      - `stock_purchases`: MSFT (10 shares @ $300, status CLOSED, fully sold at $160).
      - `stock_sales`: 2 rows against that MSFT lot, 5 shares each @ $160, realized_pnl -700 each, created 15:10:49 and 15:12:02 (~73s apart). Together they account for exactly the 10 shares (remaining_shares correctly at 0) — looks like two legitimate partial-sell actions, not a duplicate-write/500 artifact. No NULL/garbage fields, no orphaned data. **Not** the "sell responded 500 but wrote partial data" scenario you were worried about — nothing here looks half-written.
    - `trades` (Forex journal entries): 0 — Forex round hasn't started yet, consistent with the plan.
  - **Recommendation:** keep all of the above until 2.1–2.3 testing this round is done, in case any of it turns out to be relevant evidence. Nothing found so far looks like a smoking-gun partial-write bug, but the two duplicate AAPL buys and the still-present `QA Forex DeleteTest` portfolio are worth a deliberate look during this round rather than being dismissed.

---

## 1. Topic completion status (ข้อ 2: 2.1–2.5)

User confirmed: no record survives of what was done yesterday — treat 2.1–2.3 as **not started**,
retest all of it fresh. Scope this round: 2.1–2.3, Stock mode only (Forex-mode shared pages deferred
to the Forex round). Primary account `qa@wisenancial.test` (paid), `qafree@wisenancial.test` (free)
for lock-hint/empty-state checks only.

---

## 2. Test results (this round: Shared + Stock, 2.1–2.3)

### Correction: browser automation is Playwright, not Claude in Chrome

Earlier in this round I incorrectly treated "Claude in Chrome not connected" as a hard blocker and
stopped. That tool is a Cowork-only integration, not available in this session — irrelevant here.
The correct tool is the `playwright` package (1.63.0) already installed in
`tradingjournal-frontend/node_modules`, driven directly via plain `.mjs` driver scripts in
`tradingjournal-frontend/qa/` (no `@playwright/test` runner is installed, so these are plain Node
scripts using the `playwright` library API, not `*.spec.ts` test-runner files). Everything below this
line was tested for real, via real headed-browser clicks. Topics marked "ทดสอบไม่ได้" earlier in this
document because of that wrong assumption should be read as **ยังไม่ได้เทสในรอบก่อน** (simply not
reached yet in the earlier partial attempt), not "blocked" — the tooling was never actually unavailable.

### Infrastructure notes for `qa/` scripts (read before writing more)

- **Routing is hash-based** (`quasar.config.ts` → `vueRouterMode: 'hash'`). Every in-app URL must be
  `http://localhost:9000/#/<path>`, not `/​<path>` — the latter silently hits the public landing page
  instead (0 matching selectors, no error). Use `route()` from `qa/helpers.mjs`.
- **`VITE_MOCK_MODE` was `true` in `tradingjournal-frontend/.env.local`** — left on from earlier review
  work (see memory `wisenancial-mock-mode`), and this round's constraints explicitly forbid mock mode.
  Found it because Stock Record showed a "MOCK" badge and fabricated holdings (NVDA/ADVANC/AAPL/KBANK)
  that didn't match the real DB. **Fixed: flipped to `VITE_MOCK_MODE=false` and restarted the frontend
  dev server** (Vite reads this at boot, not hot-reloadable). Confirmed real data loads correctly after
  restart. **If a future session sees a "MOCK" badge anywhere, stop and check this file first.**
- **First visit to any not-yet-compiled route takes 5–20s** (Vite dev lazy-compiles route chunks) — this
  is the same caveat the 2026-09-09 report documented. Don't use a fixed short timeout after navigating;
  poll for the real content selector with a generous timeout (20s+) instead. Not a bug.
- **Access token TTL is 15 minutes.** Re-run `qa/auth.setup.mjs` if more than ~10 min have passed since
  the last login, or scripts will silently 401 and bounce to `/Login`.
- **Quasar `data-test` attributes land directly on the native `<input>`** for `QInput` (fallthrough
  attrs), not on a wrapper — use `input[data-test="..."]`, not `[data-test="..."] input`.
- Login: `page.fill('input[type=email]')` / `input[type=password]` / `button[type=submit]`, no
  data-test on the login form.
- Workspace switch: `switchWorkspace(page, 'Stock' | 'Forex')` in helpers.mjs (clicks `.workspace-option`
  by label text, only clicks if not already active).

### 2.1 Auth

Tested via direct API calls to `POST /auth/login` / `POST /auth/logout` (read-only + logout, no
destructive mutation — went through without classifier issue).

- **ทดสอบแล้วไม่พบปัญหา** — Login, both accounts: `qa@wisenancial.test` and `qafree@wisenancial.test`
  both return `200` + valid JWT with password `<QA_PASSWORD>` (see §0 for the reset).
- **ทดสอบแล้วไม่พบปัญหา** — Logout: `POST /auth/logout` → `200 {"message":"ออกจากระบบเรียบร้อย"}`.
  Confirmed this revokes the refresh-token family (per `refresh-token.service.ts`), not the short-lived
  access token itself — the access token issued at login still worked against `GET /portfolios`
  immediately after logout. This is correct JWT/refresh-token design, **not a bug** (access tokens are
  meant to be stateless and expire on their own ~15 min TTL; logout is supposed to only kill the ability
  to mint new ones via refresh).
- **ยังไม่ได้เทสในรอบก่อน** — "session ต้องไม่หลุดกลางเทส" (session must not drop mid-test) as an
  end-to-end UI behavior (navigating between pages in a real browser session, watching for an
  unexpected forced logout). Not yet explicitly tested, though no unexpected logout was observed during
  the ~20+ min of Playwright-driven navigation done for the priority sell test below (access token
  naturally expired once at the 15-min mark mid-debugging, which is correct behavior, not a drop).

### 🎯 Priority check (done first, per your instruction): does Stock sell still 500?

Tested via `tradingjournal-frontend/qa/1-priority-sell.mjs`, real headed Playwright, real UI clicks,
against `qa@wisenancial.test` / `QA Stock Main` (portfolio 17), the two leftover AAPL lots (purchase id
7 and id 8, both 10 shares @ $150, both OPEN). One partial sell (3 shares) then one full sell (remaining
balance of whichever lot FIFO picked).

- **แก้แล้วจริง (confirmed fixed)** — Stock sell (`POST /investor/portfolios/17/stocks/sell`) returns
  **201**, not 500, for both a partial sell and a full sell. Full request/response bodies saved to
  `tradingjournal-frontend/qa/logs/1-priority-sell.json`. Backend log (`backend-dev.log`) is clean for
  both calls — no stack trace, because there was no error. The 2026-09-09 report's "sell always 500s"
  finding does **not** reproduce today. (No `git log` archaeology done on *why* it's fixed — out of
  scope for a find-and-report round — but the current behavior is verified correct on this build.)
- **พบใหม่ [MEDIUM]** — The per-lot "ขาย" button is misleading: clicking "ขาย" on a specific holdings
  row opens a dialog that *looks* scoped to that lot (shows that lot's remaining shares and purchase
  price as defaults), but the actual `POST .../stocks/sell` payload only carries
  `{stock_symbol, shares_count, sold_price, fees, cost_method, sold_date}` — **no `purchase_id`/lot
  reference at all** (`src/pages/investor/StockRecordPage.vue:472-489`, confirmed against
  `src/services/investor-portfolio.service.ts:16-18`). The backend always allocates across *all* open
  lots of that symbol by `cost_method` (default FIFO by `purchase_date` — logic itself is correct, see
  `tradingjournal-backend/src/stock-transactions/stock-transactions.service.ts:116-128`), regardless of
  which lot's button was clicked.
  - **Repro (observed, not hypothetical):** clicked "ขาย" on purchase id 7 (`purchase_date` 2026-09-22),
    sold 3 shares → backend correctly picked purchase id 8 instead (`purchase_date` 2026-09-20, i.e.
    economically older under FIFO) and left id 7's 10 shares completely untouched. A user who
    deliberately clicks "sell" on a specific lot (e.g. one with its own `target_price`/`stop_loss` they
    were managing) may reasonably expect *that lot* to be reduced, not a different one.
  - **Suggested fix direction (not applied — find/report round only):** either scope the sell action to
    the clicked lot's `purchase_id` on the backend, or make the dialog UI honest about what will actually
    happen (e.g. don't pre-fill from "this lot" specifically, or show which lot(s) will actually be
    debited under the active cost method before submitting).
  - Severity MEDIUM, not HIGH/CRITICAL: money/share math itself stays internally consistent (nothing
    lost or double-counted), it's a UX/expectation mismatch, not a data-integrity bug.
- **ทดสอบแล้วไม่พบปัญหา** — Response-code-vs-toast honesty for sell: both sells' actual behavior matched
  their `201` responses (dialog closed, row updated after reload, no false-success-toast-on-failure
  pattern observed — though this wasn't a failure case, so the "does the error toast match a real error"
  half of this check still needs a case that actually fails, e.g. shares_count > remaining, still open).
- **ทดสอบไม่ได้** — sell validation edge case (attempting to oversell beyond remaining shares) — not
  covered by this priority check, should be picked up under 2.3's fuller Stock Record pass.

### 2.2 หน้า Shared (โหมด Stock)

- **ทดสอบแล้วไม่พบปัญหา** — Portfolio delete, no-activity case: used the leftover `QA Forex DeleteTest`
  portfolio (id 18, 0 trades, confirmed via DB query first) exactly as instructed. `DELETE
  /portfolios/18` → `200 {"message":"ลบพอร์ตสำเร็จ","deleted_id":18}`, and the row is actually gone
  (portfolio no longer appears in `GET /portfolios`). Response code and message match — no false-success
  toast pattern here. `src/portfolios/portfolios.service.ts:327-357` (`remove()`) — confirmed by reading
  the code that it checks `hasPortfolioActivity(id)` first and throws `ConflictException` (409) with a
  real Thai message (`'ไม่สามารถลบพอร์ตที่มีรายการเทรดหรือการลงทุนอยู่'`) before ever deleting, so the
  backend contract for the "has activity" case is structurally sound — but...
- **ทดสอบแล้วไม่พบปัญหา** — Portfolio delete, *with*-activity case. Created a disposable portfolio
  (`QA Disposable Delete-Test 2`, id 20 — never touching the real `QA Stock Main`/`QA Forex Main` data),
  bought 1 AAPL share into it to give it real activity, then attempted delete via the real UI:
  `DELETE /portfolios/20` → **409**, with the real backend message
  `"ไม่สามารถลบพอร์ตที่มีรายการเทรดหรือการลงทุนอยู่"` (cannot delete a portfolio with trades/investments).
  The frontend correctly showed this as a **warning/negative toast with that exact backend message** —
  not a false "success" toast — confirming the user's specific concern (don't trust the toast alone) was
  unfounded here: toast and status code agree. Portfolio correctly remained in the list afterward.
  Cleaned up immediately after (deleted the test purchase, then the now-empty disposable portfolio,
  both `200`) — confirmed via direct DB query that the account is back to exactly its 2 real portfolios
  (`QA Forex Main`, `QA Stock Main`), no leftover test data.
  - **Testing note for future runs:** buying into a *freshly switched-to* portfolio needs an explicit
    wait for that specific portfolio's own `GET /investor/portfolios/:id/dashboard` call to resolve
    before opening the Buy dialog — `store.selectPortfolio()` itself is synchronous, but
    `InvestorPortfolioStore.portfolioId` (which the buy submit guards on) only updates once that
    portfolio's own async `load()` finishes. Skipping this wait caused two earlier attempts in this
    session to silently fail/hang with no request ever firing — not an app bug, the same class of
    "don't trust a visible button as a data-ready signal" lesson documented earlier in this file, just
    a new instance of it (switching portfolios within Stock mode, not switching workspace type).
- **ทดสอบแล้วไม่พบปัญหา** — Dashboard (Stock mode), tested via real Playwright UI against
  `qa@wisenancial.test` / `QA Stock Main`:
  - Portfolio Growth chart renders with real data (`.apexcharts-canvas` present, 2 series paths
    drawn — not empty). Backed by `GET /investor/portfolios/17/dashboard` → `200`, matches commit
    `552a38f` ("load analyticsStore so Portfolio Growth chart isn't empty") actually holding.
  - Hero value (`$20,497.50`) and KPI cards (Total P&L `+$497.50`, Unrealized `+$1,897.50`, Total
    Return `+33.17%`) all read directly from `summary.portfolio_value` /
    `summary.total_pnl`/`unrealized_pnl`/`total_return_percent` in that same API response —
    internally consistent, no separate frontend computation to drift.
  - No Forex-mode bleed: confirmed `Pair Performance`/`Best Pair` (the `v-if="isTrader"` insights
    row, `DashboardPage.vue:1043`) and the Goal card are both absent (count 0) once in Stock mode.
    Confirmed present (count 1 each) when re-checked in Forex mode as a sanity control, so the
    check itself is valid, not just an empty-selector false negative.
  - Cross-checked against Portfolio page (`Current: $20,497.50`, `Net PnL: +$497.50`) — **matches
    Dashboard exactly**, and updates without a manual reload being required (both pages independently
    fetch the same live `investor/portfolios/17/dashboard` summary on mount).
  - ⚠️ **Testing gotcha, not an app bug:** navigating to another page too soon after clicking the
    workspace switch (before its async `clearWorkspace → setActiveType → initializeWorkspace` chain
    settles) causes a page to silently show stale/wrong data with **zero console error** — e.g. the
    Portfolio page briefly showed the Stock portfolio's raw cash balance (`$17,100`) instead of the
    enriched value, purely because I navigated away from the switch too fast in an early test attempt.
    Retested with a proper wait for the workspace switch to fully settle and it was correct. Fixed the
    shared `switchWorkspace()` helper to wait for networkidle after switching so this doesn't cause a
    false positive in later checks — but flagging as a real UX risk worth a deliberate look: a real
    user clicking the toggle and immediately clicking a nav link fast enough could hit the same window.
- **แก้แล้วจริง** — Watchlist "ติดตามเอง" add-stock: previously reported 404. Retested via real UI
  (typed "MSFT" into `StockSymbolPicker`, clicked add) → `POST /watchlist/portfolio/17` → **201**, real
  row created (`{id:1, user_id:14, symbol:"MSFT", ...}`). Console/pageerror log clean — the previously
  reported `TypeError null.trim()` also did not reproduce.
- **พบใหม่ [HIGH] — confirmed systemic, 3 of 3 shared pages checked so far are affected** — every
  shared page checked for this pattern so far (Watchlist, Community, News — 3/3) shows **empty data on
  the first SPA navigation there after switching workspace mid-session**, even though the backend
  genuinely has the data, and **only recovers via a hard page reload**:
  - **Watchlist "ติดตามเอง":** added MSFT (confirmed real row via direct `GET /watchlist/portfolio/17`
    → 200 with the item), then navigated to `/Watchlist` — list shows 0/empty. **No
    `GET /watchlist/portfolio/:id` request is sent at all** — not slow, never fires. A hard reload of
    the already-open page does fetch and display it correctly (0 → 1).
  - **Community feed:** created 2 real posts (confirmed via direct `GET /posts/5` → 200 with content),
    then navigated to `/Community` — 0 posts shown, `filteredPosts.length === 0` empty-state path.
    **No `GET /posts?...` request fires at all.** A hard reload correctly fetches and shows both posts.
  - **News:** first navigation shows **0 news cards**; a hard reload shows **84**. Same exact pattern,
    third page in a row. (Also re-confirms the AI-summary raw-prompt leak from the 2026-09-09 report
    does **not** reproduce — no "Analyze likely impact"/"Do not provide investment instructions" text
    visible anywhere, on either the empty or the correctly-loaded state.)
  - **UPDATE — full sweep done, blast radius is narrower than first feared:** every other shared page
    reached this round was also checked for this pattern in passing (per the coordinator's ask), and all
    came back clean on first navigation, no reload needed: Dashboard, Portfolio, Stock Record, Analytics
    (all 5 tabs), Stock Terminal, Chat, Coach Room (both accounts), Classroom, Broker Connections,
    Upgrade, AI Credits. So the confirmed blast radius is **exactly Watchlist + Community + News**, not
    "most shared pages" as originally feared — still worth fixing (real, high-impact bug on 3 major
    pages), just not as widespread as the initial finding implied.
  - **Ruled out as a timing race, not just an assumption:** re-tested with 6+ second explicit waits
    after both the initial Dashboard load and the workspace switch before navigating — still empty,
    still zero network call. Also re-tested via a **real sidebar-menu click** (not `page.goto()`) for
    both pages — same result both times. So this isn't test-tooling speed or a `goto()` vs. real-click
    artifact; it reproduces with a genuine, unhurried, real-click user flow.
  - The common thread in what's broken vs. not: Watchlist's `load()` (`WatchlistPage.vue:213-215`)
    silently no-ops if `portStore.activePortfolioId` reads null at that instant, and Community's
    `fetchPosts()` reads `usePortfolioStore().activeType` directly at call time (`CommunityStore.ts:73`)
    — both depend on `PortfolioStore`'s reactive `activeType`/`activePortfolioIds` being correct at the
    exact moment their own `onMounted` runs, whereas every clean page's mount logic either reads from
    the already-loaded `portfolios` array without gating on `activeType` freshness, or (Chat/Coach
    Room/Classroom/Broker Connections/Upgrade) doesn't depend on workspace type for its core fetch at
    all. Didn't get to pin News's equivalent line, but the black-box symptom is identical to the other
    two. I could not pin the exact Vue-level mechanism (would need breakpoint debugging, out of scope
    for find/report), but the pattern — and which 3 pages are affected — is solid, repeatable evidence.
  - **Impact:** a user switching into Stock mode and going straight to Watchlist, Community, or News (all
    entirely normal flows) sees their real data as if it doesn't exist, with zero error indication.
  - Severity HIGH: not data loss (a reload fixes the *display*), but a common flow (switch mode → visit
    page) shows real data as empty with no error, on 3 major, frequently-used pages.
- **พบใหม่ [LOW]** — `GET /watchlist/portfolio/:id` fires **3 times** on a single Watchlist page load
  (observed consistently on reload) — redundant, wasteful, not currently harmful (idempotent GET) but
  worth a look at what's triggering three separate loads.
- **ทดสอบแล้วไม่พบปัญหา** — Community: QSelect-then-immediate-type (select an asset in the "Select
  Asset" dropdown, then type into the content textarea with no Escape press first) — typed text landed
  correctly in the textarea (`"QSelect-then-type test post"` in, same value read back), no swallowed
  input, no stuck-menu class residue observed. The dropdown-not-closing bug class this checks for does
  **not** reproduce here.
- **ทดสอบแล้วไม่พบปัญหา** — Community: post creation (`POST /posts` → 201, real row with correct
  `portfolio_id`/`asset_symbol`/`content`), Like (`POST .../like` → 201, count 0→1, **persists correctly
  after reload**, `isLiked: true` confirmed via direct API), Comment (`POST .../comments` → 201, appears
  immediately without reload, **persists correctly after reload** — my first check of this read "does
  not persist" but that was my own test's mistake: the comments panel collapses on reload same as any
  accordion, re-expanding it after reload shows the comment correctly; verified via direct
  `GET /posts/5` too, which returned the comment in full). No bugs found in the actual like/comment data
  path once tested correctly.
- **ทดสอบแล้วไม่พบปัญหา** — Watchlist AI Radar: all 4 categories present with real, distinct data
  (ขาขึ้น/Upside 6, ขาลง/Downside 5, ใกล้เกณฑ์แนะนำ/Near-recommended 9, ไม่แนะนำ/Not-recommended 15),
  no error state, no empty state, no stuck loading. Sector filter on a filterable section (Upside)
  correctly narrowed 6 → 2 items. Horizontal scroll rail present. Clean.
- **ทดสอบแล้วไม่พบปัญหา** — Community public profile page (`/profile/:username`), tested on own account
  (`qa_paid_wisenancial`): `GET /users/profile/qa_paid_wisenancial` → 200, real data shown — own-profile
  banner ("นี่คือโปรไฟล์ของคุณเอง"), correct private-visibility state, correct aggregate totals ($25,850
  total assets, -$1,400 cumulative P/L, 2 portfolios, 3 holdings: AAPL/MSFT/NVDA). Took up to ~15s to
  resolve (same general backend-latency pattern seen elsewhere this round, not the systemic reload-only
  bug — a plain wait was enough here, no reload needed).
- **ทดสอบแล้วไม่พบปัญหา** — Analytics, paid account (`qa@wisenancial.test`, Stock mode): clicked through
  all 5 tabs (Dashboard/Allocation/Timeline/AI Insights/Planning & Tools). Zero HTTP errors (`4xx`/`5xx`)
  across any tab, console/pageerror clean throughout. Allocation correctly shows real data
  (`GET /analytics/portfolio/17/allocation` → `[{"symbol":"AAPL","value":3397.5,"weight":100}]`,
  matches the one open AAPL holding). Each tab's content grew with real data as it loaded (not stuck on
  placeholder/zero values). **Testing note:** a tab can show "Loading analysis data…" for up to ~15s
  after clicking — this is the same late-resolving-Forex-leftover-requests + first-visit-Vite-compile
  pattern documented earlier in this file, not a bug; had to poll instead of using a short fixed wait to
  test this accurately.
- **ทดสอบไม่ได้ — account limitation, not a blocker to fix in code** — Analytics, free account
  (`qafree@wisenancial.test`): this account currently has **0 portfolios of any type** (fresh account,
  never had one created), so it can't reach the AI Insights / Planning & Tools tabs to check the
  paid-tier lock-hint the checklist asks for — attempting the Stock-mode switch correctly shows a
  proper Thai warning ("กรุณาสร้างหรือเลือกพอร์ตลงทุนก่อน") rather than crashing, which is itself a good
  sign (a code comment in `PortfolioStore.ts` previously said this message was written but never
  wired up — it now clearly is). But this account can't stand in for "free-tier user with a portfolio
  who hits a paid-tier feature," which is what the lock-hint check actually needs. **Recommend:** create
  one Stock portfolio for `qafree@wisenancial.test` (a normal, allowed mutation on its own data) before
  the lock-hint check can be done properly — flagging rather than doing it unprompted since it changes
  the account's baseline state for future rounds too.
- **แก้แล้วจริง** — News AI-summary raw-prompt leak (2026-09-09 report: economic-calendar items showed
  the raw AI prompt — "Analyze likely impact...", "Do not provide investment instructions" — as the
  visible summary). Re-checked on the full 84-item feed (after working around the empty-on-first-load
  bug with a reload) — that text does not appear anywhere. Confirmed fixed.
- **ทดสอบแล้วไม่พบปัญหา** — News filter pills: importance pill (84→56 cards) and sentiment pill both
  filter the feed correctly, no errors. "Clear filters" restores the full set.
- **ทดสอบแล้วไม่พบปัญหา** — News search: initially looked broken (searching "stock" or "Fed" both
  returned 0 results), but this was a **test artifact, not a bug** — this news feed's content is
  Forex/macro-topic-heavy and apparently doesn't contain those literal English words. Searching
  "EUR/USD" (a term confirmed present via the Trending sidebar) correctly returned 70/84 matching
  cards. Search itself (`NewsStore.ts:65-96`, client-side substring match across
  title/summary/aiSummary/source/country/sector/relatedSymbols) works correctly.
- **ทดสอบแล้วไม่พบปัญหา** — Pin: clicked pin on an item, persisted correctly after a hard reload
  (confirmed pinned section/state present post-reload).
- **ทดสอบแล้วไม่พบปัญหา** — Live badge ("Live updates"/"อัปเดตเรียลไทม์") is present and visible.
- **ทดสอบแล้วไม่พบปัญหา (as designed)** — Earnings calendar renders correctly empty — this matches a
  documented, intentional stub right in the code (`NewsPage.vue:17`: "backend EarningsCalendarService
  ตอนนี้ยัง return items: [] เสมอ — ยังไม่ implement", i.e. the backend always returns `[]`, not yet
  implemented). Not a bug — the frontend correctly reflects the backend's current (stub) state.
- **สังเกตเห็น แต่ไม่ยืนยันเป็นบั๊ก** — "หุ้นที่ถูกพูดถึงมากที่สุด" (Trending symbols) shows only Forex
  pairs and indices (EUR/USD, GBP/USD, XAU/USD, USD/JPY, BTC/USD, NAS100) even while in **Stock mode** —
  no actual stock tickers appeared in the list. Might be intentional (macro-news trending isn't
  mode-specific) or might be a scoping gap; not investigated deeply enough to call it a confirmed bug,
  flagging for a closer look.
- **ทดสอบแล้วไม่พบปัญหา** — Chat: sent a real message (real-time via socket), correctly appeared in the
  room within the expected few-seconds socket delay (not judged broken prematurely), no console errors.
- **ทดสอบแล้วไม่พบปัญหา** — Coach Room, both accounts: paid (`qa@wisenancial.test`) sees the real coach
  grid (no upgrade notice); free (`qafree@wisenancial.test`) correctly sees the upgrade card instead
  (`data-test="coach-upgrade"` visible, grid absent). The `403 Forbidden` responses
  (`GET /coaches`, `GET /coaches/sessions/mine` → `"ฟีเจอร์นี้ใช้ได้เฉพาะสมาชิกแบบชำระเงิน"`) seen for
  the free account are **expected, correctly-handled** paid-tier gates, not bugs — the frontend catches
  them via `isPaidTierError()` and swaps in the upgrade notice instead of showing a broken page. Not
  affected by the systemic empty-on-first-load pattern (both states rendered correctly on first visit).
- **ทดสอบแล้วไม่พบปัญหา (confirms it's a stub, as the checklist asked)** — Classroom: the lesson list
  itself has real, curated titles/descriptions per lesson (not placeholder text), but expanding any
  lesson (tested "1. What is Forex?") reveals the actual content is still a stub — literally
  "Content is currently being updated…" with a construction icon, for every lesson. Confirmed via the
  real rendered page, not just source-reading. Answers the checklist question directly: **still a stub**,
  not real content, list-level polish aside.
- **ทดสอบแล้วไม่พบปัญหา** — Broker Connections, full lifecycle tested end-to-end via real UI on
  `qa@wisenancial.test`: Create (`POST /brokers/connections` → `201`) → API key banner shown once with a
  real-looking key (`wsb_19c1f8e6...`) → dismissed + hard reload → banner correctly **does not**
  reappear (shown-once semantics hold) → Revoke (`POST .../revoke` → `201`, row updates to show
  REVOKED status) → Delete (`DELETE ...` → `200`) → reload confirms the connection is gone from the
  list (soft-deleted in DB: `status: REVOKED, deleted_at` set, confirmed via direct query). Clean
  console throughout. (One earlier attempt crashed my own test script — I clicked "Revoke" without
  handling the confirmation dialog Quasar's `$q.dialog()` requires, which left a stray un-revoked
  connection; cleaned that up with a follow-up script before this final clean run — mentioning only so
  it's clear the leftover state was my test's mistake, not an app bug, and has been cleaned up.)
- **ทดสอบแล้วไม่พบปัญหา** — Upgrade page: current-plan card correctly highlighted for both accounts
  (paid: "Pro (PACK_279)", quota 2/3; free: "แพ็กเกจฟรี", quota 0/1 with an explanatory hint). Pricing
  matches the comparison table exactly (Free ฿0/1 portfolio, Basic ฿219/2, Pro ฿279/3, Elite ฿399/5). No
  payment submitted, per constraints.
- **ทดสอบแล้วไม่พบปัญหา** — AI Credits page: "เครดิตคงเหลือ" (credits remaining) correctly shows 5,000,
  matching the account's real `ai_token_balance`. Three purchase tiers (Starter ฿99/500, Pro ฿249/1500
  "คุ้มที่สุด", Max ฿499/3500) all internally consistent. No purchase submitted.
- **ทดสอบแล้วไม่พบปัญหา** — AI-generate button (Analytics → AI Insights tab, portfolio advisor card):
  button was enabled (account has holdings + credits), no disabled-reason needed to check that path this
  time, but the reason element (`data-test="ai-advisor-disabled-reason"`) does exist in the component for
  when it's needed — code confirms it always pairs with `disabledReason`, never leaves the user guessing.
  **Fired a real generation** — `POST` → `201`, real AI response returned and rendered on screen: a
  correct, well-formed Thai-language portfolio analysis (diversification score, risk profile
  "AGGRESSIVE", concentration risks correctly listing AAPL/MSFT/NVDA — i.e. genuinely reflects this
  account's actual holdings, not canned text). **Provider fallback chain confirmed working**: response
  reports `"model":"groq-llama3"`, consistent with the known project status (Anthropic/OpenAI keys
  broken, Groq and Gemini work — see memory `wisenancial-external-service-status`) — Groq is being used
  successfully as the working fallback. `creditsCharged: 3` — real, sensible credit deduction. Report
  only, no keys touched.

### 2.3 หน้าเฉพาะโหมด Stock

**Stock sell 500 bug re-test: see the "Priority check" section above (before 2.2)** — confirmed fixed,
both partial and full sell return `201`.

- **ทดสอบแล้วไม่พบปัญหา** — Buy amount→shares auto-calc (`StockRecordPage.vue:198-208`, formula
  `shares = budget / (price * (1 + fee% / 100))`): tested via real UI — price 100 + total_amount 1000 +
  fee 0% → shares field auto-filled to exactly `10`; same inputs + fee 1% → auto-filled to `9.901`. Both
  match the formula exactly. `buy-summary` caption text also correct (`มูลค่าสุทธิ 1,000.00 · ค่าธรรมเนียม
  0.00 USD`).
- **ทดสอบแล้วไม่พบปัญหา** — Buy submission itself: `POST /investor/portfolios/17/stocks/buy` → real
  purchase created and confirmed via direct DB query (`id 10, NVDA, 10 shares @ $100`). Works correctly
  **once the page's own portfolio data has actually finished loading** — see the next finding for why
  that caveat matters.
- **พบใหม่ [HIGH]** — `GET /stocks` (the stock-symbol catalog used by `StockSymbolPicker`'s
  autocomplete dropdown — the same component backs Buy's symbol field, Watchlist's manual-add field,
  and per its own code comment, DCA forms and Stock Terminal's search bar too) **takes ~10.3 seconds to
  resolve** when called for real from the browser (measured precisely via Playwright's
  request/response event timestamps: request fired at open-buy-dialog time, response landed 10297ms
  later, status 200). The same endpoint via a direct `curl` with a real bearer token responded in
  **1.58s** — still not fast, but nowhere near 10s, so most of that latency is specific to the real
  frontend call path, not purely backend compute. Practically: **the autocomplete dropdown never
  appears** for any symbol typed within the first ~10 seconds of opening a dialog that uses it — I
  tested "AAPL", "MSFT", and "NVDA" (all real, valid, already-used-elsewhere symbols) and got zero
  dropdown suggestions every time until I waited the full ~10s. No console error, no failed-request
  event — the request is simply slow, not broken outright. Typing still works as free text (the
  underlying field still updates via `v-model` on every keystroke, independent of the dropdown), so Buy
  and Watchlist-add both still functionally succeed if you type the exact symbol yourself and ignore the
  (never-appearing) suggestions — but the entire point of this component ("ผู้ใช้ไม่ต้องจำ ticker เอง"
  per its own doc comment, i.e. so users don't have to remember tickers) is defeated for any real user
  who waits for suggestions before typing further.
  - Severity HIGH: not a crash, but a core, frequently-used piece of UI (search-with-suggestions, reused
    in ≥4 places) is effectively non-functional at realistic user patience levels. Root cause not fully
    pinned (backend itself isn't instant either — 1.58s for what should be a simple filtered `SELECT` —
    but the extra ~8.7s gap between curl and browser needs backend request-logging or a network
    waterfall to actually localize; out of scope for a find/report pass).
- **พบใหม่ [MEDIUM]** — the "ซื้อหุ้น"/`open-buy` button is enabled and clickable **before** the page's
  own portfolio data (`InvestorPortfolioStore.portfolioId`, set by `StockRecordPage.vue`'s own
  `load()`/`store.load(id)` chain) has finished loading. If a user opens the dialog and submits before
  that resolves, `InvestorPortfolioStore.buy()` throws immediately
  (`this.portfolioId === null` guard, `InvestorPortfolioStore.ts` near the top of `buy()`) **before any
  network request is even attempted**, and the user sees a generic, unhelpful toast
  ("บันทึกการซื้อไม่สำเร็จ" — "save purchase failed") with no explanation that they just need to wait a
  moment. I hit this myself on the very first attempt (submitted right after the "ซื้อหุ้น" button
  became clickable, ~1-2s after page load) and it silently failed this way; waiting for the page's real
  data to finish loading first (confirmed by an existing holdings row being visible) made the exact same
  flow succeed. **Recommend:** disable the buy/sell action buttons (or the whole dialog) until
  `store.portfolioId` is set, with a loading indicator, instead of allowing a doomed submit.
- **ทดสอบแล้วไม่พบปัญหา** — Rapid double-buy-submit, re-run cleanly this time (waited for a real
  holdings row to be visible — i.e. `store.portfolioId` confirmed ready — before opening the dialog,
  avoiding the earlier false failure). Double-clicked `submit-buy` back-to-back (MSFT, 5 shares @ $50):
  only **one** `POST /stocks/buy` request was observed, and direct DB verification confirms exactly one
  row was created (`id 11, 5 shares, $50`) — no duplicate. No double-submit bug.

### Stock Terminal (`/Stocks`, `/stock/:symbol`)

**Note on scope:** the checklist's "search/filter left panel" no longer exists as such — per the page's
own code comment, the left explorer column was fully removed in a refactor; stock selection now happens
via a "popular stocks" card under the chart and a `StockSymbolPicker` search bar in the header. Tested
what's actually there today.

- **ทดสอบแล้วไม่พบปัญหา** — Default-symbol resolution (visiting `/Stocks` with no symbol): correctly
  picks a real symbol (NVDA) and redirects to `/stock/NVDA`, all sub-tab data loads with real API
  responses (`/stocks/analysis`, `/analyst`, `/seasonality`, `/intrinsic-value`, `/historical` all 200).
  Not affected by the systemic empty-on-first-load bug — this page's data flow doesn't depend on
  `activeType`/`activePortfolioId`, unlike Watchlist/Community/News.
- **ทดสอบแล้วไม่พบปัญหา** — All 5 sub-tabs present and each renders distinct, substantial, non-empty
  content: กราฟ (Graph), สรุปบริษัท (Summary, 1563 chars), ข้อมูลการเงิน (Financials, 1273 chars),
  สถิติย้อนหลัง (Seasonality, 789 chars), ภาพรวมตลาด (Market, 1694 chars). None stuck empty/loading.
- **ทดสอบแล้วไม่พบปัญหา** — Symbol switching via the popular-stocks row: clicked a row, URL changed
  (`/stock/NVDA` → `/stock/AAPL`), symbol label changed (NVDA → AAPL), price changed ($229 → $340) —
  no stale-previous-symbol data bleed observed.
- **ทดสอบแล้วไม่พบปัญหา** — ~15s auto-refresh: sampled the "last updated" live-price badge 4× over 18s
  (5s apart) — label advanced from `17:23:23` to `17:23:38` (a 15s jump) partway through, consistent
  with the expected ~15s cadence, not stuck.
- **ทดสอบแล้วไม่พบปัญหา (cross-ref, not a new bug)** — the header search bar also uses
  `StockSymbolPicker`, so it hits the **same already-reported `GET /stocks` ~10s latency bug** (see
  2.3 Stock Record buy findings above) — its dropdown also didn't appear within 12s in this test. Not
  logging this as a separate bug, just confirming the blast radius includes Stock Terminal's search too,
  as expected.
- **ทดสอบไม่ได้ (inconclusive, needs a human look)** — Pan/zoom on the price chart: sent real
  `mouse.down` → `mouse.move` → `mouse.up` (drag) and `mouse.wheel` (zoom) events directly on the chart
  canvas, no console errors resulted, but I have no reliable automated way to confirm the chart's
  *visible* pan/zoom position actually changed (would need either a library-level state check via
  `page.evaluate` reaching into the chart instance, or pixel-diffing screenshots before/after — neither
  attempted this round). Given this was the 2026-09-09 report's headline CRITICAL bug (chart completely
  static, no pan/zoom at all), it deserves a deliberate human-eyes-on-screen check next session rather
  than being marked clean on this inconclusive evidence.
- **ทดสอบไม่ได้ (environment limitation, not a code bug)** — stock logo images fail to load
  (`ERR_NAME_NOT_RESOLVED` on `https://logo.clearbit.com/*`) — this sandboxed test machine can't resolve
  external DNS at all, unrelated to the app. The component already has a graceful fallback (colored
  initials avatar, confirmed rendering), so this is very likely a non-issue in a normal environment with
  internet access — flagging only so it isn't mistaken for a real bug if seen again.
- **ทดสอบแล้วไม่พบปัญหา** — Candle/line toggle buttons and 9 timeframe-group buttons are present and
  clickable; rapidly clicked through 1D/1W/1M/3M/1Y with no console errors and no HTTP failures.
  (Confirmed clickable and error-free, not independently confirmed that each renders visually-distinct
  data — same caveat as pan/zoom above about needing eyes-on-screen for full confidence.)

### CSV export

- **ทดสอบแล้วไม่พบปัญหา** — Holdings export: downloaded real file (`holdings-qa-stock-main-all.csv`),
  content correct — all 3 open lots (MSFT 5@50, NVDA 10@100, AAPL 10@150) with correct shares/price/cost.
- **พบใหม่ [HIGH] — also visible on-screen, not just in the export** — Realized P/L export AND the
  "ประวัติการขาย" (sale history) table on the Stock Record page itself both show **`0` for shares sold
  on every single row**, and the export additionally shows `0` for Gross Amount on every row. Verified
  both ways:
  - CSV (`realized-pnl-qa-stock-main-all.csv`): `"AAPL","หุ้นต่างประเทศ","0","150","0","1050",...`
    (Shares Sold and Gross Amount both `0`) for all 4 real sale rows (two AAPL, two MSFT), while Cost
    Basis/Fees/Realized P/L/Cost Method/Sold Date are all correct.
  - **On-screen**, directly in the app (not just export): the sale-history table's "หุ้น" (shares)
    column literally renders `0` for all 4 rows — confirmed by reading the real rendered table text:
    `AAPL 0 150.00 1,050.00 +0.00 FIFO 23/09/2026` (actual sale was 7 shares), same pattern for the other
    3 rows. Screenshot: `qa/screenshots/2.3-sales-history-bug.png`.
  - **Root cause, precisely pinned:** field-name mismatch between the `InvestorSale` TypeScript type and
    the real backend response. `src/types/investor-portfolio.types.ts:110-112` declares
    `shares_count` / `gross_amount`, but the real API (`GET /investor/portfolios/:id/stocks/sales`,
    confirmed via direct call) returns `shares_sold` / `gross_proceeds` — different names entirely.
    Every place reading `sale.shares_count` or `sale.gross_amount` silently gets `undefined` → coerced
    to `0` by the numeric formatter, with no type error (TypeScript can't catch a type declaration that
    just doesn't match the real runtime payload) and no console warning. Confirmed two call sites hit
    this: `src/pages/investor/StockRecordPage.vue:803` (the visible table) and
    `src/utils/csv-export.ts:95,97` (`buildRealizedPnlCsv`). Fields that happen to share the same name
    in both type and API (`cost_basis`, `fees`, `realized_pnl`, `cost_method`, `sold_date`) all display
    correctly — only the two mismatched names are affected.
  - Severity HIGH (upgraded from an initial MEDIUM export-only read): this is wrong data shown directly
    in the primary UI a user would check after selling stock, not just an edge case in an export
    feature — "Shares Sold: 0" next to a real, non-zero P/L reads as broken/untrustworthy bookkeeping.

---

## 3. Test results — Forex round (2.4–2.5)

**Scope:** Forex/TRADER-mode specific pages (Journal, Active Positions, Goals, Lot Calculator) plus
all Shared pages in Forex mode, plus a deliberate bidirectional re-verification of the Stock round's
HIGH "empty-load after workspace switch" finding. Account setup: `qa@wisenancial.test` already had a
Forex portfolio (`QA Forex Main`, id 15) left over from before this round — reused as-is, its Stock-mode
sibling `QA Stock Main` was not touched. `qafree@wisenancial.test` had 0 portfolios; created 1 Forex
portfolio for it via the real UI (stated before doing it: "creating 1 Forex portfolio for qafree@ via
the New Portfolio dialog, to fill its free quota and test the paid-tier lock-hints") — this doubled as
the create-portfolio + quota-full test. Tooling: same Playwright infra as the Stock round
(`qa/helpers.mjs`, `qa/auth.setup.mjs`), ~8 new topic scripts added to `qa/`. Same rules as before: no
Mock Mode, no real payment, no schema/migration changes, no full API key display, mutations only
against `qa@`/`qafree@`'s own data.

### 2.4 Journal

- **ทดสอบแล้วไม่พบปัญหา** — Add trade (`POST /trades`): 201, all fields (Pair/Type/Result/PnL/Lot
  Size/Open-Close Price/Strategy/Trend/Emotion/Entry Reason/dates) saved correctly, verified via
  response body and a DB read (`tradingjournal-backend` read-only check).
- **ทดสอบแล้วไม่พบปัญหา** — QSelect race check (select Strategy, then immediately — no Escape, no
  wait — click+type into the PnL input): text landed correctly in the PnL field every time
  (`qa/2.4-journal.mjs`, `qselectRaceCheck.landedCorrectly: true`). The dropdown-swallows-input bug
  class flagged in the pre-existing 2026-09-09 report does **not** reproduce on this dialog's Selects
  (they're non-searchable `q-select` without `use-input`, so there's no text field inside the popup to
  race against).
- **ทดสอบแล้วไม่พบปัญหา** — Double-submit (two rapid `dispatchEvent('click')` calls on "Save Trade"
  with no wait between them): responses were `[201, 400]` across 3 separate test runs — **exactly one**
  trade row was created each time (confirmed via DB: each run added exactly 1 new GBP/USD row, never
  2), so whatever caused the second click's 400 did not create a duplicate write. Good behavior.
- **ทดสอบแล้วไม่พบปัญหา** — Edit trade (note field): `PATCH` → 200, note persisted after a hard reload.
- **พบใหม่ [MEDIUM]** — Delete trade is effectively non-functional for the vast majority of real
  trades, with a misleading error message and no upfront UI indication.
  - Repro: click the delete (🗑) icon on any trade row in Journal → confirm in the "Delete Trade"
    dialog → for any **closed** trade (WIN/LOSS), always fails.
  - Root cause: `tradingjournal-backend/src/trades/trades.service.ts:626-633` — `remove()` throws
    `BadRequestException('ไม่สามารถลบออเดอร์ที่ปิดแล้ว เพราะมี Cash Record เชื่อมอยู่')` for **any**
    trade whose `result_status !== 'OPEN'`, unconditionally — it never actually checks for a linked
    Cash Record despite what the message claims. Since the Journal "New Trade" dialog can only create
    already-closed trades (`addTrade()` always sets WIN/LOSS), and CSV imports are always closed too,
    delete is only ever possible for a trade that's still OPEN (i.e. only reachable from Active
    Positions before it's closed) — meaning every trade a user manually logs via "New Trade" or CSV
    import can never be deleted from Journal, with no visual cue (the delete icon looks identical and
    enabled on every row) until they click it and get a 400.
  - Compounding UX issue: `JournalPage.vue`'s `submitDelete()` catch block
    (`tradingjournal-frontend/src/pages/trader/JournalPage.vue:396-401`) shows a hardcoded generic
    "Deletion failed" toast and discards the specific backend reason — unlike `submitEditTrade()`'s
    catch a few lines above it, which correctly surfaces `store.error`. So the user never even sees the
    (admittedly still misleading) "Cash Record" explanation; they just see "Deletion failed" with no
    reason.
  - Evidence: `DELETE /trades/4 -> 400 {"message":"ไม่สามารถลบออเดอร์ที่ปิดแล้ว เพราะมี Cash Record
    เชื่อมอยู่","error":"Bad Request","statusCode":400}` (`qa/logs/2.4-journal.json`); row count
    confirmed unchanged before/after (6 → 6) via reload.
- **ทดสอบแล้วไม่พบปัญหา** — CSV import, well-formed file (`qa/fixtures/good-trades.csv`, 2 rows,
  columns `ticket,symbol,type,lots,open_price,close_price,profit,open_time,close_time`): both rows
  imported correctly (`source: IMPORT`, correct `ticket_id`/symbol/pnl per row), confirmed via DB and
  a post-reload row count match. (My test script's own response-URL matcher was wrong — the real
  endpoint is `POST /trades/portfolio/:id/import`, not `/trades/import` — so the script logged
  `NO_RESPONSE_CAUGHT` for status; this is a test-script gap, not an app bug, and doesn't affect the
  conclusion since the DB and UI both confirm the import succeeded.)
- **ทดสอบแล้วไม่พบปัญหา** — CSV import, malformed file (`qa/fixtures/bad-trades.csv`, garbage/broken
  CSV content): correctly rejected — `POST /trades/portfolio/15/import -> 400
  {"message":"รูปแบบไฟล์ CSV ไม่ถูกต้อง หรือไฟล์เสียหาย"...}`, dialog stayed open so the user could
  retry, no partial/garbage rows written (`trades-import.service.ts:120-134` catches the parse error
  before any DB write starts).
- Dark mode: screenshotted (`qa/screenshots/2.4-journal-list-dark.png`) — renders correctly, no
  contrast/layout issues spotted.

### 2.4 Active Positions

- **ทดสอบแล้วไม่พบปัญหา** — Open new position ("Execute Trade", `POST /trades`): 201,
  `result_status: OPEN`, all fields correct (XAU/USD, BUY, 0.25 lot, entry 3300). Appeared in the
  Active Positions table after reload.
- **ทดสอบแล้วไม่พบปัญหา** — Close position ("Close & Move to Journal"): 200, correct PnL — entry
  3300 → exit 3320, volume 0.25, contract_size 1 ⇒ `price_difference(20) × volume(0.25) ×
  contract_size(1) = 5.00`, matches the returned `pnl: "5"` exactly. Position correctly disappeared
  from Active Positions and appeared in Journal after the move, confirmed via both endpoints and a
  page reload.
- Dark mode: screenshotted, no issues.

### 2.4 Goals

- **ทดสอบแล้วไม่พบปัญหา** — Set monthly target ($1000): `POST/PUT .../goals` → 201, persisted after a
  hard reload. Progress bar, Achieved/Target/Remaining figures are internally consistent (e.g.
  Achieved $756.35 + Remaining $243.65 = Target $1000.00 exactly; 75.6% progress = 756.35/1000).
- **ทดสอบไม่ได้** — Prev/next month navigation: attempted via the chevron icon buttons, but my
  selector (`[icon="chevron_left"]`, an attribute that Quasar doesn't actually render onto the DOM)
  never matched, so this specific interaction wasn't actually exercised this round despite my script
  reporting a (wrong, unchanged) label back. Screenshot confirms the rest of the page — including a
  bonus "Daily Trading Plan" calendar breakdown not in the original checklist — renders correctly with
  real, consistent data. Needs a follow-up pass with a correct selector, not flagged as a bug.
- Dark mode: screenshotted, no issues.

### 2.4 Lot Calculator

- **ทดสอบแล้วไม่พบปัญหา** — Fully hand-verified against the page's own formula
  (`src/pages/trader/LotCalculatorPage.vue:39-107`), pure client-side, no API calls. Defaults (XAU/USD,
  balance $1000, risk 1%, RR 2, price 3300, TP 3320, SL 3290): risk amount `1000×1%=10.00` ✓, reward
  `10×2=20.00` ✓, SL distance `|3300−3290|=10` ✓, TP distance `|3320−3300|=20` ✓, RR `20/10=1:2.00` ✓,
  recommended lot `10/(10×100)=0.01` ✓, tier lots `[0.01, 0.01, 0.01, 0.02]` ✓ (matches `Math.round`
  half-up behavior exactly). Re-verified after changing risk to 2%: risk amount `20.00` ✓, recommended
  lot `0.02` ✓, tiers `[0.01, 0.02, 0.02, 0.03]` ✓. Every displayed number matched the hand calculation
  exactly, both before and after changing an input. Dark mode: screenshotted, no issues.

### 2.5 Shared pages in Forex mode

- **ทดสอบแล้วไม่พบปัญหา** — Dashboard: FOREX badge shown, correct mode-specific content, light+dark
  screenshotted.
- **ทดสอบแล้วไม่พบปัญหา** — Portfolio: shows `QA Forex Main` correctly in Forex mode.
- **ทดสอบแล้วไม่พบปัญหา** — Analytics Forex-mode tabs (Monthly Growth, Performance, Win Rate, PnL
  Charts): all render without console errors, screenshotted individually.
- **ทดสอบแล้วไม่พบปัญหา** — Watchlist in Forex mode: only the manual "ติดตามเอง" section renders (0
  radar sections, matches `isInvestor`-gated template at `WatchlistPage.vue:324`), and **zero**
  requests to `/stocks/radar` were observed while in Forex mode across the entire test run — confirmed
  via a request listener, not just visual inspection.
- **ทดสอบแล้วไม่พบปัญหา** — Community feed correctly mode-filters server-side
  (`GET /posts?portfolio_type=TRADER` in Forex mode vs `...=INVESTOR` in Stock mode) — no Stock-mode
  content (AAPL/MSFT/NVDA etc.) ever appeared while in Forex mode, and vice versa. Real Forex posts
  (2, from 2026-09-22) correctly appear once the request resolves (see latency note below).
- **ทดสอบแล้วไม่พบปัญหา** — News: loads without console errors in Forex mode.
- Free-tier lock-hints (`qafree@wisenancial.test`, using its newly-created Forex portfolio):
  - **ทดสอบแล้วไม่พบปัญหา** — Coach Room: backend correctly 403s (`"ฟีเจอร์นี้ใช้ได้เฉพาะสมาชิกแบบชำระเงิน"`),
    frontend correctly shows the `data-test="coach-upgrade"` lock-hint card. Clean, no blank page,
    no console-only failure.
  - **ทดสอบแล้วไม่พบปัญหา (แต่ช้า)** — Analytics "Performance" tab (behavioral/strategy/emotion, paid-
    tier gated): backend correctly 403s (`GET /analytics/portfolio/:id/behavioral`), and the frontend
    **does** show the correct `data-test="analytics-behavioral-upgrade"` lock-hint card — but only
    after a ~5 second "Loading analysis data…" spinner, because the whole Performance-tab section
    (including the upgrade card) is gated behind `!store.isLoadingDetails`
    (`AnalyticsPage.vue:1270`), and `loadDetails()` uses `Promise.allSettled` across 3 endpoints — the
    slowest of which (`monthly-growth`/`win-rate`, not the 403'd `behavioral` call itself) is what the
    UI is actually waiting on. Initially miscounted as "lock-hint never shows" in a first-pass test
    that only waited 2.5s; a follow-up with longer polling confirmed it reliably appears at ~5s. Not a
    correctness bug, but see the latency finding below — a first-time free-tier user could plausibly
    think the page is broken during that wait.
- Quota-full behavior (`qafree@`, Portfolio page): **ทดสอบแล้วไม่พบปัญหา** — before: `0/1 พอร์ต`,
  "New Portfolio" card visible; created 1 Forex portfolio via the real dialog → 201 → after: `1/1
  พอร์ต (Stock 0 · Forex 1)`, "New Portfolio" card correctly hidden, `quota-full-note` correctly shown.
  Free tier's real portfolio quota is **1 total** (not per-mode) — confirmed from the live UI/API, not
  assumed.

### Cross-mode re-verification: the Stock round's HIGH "empty-load after workspace switch" bug

Re-tested deliberately in **both directions** (Stock→Forex and Forex→Stock) plus 4 rapid consecutive
switches, for Watchlist, Community, and News, each checked at a short (~1.5s, matching the original
repro window) and a long (~10s) wait after landing on the page, then again after a hard reload
(`qa/2.5-crossmode-reverify.mjs` + a follow-up focused debug script).

- **ไม่พบปัญหาอีกแล้ว [downgrades/reclassifies the Stock-round HIGH finding]** — In every condition
  tested this round (both directions, rapid switching), the page **did** eventually show the correct,
  fresh, mode-appropriate data with no manual reload needed — confirmed visually via screenshots (e.g.
  `2.5-crossmode-f2s-watchlist-short.png` shows fully-populated Stock-mode radar sections at 1.5s post-
  switch; `2.5-crossmode-s2f-watchlist-short.png` and the rapid-switch screenshot both show a correct,
  clean, empty Forex watchlist with the right purple "Forex" badge). No stale cross-mode data was ever
  observed on screen.
- **However — the real root cause looks like it's latency, not a missing refetch**, and this is a more
  precise/corrected diagnosis of the original finding: `GET /posts?portfolio_type=INVESTOR` was
  directly measured taking **13.7 seconds** to respond in the real browser
  (`t=1790173546915→1790173560632`, see evidence below), and `GET /posts?portfolio_type=TRADER` took
  ~4.8s in a separate measurement. My first attempt at this specific re-check this round used only a
  1.5s post-switch wait and read a Community post count of 0 — which would have been logged as
  "empty/stale, bug reproduced" had I not gone back with a longer poll and discovered the count becomes
  correct (2) at the 14-second mark, with **no console error at any point** during the wait (matching
  the original report's "no console error" observation exactly). This strongly suggests the original
  Stock-round finding was the same phenomenon, observed with a wait that — reasonably at the time —
  wasn't long enough to distinguish "still loading" from "never going to load."
  - Evidence: `qa/2.5-crossmode-reverify.mjs` output — every `_long` (10s) snapshot across both
    directions and the rapid-switch test shows correct final content; a focused follow-up check
    (`debug-community-stock`, not kept — throwaway) captured the exact request timeline:
    `REQ GET /posts?portfolio_type=INVESTOR` at t=546915, `RES 200` at t=560632 (13.7s later),
    `postCardCount` flips from 0 to 2 at the 14s poll mark, holds steady through 20s.
- See the new HIGH latency finding immediately below — this reclassification is the main reason it's
  rated HIGH rather than simply "confirmed fixed."

### พบใหม่ [HIGH] — Severe, inconsistent backend response latency across multiple endpoints in the real browser

- Observed directly this round on at least 4 distinct endpoints, each measured via real
  `page.on('response')` timestamps (not assumption): `GET /posts?portfolio_type=INVESTOR` **13.7s**,
  `GET /posts?portfolio_type=TRADER` **~4.8s**, `GET /analytics/portfolio/:id/behavioral` +
  `monthly-growth` + `win-rate` trio together **~5s** before the free-tier lock-hint can render, and
  `GET /analytics/portfolio/:id/daily-pnl`/`performance`/`overview` were each observed firing **3-6
  times redundantly** within a single page load before those slower calls even started
  (`qa/2.5-forex-shared-pages.mjs`, `2.5-qafree-setup-locks.mjs` logs). This is the same class of
  problem as the Stock round's confirmed HIGH finding (`GET /stocks` ~10.3s in-browser vs 1.58s via
  curl) — now shown to affect Journal/Community/Analytics endpoints too, not just the stock
  autocomplete.
- Impact: nearly every page transition in this app currently shows a multi-second (sometimes 10+
  second) loading spinner in a real browser session, which (a) reads as "broken/stuck" to a user long
  before it resolves, and (b) was almost certainly the actual root cause of the Stock round's "empty-
  load after workspace switch" finding rather than a missing-refetch bug, per the re-verification
  above.
- Root cause **not** investigated in depth this round (out of scope for find-and-report), but the
  repeated redundant calls to the same Analytics endpoints (3-6× for `daily-pnl`/`performance`/
  `overview` within seconds of each other) point at multiple Vue watchers overlapping/re-triggering
  data loads unnecessarily on `AnalyticsPage.vue`, which would compound with any genuine backend-side
  slowness (Prisma connection pool contention, NestJS request queueing, or simply `nest start --watch`
  dev-mode overhead under this session's sustained real-browser load). Recommend a dedicated
  performance-focused pass before the next QA round, since it's now affecting correctness-adjacent
  conclusions (see reclassification above).

---

## Final round summary — 2.1–2.5 complete (Stock + Forex, both rounds)

This covers the full sweep across two sessions: 2.1–2.3 (Auth, Shared pages in Stock mode,
Stock-specific pages) and 2.4–2.5 (Forex-specific pages, Shared pages in Forex mode, bidirectional
cross-mode re-verification). Nothing left in ข้อ 2 scope — both rounds complete.

### แก้แล้วจริง (confirmed fixed) — 3

1. **Stock sell 500 bug** (2026-09-09 report) — partial and full sell both return `201` now.
2. **Watchlist "ติดตามเอง" add-stock 404 bug** — now `201`, clean console, no `TypeError null.trim()`.
3. **News AI-summary raw-prompt leak** — the raw AI prompt text no longer appears anywhere in the feed.

### ยังพังอยู่ (still broken, re-confirmed from prior reports) — 0

Nothing from the 2026-09-09 report re-tested across either round is still broken — both re-tested items
(sell 500, watchlist 404) came back fixed. (Pan/zoom, that report's headline CRITICAL finding, was
*attempted* but the result is inconclusive, not confirmed either way — see "ทดสอบไม่ได้" below.)

### พบใหม่ (newly found across both rounds), most severe first — 6 confirmed + 1 unconfirmed

1. **[HIGH, systemic]** Severe, inconsistent backend/API latency in the real browser, observed on at
   least 5 distinct endpoints across both rounds: `GET /stocks` **~10.3s** (vs 1.58s via curl),
   `GET /posts?portfolio_type=INVESTOR` **13.7s**, `GET /posts?portfolio_type=TRADER` **~4.8s**,
   `GET /analytics/.../behavioral+monthly-growth+win-rate` **~5s** together, plus
   `GET /analytics/.../daily-pnl`/`performance`/`overview` firing **3-6× redundantly** on a single
   Analytics page load. **This finding merges and supersedes what the Stock round reported as a
   separate "Watchlist/Community/News show empty data after workspace switch, no refetch" HIGH bug** —
   this round's deliberate bidirectional + rapid-switch re-verification (`qa/2.5-crossmode-reverify.mjs`)
   found the data **always** arrives correctly with no reload needed, just slowly (up to 14s), with no
   console error at any point — matching the original report's symptoms exactly once latency is
   accounted for. Nearly every page transition currently shows a multi-second loading spinner that reads
   as "broken" long before it resolves; this is now the single highest-priority item to investigate, since
   it's the root cause behind at least 2 of the findings below and both this round's Analytics lock-hint
   and last round's cross-mode "bug" turned out to be symptoms of it, not separate defects. Root cause not
   investigated (out of scope for find-and-report) — candidates worth checking first: Prisma connection
   pool contention, NestJS request queueing under this session's sustained load, redundant Vue watchers
   double/triple-firing the same Analytics fetch, or `nest start --watch` dev-mode overhead.
2. **[HIGH]** Realized P/L: both the **on-screen** "ประวัติการขาย" (sale history) table on Stock Record
   *and* the Realized P/L CSV export show **`0` for Shares Sold on every row** (export also shows `0`
   for Gross Amount). Root cause precisely pinned: the `InvestorSale` TypeScript type
   (`src/types/investor-portfolio.types.ts:110-112`) declares `shares_count`/`gross_amount`, but the
   real backend response uses `shares_sold`/`gross_proceeds` — a plain field-name mismatch that
   TypeScript can't catch (it only validates against the declared type, not the real runtime payload).
   Two confirmed call sites: `StockRecordPage.vue:803` (visible table) and `csv-export.ts:95,97`
   (`buildRealizedPnlCsv`). Fields that happen to share the same name in both places (cost basis, fees,
   realized P/L, cost method, sold date) all display correctly — only the two mismatched names break.
3. **[MEDIUM]** The per-lot "ขาย" (sell) button on Stock Record is misleading: it opens a dialog that
   looks scoped to that specific holdings row, but the backend always allocates across *all* open lots
   of that symbol by cost-method (FIFO/LIFO/AVERAGE), ignoring which lot's button was actually clicked.
   Reproduced directly (clicked sell on the newer-`purchase_date` lot, backend correctly-per-FIFO
   debited the older lot instead, leaving the clicked lot's shares completely untouched). Money/share
   math itself stays internally consistent — this is a UX/expectation mismatch, not a data-integrity bug.
4. **[MEDIUM]** Buy/sell action buttons on Stock Record are enabled and clickable before the page's own
   portfolio data (`InvestorPortfolioStore.portfolioId`) has finished loading. An early submit throws
   before any network request is attempted and shows a generic, unhelpful "save failed" toast with no
   indication to just wait a moment. Reproduced directly on a fresh page load and again when switching
   to a different portfolio; waiting for real data to visibly appear first made the identical flow
   succeed both times.
5. **[MEDIUM]** Journal "Delete Trade" is effectively non-functional for the vast majority of real
   trades, with no upfront UI indication and a misleading error message. Root cause:
   `trades.service.ts:626-633`'s `remove()` unconditionally blocks deleting any trade whose
   `result_status !== 'OPEN'`, claiming (inaccurately — it never actually checks) that a "Cash Record"
   is linked. Since Journal's "New Trade" dialog and CSV import can only ever create already-closed
   trades, delete only works for a trade still in its OPEN state (reachable solely via Active Positions
   before closing) — meaning every manually-logged or imported trade in Journal can never be deleted,
   with the delete icon showing identically enabled on every row regardless. Compounding it,
   `JournalPage.vue`'s delete catch block shows a hardcoded generic "Deletion failed" toast instead of
   the specific backend reason (unlike the edit-trade catch a few lines above it, which does the right
   thing) — so the user doesn't even get the (still-misleading) explanation.
6. **[LOW]** `GET /watchlist/portfolio/:id` fires 3× redundantly on a single Watchlist page load
   (idempotent GET, so not harmful today, just wasteful) — likely the same class of redundant-watcher
   issue as finding #1's Analytics duplicate calls.
7. **[unconfirmed observation]** News's "หุ้นที่ถูกพูดถึงมากที่สุด" (Trending symbols) shows only Forex
   pairs/indices (EUR/USD, GBP/USD, XAU/USD, USD/JPY, BTC/USD, NAS100) even while in Stock mode — no
   stock tickers appeared. Might be intentional (macro-news trending isn't mode-specific) or might be a
   scoping gap; not investigated deeply enough to call it a confirmed bug. Not re-checked in the Forex
   round (would need the reverse check — does it show stock tickers while in Forex mode? — to fully
   characterize).

### ผ่าน (tested, no issue found) — everything else covered across both rounds

**Stock round (2.1–2.3):** Auth login (both accounts) and logout; Portfolio delete both no-activity (200,
correctly removed) and with-activity (409, real backend message, no false-success toast); Dashboard
(Stock mode — chart, KPIs, no Forex bleed); Watchlist add-stock and AI Radar (all 4 categories + sector
filter); Community (QSelect-then-type, post creation, like, comment, public profile page); Analytics paid
account (all 5 tabs, zero HTTP errors); News (filter pills, search, pin, live badge, earnings calendar);
Chat (real message send/receive with socket delay); Coach Room (both accounts correctly gated); Classroom
(confirmed still a content stub, as expected); Broker Connections (full lifecycle: create → API key shown
once → revoke → delete); Upgrade and AI Credits (pricing/tier display correct, no payment submitted);
AI-generate (real generation, correct AI output, provider fallback to Groq confirmed, sensible credit
deduction); Buy amount→shares auto-calc; Buy submission; rapid double-buy-submit (no duplicate row); Stock
Terminal (default symbol resolution, all 5 sub-tabs, symbol switching, ~15s auto-refresh, chart toggle
buttons); CSV holdings export.

**Forex round (2.4–2.5):** Journal add-trade (all fields, QSelect race check clean), double-submit
(no duplicate write across 3 runs), edit-trade, CSV import (both well-formed and malformed files handled
correctly); Active Positions open→close full lifecycle (PnL calculation hand-verified correct); Goals
save/persist/progress-bar math (internally consistent); Lot Calculator (every displayed number hand-
verified against its own formula, both at defaults and after changing an input); Dashboard/Portfolio in
Forex mode (correct badge, correct data, no Stock bleed); Analytics Forex-mode tabs (Monthly Growth,
Performance, Win Rate, PnL Charts — all render clean); Watchlist in Forex mode (manual-only, confirmed
**zero** `/stocks/radar` calls via request listener); Community feed mode-filtering (server-side
`portfolio_type` param, no cross-mode content leak in either direction); News in Forex mode; Coach Room
free-tier lock-hint (clean 403 → clear upgrade card); Analytics behavioral-tab free-tier lock-hint
(correct once the ~5s load completes — see latency finding); portfolio quota-full behavior for free tier
(1 portfolio total, create button + card correctly hidden, quota-full note shown); cross-mode data
correctness in both directions and under rapid switching (always eventually correct, see latency finding
for the "eventually" part).

### ทดสอบไม่ได้ (not reached / inconclusive) — small, specific remainder

- **Pan/zoom on the Stock Terminal price chart** — real mouse drag/wheel events sent, no console errors,
  but no reliable automated way to confirm the chart's *visible* position actually changed. This was the
  2026-09-09 report's headline CRITICAL finding — still unresolved status, deserves a deliberate
  human-eyes-on-screen check rather than being assumed fixed either way.
- Candle/line toggle and timeframe buttons on Stock Terminal — confirmed clickable and error-free, not
  independently confirmed each renders visually-distinct data (same "needs eyes on screen" caveat).
- Stock logo images fail (`ERR_NAME_NOT_RESOLVED` on `logo.clearbit.com`) — this sandboxed machine has no
  external DNS resolution; environment limitation, not a code bug (graceful initials fallback confirmed).
- Sell validation edge case (attempting to oversell beyond remaining shares) — not covered either round.
- Goals prev/next month navigation — attempted with a selector that doesn't actually match Quasar's
  rendered DOM (`[icon="chevron_left"]` isn't a real attribute), so this specific interaction wasn't
  genuinely exercised; the rest of the Goals page (target save, progress math, calendar breakdown) tested
  clean. Needs a follow-up pass with a correct selector.
- "Session must not drop mid-test" — no unexpected drop was observed across several hours of combined
  Playwright navigation over both rounds, but it was never a dedicated, deliberate test of its own.
- News trending-symbols scoping (see unconfirmed observation #7 above) — only checked in one direction.

### Data state at end of both rounds

- `qa@wisenancial.test` / `QA Stock Main` (portfolio 17): original AAPL/MSFT lots plus test activity from
  the Stock round (an NVDA buy, an additional MSFT buy, additional sells) — all real, intentional, nothing
  orphaned. One manual watchlist item (MSFT) and 2 Community posts also exist, left as harmless artifacts.
- `qa@wisenancial.test` / `QA Forex Main` (portfolio 15): a broker connection created+fully revoked/deleted
  during the Stock round (0 leftover, confirmed via DB), plus this round's real Journal trades (manual
  adds, a double-submit pair, an Active-Positions open→close, CSV-imported EURUSD/GBPUSD rows) and a
  monthly Goal target of $1000 — all real, intentional test artifacts of legitimate UI flows.
- `QA Forex DeleteTest` (id 18) and the two disposable with-activity-delete-test portfolios (ids 19, 20)
  from the Stock round: all confirmed deleted/cleaned up via DB.
- `qafree@wisenancial.test`: now has exactly 1 portfolio — `QA Free Forex` (id 21, TRADER, $1000 initial
  balance) — created this round via the real UI specifically to unblock the free-tier lock-hint and
  quota-full tests. This is a deliberate, permanent change to this account's baseline (previously 0
  portfolios); flagging it explicitly since a future session should expect this account to no longer be
  in a fully-empty state.

### Environment state

Both dev servers running (backend :3000, frontend :9000), `VITE_MOCK_MODE=false` confirmed and must stay
that way. `tradingjournal-frontend/qa/` now has reusable Playwright infrastructure (`helpers.mjs`,
`auth.setup.mjs`, ~28 per-topic `.mjs` scripts spanning both rounds) — see the "Infrastructure notes"
section near the top of this file for gotchas already worked out (hash routing, 15-min token TTL, Quasar
`data-test` placement, first-visit Vite compile lag, and — new this round — the fact that a short wait
after navigation is no longer a reliable way to conclude a page is broken; several pages legitimately take
5-14s to finish loading under this session's conditions).

### Recommended next steps (priority order for the next fix round)

1. **Investigate the systemic latency finding first** (#1 above) — it's very likely the root cause behind
   both the `GET /stocks` slowness and the (now-reclassified) cross-mode "empty load" bug, so fixing it
   may resolve multiple findings from both rounds at once.
2. Fix the realized-P/L field-name mismatch (#2) — simple, precise fix (two field renames), high
   visible-correctness impact.
3. Fix the Journal delete-trade UX (#5) — either surface the real constraint clearly (disable/hide the
   delete icon for closed trades, or show the real error message) or reconsider whether closed trades
   should be deletable at all.
4. Address the two MEDIUM Stock Record findings (#3 misleading sell-lot targeting, #4 buttons enabled
   before data ready) and the LOW redundant watchlist fetch (#6) as a lower-priority batch.
5. A deliberate, human-eyes-on-screen check of Stock Terminal pan/zoom — still genuinely unresolved status
   since the 2026-09-09 report.
6. A quick correct-selector re-check of Goals prev/next month navigation.
7. Both QA accounts now have real test data across both modes (see "Data state" above) — future sessions
   should treat this as the new baseline, not reset it, unless a specific test calls for a clean slate.

---

## Fix results (2026-09-24)

Four chunks fixed in order, stopping for approval after each. All mutations restricted to
`qa@wisenancial.test` / `qafree@wisenancial.test`. No schema/migration changes, no commits/pushes, no
Mock Mode. The database migration to a new region remains explicitly postponed — not started.

### Chunk 1 — Systemic latency (HIGH, was finding #1)

**Root cause:** PgBouncer transaction-mode pooling on the Neon connection added a 4-round-trip tax
(`BEGIN`/`DEALLOCATE ALL`/query/`COMMIT`) per query — Neon's own pooler already supports prepared
statements in transaction mode, so the flag was unnecessary. Compounded by structural redundancy:
`/posts` did 7 serial relation fetches per request, Analytics re-fetched ownership+trades once per tab,
Watchlist/Analytics both double-fetched on mount via an `onMounted`+`watch` race, and `/stocks`'s
no-search catalog call was uncached.

**Fixed:**
- `pgbouncer=true` removed from the real `DATABASE_URL` (approved, backed up to `.env.bak-2026-09-24`
  first, explanatory comment added) — roughly halved round-trip latency with zero "prepared statement"
  errors observed under an 8-concurrent-request check.
- `posts.service.ts` `hydratePosts`: 7 serial fetches → parallel `Promise.all`, with shape-pinning tests.
- `TraderAnalyticsService`: `assertPortfolio()`/`getClosedTrades()` now cached via a new 15s `TtlCache`
  (`common/ttl-cache.ts`), invalidated on trade create/update/close/delete, CSV import, and MT5 broker
  sync; ownership check still runs, just once per request instead of once per tab.
- `WatchlistPage.vue` and `AnalyticsPage.vue`: fixed the `onMounted`-also-triggers-the-`watch` double
  fetch.
- `stocks.service.ts`: added a 5-minute in-memory cache for the no-search-term catalog call.

**Measured:** `/posts` 4.5–13.7s → ~1.3–1.6s. All 6 `/analytics/*` endpoints 4–6s → ~0.27–0.28s.

### Chunk 2 — Realized P/L always shows 0 (HIGH, was finding #2)

**Root cause:** the frontend `InvestorSale` type declared `shares_count`/`gross_amount`, but the real API
returns `shares_sold`/`gross_proceeds` — the mismatch silently coerced every read to `0` via
`Number(undefined ?? 0)`, with no type error and no thrown exception.

**Fixed:** `investor-portfolio.types.ts` type corrected; every real read site fixed to match
(`StockRecordPage.vue`'s sale-history table, `csv-export.ts`'s `buildRealizedPnlCsv`, the mock scaffold
in `mocks/data/investor.data.ts` so it can't mask this bug class again). Added tests built from the real
API response shape (not just the type declaration) so a future field-name drift fails loudly instead of
silently returning 0.

**Verified:** live against qa@'s real MSFT sell data via Playwright — on-screen realized P/L and the CSV
export both matched a hand calculation from the real trade data.

### Step 0 — Safety backup before further changes

Full logical `pg_dump -Fc` backup of the live Neon DB (via `DIRECT_URL`, since `DATABASE_URL` carries
Prisma-only params `pg_dump` rejects) to `tradingjournal-backend/backups/neon-2026-09-24.dump` — 393.3K,
44 tables with data, verified via `pg_restore --list`. `backups/` confirmed gitignored.

### Chunk 3 — Journal trades can't be deleted (MEDIUM, was finding #5)

**Investigation (both stop conditions checked before changing anything):**
- Deleting a closed trade's linked Cash Record (`records`, `source_id` → `trades`, no FK cascade) would
  orphan a `TRADE_PNL` record and permanently inflate the portfolio balance if just deleted outright —
  but not a hard blocker, since a pre-existing, previously-unused `RecordsService.reverseSystem()` method
  already does exactly the safe reversal (mark REVERSED, create a REVERSAL entry, adjust balance). Wired
  it in instead of stopping.
- `trades.source` (`MANUAL`/`IMPORT`/`MT4_SYNC`/`MT5_SYNC`/`WEBULL_SYNC`) reliably distinguishes origin —
  no guessing needed.

**Fixed:** `trades.service.ts`'s `remove()` — closed `MANUAL`/`IMPORT` trades now delete (reversing the
linked Cash Record first, inside the same transaction as the delete); `MT4_SYNC`/`MT5_SYNC`/`WEBULL_SYNC`
still rejected with a clear message. Analytics cache invalidates on delete. `JournalPage.vue`'s delete
toast now shows the real backend error instead of a generic "Deletion failed"; the list already updated
without a manual reload (no fix needed there).

**Live-verified:** deleted 2 real closed trades (manual + CSV-imported) on qa@'s data; balance moved
exactly as expected (10756.35 → 10582.90).

**This session's two follow-up checks (before Chunk 4):**

1. **Atomicity** — confirmed already atomic, no code change needed: `reverseSystem()` is called with the
   *same* `tx` client the outer `$transaction` callback receives, and `applyBalance()` (the balance
   update) also takes that same client — so the Cash Record reversal, the balance adjustment, and the
   trade delete all live inside one interactive Postgres transaction (`Serializable`). If the delete
   throws after the reversal step, Postgres rolls back the whole transaction, not just the delete. Added
   2 new tests: one confirming a delete-side failure still propagates as a rejection (proving nothing is
   silently swallowed after a partial reversal), and one confirming a double-delete of the same trade
   (double-click/retry) hits `findOwnedTrade`'s row-not-found path and returns a clean 404 without calling
   `reverseSystem`/touching the balance a second time.
2. **REVERSED record read sites** — audited every place that reads the `records` table (balance calc,
   Dashboard, Analytics cash-flow, dividends/tax summary, investor-records, CSV exports): all of them
   already default to `status: RecordStatus.ACTIVE` (`records.service.ts` `findAll`/`getSummary`/
   `rebuildBalance`, `advanced-analytics.service.ts` `cashFlow`, `investor-records.service.ts`,
   `dividends.service.ts`). No site double-counts or displays a REVERSED record as active — this was
   already correct architecturally (the reversal pattern pre-dates this fix, just unused for trades).
   No code changes needed. Live-verified via the real API + Playwright: the default
   `/records/portfolio/15` list correctly excludes the 2 REVERSED records from the earlier deletions and
   includes their REVERSAL entries instead; on-screen Forex dashboard balance matched the DB exactly
   (10,582.9), console clean.

### Chunk 4 — Sell-dialog lot clarity + buy/sell button loading states (MEDIUM, was findings #3 and #4)

**Investigated:** `StockTransactionsService.sell()` allocates the requested share count across *all* open
lots of the symbol in cost-method order (FIFO/LIFO oldest/newest-first, or pro-rata for AVERAGE) — not
just the lot row the user clicked "sell" on. The dialog gave no indication of this.

**Fixed (lot clarity):**
- New read-only `GET /investor/portfolios/:id/stocks/sell-preview` endpoint that reuses the *exact same*
  `allocateSequential`/`allocateAverage` methods `sell()` uses (not a reimplementation — zero drift risk
  between what's previewed and what's actually consumed).
- Sell dialog now shows the true total held across all open lots of the symbol (not just the clicked
  lot's remaining shares) in both the caption and the max-sellable validation, a "spans N lots" notice
  banner when more than one lot exists, and a live, debounced lot-by-lot breakdown (which lot, how many
  shares, whether it fully closes that lot) as the user edits shares/cost method. Preview failures degrade
  gracefully — never blocks submission, it's advisory only.

**Fixed (button loading state):** root cause was the "ซื้อหุ้น" button gating on `activePortfolio`
(`PortfolioStore`'s "a portfolio is selected" flag), not `InvestorPortfolioStore.portfolioId` (the "this
portfolio's data has actually finished loading" flag) — the two become true at different times, and a
submit in that gap threw immediately with no network request and a generic toast. Fixed the gating
condition and added a loading label; hardened `InvestorPortfolioStore.buy()`/`sell()`'s pre-check guard
to set a real, specific error message as defense in depth in case the race is ever hit through another
path.

**Live-verified via Playwright on qa@'s real data:**
- Bought a real 2nd AAPL lot (via the real API) to get 2 open lots of the same symbol, opened the sell
  dialog from the older lot's row: caption correctly read "ถืออยู่ 15 หุ้น (รวม 2 lot)", the multi-lot
  banner appeared, and typing 12 shares showed the live breakdown "Lot #7 10 หุ้น (ปิด lot), Lot #13 2
  หุ้น". Submitted the real sell — the backend's actual allocation response was `purchase_id 7 → 10 shares,
  purchase_id 13 → 2 shares`, an exact match to what was previewed.
- Reproduced the original button race with a hard page reload on `/StockRecord` (fresh store init, same
  as a user refreshing or deep-linking): polled the button every ~50ms and captured it correctly disabled
  with the "กำลังโหลดข้อมูลพอร์ต..." label for ~3.2s, flipping to enabled "ซื้อหุ้น" the instant
  `store.load()` resolved — previously this window would have been fully clickable.

### Final regression (2026-09-24, after Chunks 1–4)

- Backend: `tsc` clean, `jest` **585/585** (baseline 571 → 577 after Chunks 1–2 → 585 after this session's
  8 new tests: 2 atomicity/double-delete + 6 `previewSell`).
- Frontend: `vitest` **525/525** (baseline 519 → 525 after this session's 6 new tests: 2 buy-button
  gating + 4 sell multi-lot/preview), `vue-tsc` clean, `eslint` clean on `src/` (pre-existing lint noise
  in the untracked `qa/` script directory only, unrelated to this work), `quasar build` succeeded.

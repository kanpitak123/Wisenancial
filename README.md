# Wisenancial / TJAPP

Unified trading-journal and investment-analysis application. The current codebase is the result of merging the TJAPP backend/database baseline with Wisenancial features while keeping Trader and Investor business domains distinct where their data models differ.

> **Current status (2026-08-13):** database and backend core have been substantially merged; frontend stores/services/composables have been heavily refactored; the Page/Route/Layout layer is **not yet fully merged**.

## 1. Architecture at a Glance

```text
User
  -> PortfolioStore
      -> activePortfolio + portfolio_type (TRADER | INVESTOR)
          -> TraderStore / InvestorStore workspace orchestration
              -> Domain Stores
                  -> Services
                      -> Backend API
                          -> Prisma
                              -> Supabase PostgreSQL
```

### Shared domains

Portfolio, Records, Watchlist, News, Analytics, Goals, Community/Posts, Share, AI, Billing/Payments, Gamification/Missions, Auth/User.

### Trader-specific domains

Journal/Trades, Active Positions, trading Assets, Lot Calculator.

### Investor-specific domains

Stock Transactions, Stock Purchases/Holdings, Dividends, Stock Explorer, Stock Analysis, Monthly Movers, Recommendations.

## 2. Database and Prisma Rules

- **Supabase PostgreSQL** is the database target.
- `portfolio_type` is the primary workspace discriminator: `TRADER` or `INVESTOR`.
- Do **not** merge `trades` with `stock_purchases`; they have different business semantics.
- Do **not** merge trading `assets` with investor `stocks`.
- The legacy `news` table and `market_news` are not automatically interchangeable; preserve their current meanings.
- Posts use generic `reference_type` + `reference_id` rather than a Trader-only `trade_id` relationship.
- The project returned to **Prisma 6.19.2** after an accidental Prisma 7 upgrade caused schema/client incompatibilities.
- Do not change Prisma major versions during the merge without an explicit migration/client configuration plan.
- Do not rewrite old migrations casually. Verify shadow-database replay before committing migration changes.

Useful checks:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
```

## 3. Backend Domain Map

| Domain | Responsibility |
|---|---|
| Auth / Users | JWT identity, user profile, account-level state |
| Portfolios | Create/select/update portfolios and `portfolio_type` separation |
| Journal / Trades | Trader trade lifecycle, import, PnL, active/closed trades |
| Records | Shared cash ledger / transaction-history source of truth |
| StockTransactions | Investor BUY/SELL write model |
| StockPurchases | Investor holdings/read model |
| Assets | Trading assets |
| Stocks / Market | Stock references, prices, history, trending, events, market news |
| Watchlist | User/portfolio tracked assets; **not** AI Recommendations |
| Analytics | Shared contract with Trader/Investor-specific outputs |
| Goals | Monthly targets/daily plan; Investor goal logic still needs finalization |
| Posts / Community | Shared social posts for both workspaces |
| Share | Share statistics, generated message/image and share logs |
| Billing / Payments | Stripe subscriptions, AI-credit checkout and webhook flow |
| Gamification / Missions | Mission definitions, user progress and claims |
| AI | Models, chart insights, portfolio reviews, risk, recommendations, quiz, credits |

## 4. Frontend Store Map

| Current source of truth | Responsibility | Replaces / avoids |
|---|---|---|
| `PortfolioStore` | Portfolio list, active portfolio and active workspace type | Separate Trader/Investor portfolio stores |
| `JournalStore` | Trader trade state | `TradeStore` |
| `RecordStore` | Shared records/ledger | `InvestorCashflowStore` and duplicate cashflow state |
| `MarketStore` | Quotes, history, technical data, stored prices and sync | Page-level market API duplication |
| `WatchlistStore` | Actual user watchlist | AI recommendation state |
| `AnalyticsStore` | Core/details/advanced analytics and daily PnL | Page-local analytics state |
| `GoalStore` | Monthly goal and daily plan | Duplicate goal state |
| `NewsStore` | News loading/filtering | Page-local news fetching |
| `CommunityStore` | Posts/feed/filter state | Separate Trader/Investor post stores |
| `ShareStore` | Share generation/logging/statistics | Page-local share API calls |
| `AiStore` | AI models/insights/reviews/risk/quiz/credits | Page-local AI state |
| `BillingStore` | Checkout/billing frontend flow | Page-local billing state |
| `GamificationStore` | Missions/progress/filter/claim | Separate mission/gamification state |

### Legacy names that should not be reintroduced

- `TradeStore` -> use `JournalStore`.
- `ActivePositionStore` -> use `JournalStore.activeTrades` + `MarketStore`.
- `InvestorCashflowStore` -> use `RecordStore`.
- Separate Trader/Investor portfolio stores -> use `PortfolioStore` unless there is a genuinely distinct domain requirement.
- A Watchlist backed by AI recommendations -> split into `WatchlistStore` and Investor `RecommendationsPage`.

## 5. Frontend Coding Conventions Established During Refactor

### Pinia actions exposed from composables

Do not return unbound methods:

```ts
// Avoid
refresh: store.refresh

// Use
refresh: () => store.refresh()
```

This prevents `@typescript-eslint/unbound-method` errors and preserves Pinia action context.

### Optional request properties

With `exactOptionalPropertyTypes`, do not explicitly send `undefined` unless the type permits it:

```ts
const payload = {
  ...(currency !== undefined ? { currency } : {}),
};
```

### Store getters/actions

Avoid default parameters such as:

```ts
async load(id = this.activePortfolioId) {}
```

Resolve the fallback inside the action instead. Also avoid creating duplicate source-of-truth getters when `PortfolioStore` already owns the active portfolio.

## 6. Target Page Structure

```text
src/pages/
├── shared/
│   ├── DashboardPage.vue
│   ├── PortfolioPage.vue
│   ├── AnalyticsPage.vue
│   ├── NewsPage.vue
│   ├── GoalsPage.vue
│   ├── RecordsPage.vue
│   ├── WatchlistPage.vue
│   ├── CommunityPage.vue
│   ├── ChatPage.vue
│   ├── ClassroomPage.vue
│   ├── ProfilePage.vue
│   ├── AiCreditsPage.vue
│   ├── UpgradePage.vue
│   ├── SettingsPage.vue
│   └── CoachPage.vue
├── trader/
│   ├── JournalPage.vue
│   ├── ActivePositionsPage.vue
│   ├── AssetExplorerPage.vue
│   └── LotCalculatorPage.vue
├── investor/
│   ├── StockExplorerPage.vue
│   ├── StockAnalysisPage.vue
│   ├── MonthlyMoversPage.vue
│   └── RecommendationsPage.vue
├── auth/
│   ├── LoginPage.vue
│   ├── RegisterPage.vue
│   └── AuthCallbackPage.vue
└── system/
    ├── ErrorNotFound.vue
    └── PublicProfilePage.vue
```

A **Shared Page does not mean identical Trader and Investor UI**. Prefer a shared page shell with domain-specific child components, for example:

```text
AnalyticsPage.vue
├── TraderAnalytics.vue
└── InvestorAnalytics.vue
```

Do not fill one page with dozens of workspace `v-if` branches if components can express the split more cleanly.

## 7. Features Still Outside / Not Fully Integrated

### Coach Room

The Investor source contains Coach UI and the backend already has a Coach domain. It has **not yet been merged into the main frontend**. Default target is a shared/user-level feature unless backend contracts prove it is Investor-only.

### Settings UI

The Investor source contains Settings UI. It is **not yet in the main frontend**. Target: shared/system settings rather than an Investor-only page.

### Language / i18n

Investor-side language UI/infrastructure still needs to be merged and standardized. Target: one application-level locale source of truth for both Trader and Investor.

### GlobalDataFilter

A GlobalDataFilter exists in the main project, originating from the Trader side, but it has **not yet been properly implemented/refactored/integrated**.

Before changing it:

1. Inspect what it actually owns: date range, portfolio, symbol/asset, timeframe, category, or trade-only filters.
2. Keep it Trader-only if its state is genuinely trading-specific.
3. Make it shared if it represents cross-domain filters used by Dashboard/Analytics/Records/News/etc.
4. Do not duplicate state already owned by `PortfolioStore`, `AnalyticsStore`, `NewsStore`, or another domain store.

## 8. Recommended Merge Order

1. Keep Store / Service / Composable TypeScript and ESLint clean.
2. Inventory Coach, Settings and i18n files/dependencies from the Investor source.
3. Inspect and classify the existing GlobalDataFilter.
4. Merge/refactor i18n and establish a single locale source of truth.
5. Merge Settings as a shared/system feature.
6. Merge Coach UI with the backend Coach domain.
7. Refactor/integrate GlobalDataFilter without duplicating domain state.
8. Create the new Page folders.
9. Move Auth/System pages.
10. Move Trader-only pages.
11. Move Investor-only pages.
12. Merge shared pages in this order: Portfolio -> Dashboard -> Analytics -> News -> Records -> Goals -> Watchlist -> Community/Chat/Classroom.
13. Only after destination files exist, update `routes.ts` imports.
14. Update `MainLayout`, sidebar/menu/navigation, language selector and workspace visibility.
15. Search for and remove confirmed legacy/duplicate files.
16. Type-check, lint, build and smoke-test.

## 9. Routes Rule

Folder organization does **not** require changing public URLs. For example:

```text
src/pages/shared/DashboardPage.vue
```

may still be routed as:

```text
/dashboard
```

Update route import paths only after the destination Page files are ready.

## 10. Validation Before Merge

Frontend:

```bash
npx vue-tsc --noEmit
npm run lint
npm run build
```

Backend:

```bash
npm run build
```

Prisma when schema/migrations changed:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Smoke-test at minimum:

- Login/authentication.
- Select a Trader portfolio and navigate core Trader flows.
- Select an Investor portfolio and navigate core Investor flows.
- Switch Trader <-> Investor and confirm data does not leak across workspaces.
- Portfolio CRUD.
- Journal/Records core actions.
- Watchlist.
- Community posts.
- Settings and language after integration.
- Coach after integration.
- Billing/AI-credit flow when relevant environment secrets are configured.

## 11. Environment / Secrets

Never commit secrets. Billing/Payments requires Stripe configuration and AI features may require provider/API configuration. Keep secrets in environment files excluded from Git and maintain safe `.env.example` placeholders.

## 12. Definition of Done

The frontend merge is **not complete** until all of the following are true:

- Database/Prisma state is reproducible.
- Backend build passes.
- Frontend type-check passes.
- Frontend lint passes, or explicitly documented exceptions exist.
- Frontend build passes.
- No imports remain to retired stores such as `TradeStore`, `ActivePositionStore`, or `InvestorCashflowStore`.
- Shared pages use `PortfolioStore`/portfolio context instead of hard-coded workspace assumptions.
- Trader and Investor data remain isolated correctly.
- Coach, Settings, i18n and GlobalDataFilter are integrated or explicitly scoped out with a tracked decision.
- Routes/layout/navigation match the new Page structure.
- Core smoke tests pass.

## 13. Handover Documents

For the detailed migration/refactor history, module map and work plan, read:

- `Wisenancial_TJAPP_Handover_2026-08-13_v2.docx` - Thai handover.
- `HANDOVER_EN.docx` - English handover.
- `AGENTS.md` - rules and working context for AI coding agents and contributors.


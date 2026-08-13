# AGENTS.md - Wisenancial / TJAPP Merge Instructions

This file is the operational context for AI coding agents and contributors working on the current Wisenancial/TJAPP merge. Read it before modifying architecture, stores, pages, routes, Prisma, or migrations.

## Mission

Finish the TJAPP + Wisenancial merge without reintroducing duplicate state, breaking Trader/Investor isolation, or rewriting established business semantics.

The project has two workspaces:

- `TRADER` - trading journal workflows.
- `INVESTOR` - long-term investment/stock workflows.

They share users, authentication, database infrastructure and many cross-cutting domains, but they do **not** share every business model.

## Current State

- Database/Prisma merge: substantially completed on Supabase PostgreSQL.
- Backend core: substantially merged and has previously built successfully after dependency/Prisma recovery.
- Frontend Store/Service/Composable layer: heavily refactored; TypeScript/ESLint cleanup is in progress/near the Page boundary.
- Page/Route/Layout layer: **not fully merged**.
- Investor-only source still contains Coach UI, Settings UI and language/i18n work that has not been brought into the main frontend.
- Main project contains a Trader-origin GlobalDataFilter, but it has not yet been properly refactored/implemented/integrated.

Do not claim the frontend merge is complete until Page/Route/Layout plus the pending features pass validation.

## Non-Negotiable Architecture Rules

### 1. Portfolio context is central

`PortfolioStore` owns the active portfolio and active `portfolio_type`. Do not create a second global source of truth for the same state.

```text
User -> PortfolioStore -> TRADER | INVESTOR -> Workspace/Domain Stores
```

### 2. Shared when semantics are shared; separate when semantics differ

Keep these concepts distinct:

- `trades` != `stock_purchases`
- trading `assets` != investor `stocks`
- actual Watchlist != AI Recommendations
- Journal trade state != Investor holdings state

Do not merge tables/services/stores merely because fields look similar.

### 3. Retired frontend state must stay retired

Do not reintroduce:

- `TradeStore` - use `JournalStore`.
- `ActivePositionStore` - use `JournalStore.activeTrades` + `MarketStore`.
- `InvestorCashflowStore` - use `RecordStore`.
- Separate Trader/Investor portfolio stores for shared portfolio state - use `PortfolioStore`.

Before deleting any legacy file, search the repository and verify no imports remain.

### 4. Domain Store is the source of truth

Pages should orchestrate/render. They should not duplicate API state already owned by Stores.

Preferred flow:

```text
Page/Component -> Composable -> Store -> Service -> Backend
```

Direct Page -> API calls should be removed during refactor when the corresponding Store/Service exists.

### 5. Composable Pinia actions must remain bound

Avoid:

```ts
refresh: store.refresh
```

Use:

```ts
refresh: () => store.refresh()
```

or an equivalent typed arrow wrapper. This avoids `@typescript-eslint/unbound-method` and preserves action context.

### 6. Respect `exactOptionalPropertyTypes`

Do not construct request objects with optional properties explicitly set to `undefined` unless the type allows it.

Preferred:

```ts
const query = {
  ...(currency !== undefined ? { currency } : {}),
};
```

### 7. Avoid `this` in action default parameters

Avoid:

```ts
async load(id = this.activePortfolioId) {}
```

Use:

```ts
async load(id?: number | null) {
  id ??= this.activePortfolioId;
}
```

### 8. Prisma version discipline

The project returned to Prisma `6.19.2` after an accidental Prisma 7 upgrade caused large incompatibilities. Do not upgrade Prisma major versions as part of unrelated work.

When touching Prisma:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Do not edit historical migrations destructively without understanding shadow-database replay.

## Backend Responsibility Map

- Auth/Users: shared identity/profile.
- Portfolios: shared portfolio management and workspace discriminator.
- Journal/Trades: Trader domain.
- Records: shared ledger/transaction history.
- StockTransactions: Investor BUY/SELL write model.
- StockPurchases: Investor holdings/read model.
- Assets: Trader/trading assets.
- Stocks/Market: stock reference/market data.
- Watchlist: shared tracked assets.
- Analytics: shared API surface with workspace-specific results.
- Goals: shared store/API direction; Investor goal semantics still need finalization.
- Posts/Community: shared posts using generic references.
- Share: shared statistics/message/image/log flow.
- Billing/Payments: Stripe subscriptions and AI-credit checkout/webhooks.
- Gamification/Missions: one domain with definition + user progress responsibilities.
- AI: shared user/portfolio-aware features.

## Target Page Classification

### Shared

- Dashboard
- Portfolio
- Analytics
- News
- Goals
- Records
- Watchlist
- Community
- Chat
- Classroom
- Profile
- AI Credits
- Upgrade
- Settings
- Coach (default target unless backend contract proves otherwise)

### Trader-only

- Journal
- Active Positions
- Asset Explorer
- Lot Calculator

### Investor-only

- Stock Explorer
- Stock Analysis
- Monthly Movers
- Recommendations

### Auth/System

- Login
- Register
- Auth Callback
- Error Not Found
- Public Profile

## Target Page Folder Layout

```text
src/pages/
├── shared/
├── trader/
├── investor/
├── auth/
└── system/
```

Shared pages may render separate Trader/Investor child components. Do not interpret "shared" as "identical UI".

Example:

```text
DashboardPage.vue
├── TraderDashboard.vue
└── InvestorDashboard.vue
```

## Pending Features - Handle Before Declaring Frontend Complete

### Coach Room

- Exists in Investor source.
- Backend has Coach domain.
- Not yet merged into the main frontend.
- Default classification: shared/user-level.
- Use portfolio context only when the Coach contract actually needs it.

### Settings

- Exists in Investor source.
- Not yet merged into main frontend.
- Target: shared/system settings.

### Language / i18n

- Investor source contains language UI/infrastructure.
- Target: one app-level locale source of truth for both workspaces.
- Do not create separate Trader/Investor locale systems.

### GlobalDataFilter

- File exists in the main project.
- Originates from Trader work.
- Not yet properly implemented/refactored/integrated.

Before changing it, inspect actual state ownership.

If it owns cross-domain state such as date range/timeframe/portfolio/symbol used across Dashboard/Analytics/Records/News, refactor toward shared filter infrastructure.

If it owns truly trade-specific filters, keep it Trader-specific.

Never let GlobalDataFilter duplicate canonical state already owned by `PortfolioStore`, `AnalyticsStore`, `NewsStore`, etc.

## Page Refactor Order

Follow this order unless a concrete dependency requires otherwise:

1. Finish Store/Service/Composable type/lint cleanup.
2. Inventory Coach/Settings/i18n source and dependencies.
3. Inspect/classify GlobalDataFilter.
4. Merge i18n.
5. Merge Settings.
6. Merge Coach.
7. Refactor/integrate GlobalDataFilter.
8. Create target Page folders.
9. Move Auth/System pages.
10. Move Trader-only pages.
11. Move Investor-only pages.
12. Merge `PortfolioPage`.
13. Merge `DashboardPage`.
14. Merge `AnalyticsPage`.
15. Merge `NewsPage`.
16. Merge `RecordsPage`.
17. Merge `GoalsPage`.
18. Merge `WatchlistPage`.
19. Merge Community/Chat/Classroom and remaining shared pages.
20. Update routes only after destination files exist.
21. Update MainLayout/sidebar/navigation/language selector.
22. Remove confirmed duplicates.
23. Validate and smoke-test.

## Routes

Do not equate source folders with public URLs. Moving:

```text
pages/DashboardPage.vue
```

to:

```text
pages/shared/DashboardPage.vue
```

does not require changing `/dashboard`.

Update route import paths after file moves/merges are stable.

## Required Validation

### Frontend

```bash
npx vue-tsc --noEmit
npm run lint
npm run build
```

### Backend

```bash
npm run build
```

### Prisma when relevant

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Do not hide or suppress errors simply to make these commands green. Fix the contract/source issue unless there is a documented reason for an exception.

## Smoke-Test Matrix

At minimum verify:

1. Authentication.
2. Trader portfolio selection.
3. Investor portfolio selection.
4. Workspace switching without cross-workspace data leakage.
5. Portfolio CRUD.
6. Trader Journal and Active Positions.
7. Investor holdings/stock flows.
8. Records.
9. Analytics.
10. Goals.
11. Watchlist.
12. News.
13. Community/posts.
14. AI flow and credits where configured.
15. Billing/checkout where Stripe environment is configured.
16. Settings/language after integration.
17. Coach after integration.

## Secrets and Environment

Never commit secrets or real credentials. Stripe billing requires secret/webhook configuration; AI integrations may require provider keys. Keep `.env` ignored and update `.env.example` only with safe placeholders/names.

## Change Discipline for Agents

Before editing:

1. Read the target Store/Service/Types and its backend contract.
2. Search for all imports/usages of any file being renamed/deleted.
3. Identify whether the feature is Shared, Trader-only, Investor-only, Auth, or System.
4. Preserve existing business behavior unless the task explicitly changes it.

While editing:

- Prefer small coherent refactors over simultaneous unrelated rewrites.
- Preserve existing public API/route behavior where possible.
- Do not create compatibility aliases indefinitely; migrate imports and remove obsolete code once verified.
- Keep types/services/constants/composables separated when that pattern already exists for the domain.
- Avoid adding mock data to production flows to silence missing integrations.

After editing:

1. Run the narrowest relevant type/lint check.
2. Run full validation before handing off a merge-ready change.
3. Report files changed, legacy files removed, commands run and remaining blockers.

## Definition of Done

Do not mark the merge complete until:

- Prisma/database state is reproducible.
- Backend build passes.
- Frontend type-check, lint and build pass.
- Retired Store imports are gone.
- Page folders/routes/layout/navigation match the target architecture.
- Trader/Investor data isolation is verified.
- Coach, Settings, i18n and GlobalDataFilter are integrated or explicitly deferred with a documented decision.
- Core smoke tests pass.

For the human-readable project overview, also read `README.md` and `HANDOVER_EN.docx` / the Thai handover document.

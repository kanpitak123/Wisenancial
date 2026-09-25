# MT5 Investor-Password / Managed-Connector Spike

**Status (2026-09-08, updated): graduating from spike to a gated beta feature —
in progress, not production-ready.** The spike below closed with a "stay EA-only for
now" recommendation, but a product decision was made to proceed toward a real,
user-facing beta anyway, on the condition that the reliability bug the spike found gets
fixed first (see "Reliability fix" below) and the whole thing stays behind a feature
flag, restricted to a single beta user, with real UI added on the actual
`BrokerConnections` page rather than the hidden `/dev` route. **Still not wired into the
real "Sync MT5" onboarding flow for anyone else**, and still gated on three business
decisions before any wider launch:

1. **Secret manager choice** — which KMS/secrets service replaces the raw
   `MT5_CLOUD_SPIKE_ENCRYPTION_KEY` env var. AWS Secrets Manager wiring now exists and
   is unit-tested (code-complete), but is **not yet live** — see "Key/ciphertext
   separation" below for the exact provisioning checklist still needed.
2. **PDPA consent copy sign-off** — the consent checkbox copy shipped in the beta UI
   (see "Beta UI: BrokerConnectionsPage.vue" below) is an explicit **DRAFT**, marked as
   such in both the code and the UI itself. Not legal/compliance-reviewed.
3. **MetaApi per-user cost model** — *when* the account is deployed (and therefore
   billed) is now decided and implemented: on-demand only, see "On-demand deploy
   lifecycle" below. *Who pays* for that metered usage — absorbed, passed to the user,
   or gated behind a paid tier — is still undecided.

None of this is discoverable beyond the one beta-enabled account (see
`MT5_CLOUD_CONNECTOR_BETA_USER_IDS` in "Beta UI" below — empty/unset by default, meaning
nobody). The rest of this document is largely the original spike write-up, left intact
below for the research trail, with new sections appended for what changed after the
spike closed.

This exists to answer one question: **is a managed, investor-password-based MT5
connector (no EA, no local software) a viable alternative to the EA/push connector
already shipped in Phase 3 — and if so, at what cost/friction?**

## What was built

- `tradingjournal-backend/src/mt5-cloud-spike/` — a fully isolated new module:
  - `mt5-connector.interface.ts` — the `MT5Connector` abstraction (`connect`,
    `disconnect`, `getAccountSnapshot`, `getPositions`, `getDealHistory`, `getStatus`),
    deliberately separate from the app-wide `BrokerAdapter` interface in
    `src/brokers/interfaces/` (that one covers Webull/Dime and the whole broker-
    connections feature; this one only needs to describe "read an MT5 account through
    some transport").
  - `ea-connector.ts` — `EAConnector`, a **read-only** wrapper over the data the
    already-shipped EA/ingestion pipeline produces (`broker_connections` +
    `trades` tables). Never creates, modifies, or revokes a real connection.
  - `cloud-connector.ts` — `CloudConnector`, wrapping [MetaApi.cloud](https://metaapi.cloud)
    via the official `metaapi.cloud-sdk` npm package (installed, v29.3.3).
  - `credential-vault.service.ts` — AES-256-GCM envelope encryption for the investor
    password (see "Encryption" below).
  - `credential-store.service.ts` — a gitignored JSON file
    (`data/mt5-cloud-spike-store.json`), **not a new DB table/migration** (see
    "Why no migration" below).
  - `mt5-cloud-spike.controller.ts` — dev-only routes under `/dev/mt5-cloud-spike`,
    gated by both `JwtAuthGuard` (real login required — this can read real trade data
    through `EAConnector`) and `Mt5CloudSpikeEnabledGuard` (404s unless
    `MT5_CLOUD_SPIKE_ENABLED=true`).
- `tradingjournal-frontend/src/pages/dev/Mt5CloudSpikePage.vue` — dev-only page at
  `/dev/mt5-cloud-spike`, not linked from any nav, self-blocks on
  `import.meta.env.PROD` (same pattern as the existing `/dev/design-preview`). Lets you
  pick EA (existing connection) or Cloud (login/investor password/server), watches
  status go `CONNECTING → CONNECTED`, and displays balance/equity, open positions, and
  recent deals from whichever connector is active. Includes a revoke button per stored
  cloud credential.

### How to turn it on locally

```
# backend/.env
MT5_CLOUD_SPIKE_ENABLED=true
MT5_CLOUD_SPIKE_METAAPI_TOKEN=<your MetaApi.cloud API token>
MT5_CLOUD_SPIKE_ENCRYPTION_KEY=<32 random bytes, base64>
```

A local `.env` already has `MT5_CLOUD_SPIKE_ENABLED=false` and a generated
`MT5_CLOUD_SPIKE_ENCRYPTION_KEY` — only `MT5_CLOUD_SPIKE_METAAPI_TOKEN` and flipping the
enabled flag to `true` are needed to actually run it. **`MT5_CLOUD_SPIKE_ENABLED` must
never be set to `true` on any production or staging server.**

## Why MetaApi.cloud

Per prior research, MetaApi.cloud was the leading managed-connector candidate. This
spike re-verified against their current docs and the actual installed SDK's `.d.ts`
files (not just doc prose, which can be stale/paraphrased) rather than trusting the
earlier research at face value.

### Pricing (confirmed, and what's still uncertain)

- MetaApi's own FAQ states API access to **one** MetaTrader account is free of charge —
  confirmed via their public docs.
- Their pricing page (`metaapi.cloud/#pricing`) renders its price grid client-side via
  JavaScript; automated fetching only returned the page shell, not the numbers. A
  third-party comparison article (metatraderapi.net, published 2026-06-11) confirms the
  shape of the pricing model — **per-connected-account monthly fee, plus separate
  "resource tier" (RAM/CPU) charges for heavier accounts, plus paid add-ons like the
  Manager API** — but does not quote current dollar figures, and explicitly recommends
  checking MetaApi's own page for current rates.
- **Action needed before any "go" decision**: someone should open
  `https://metaapi.cloud/#pricing` in a browser and record the actual current numbers.
  This spike could not extract them through automated fetching.
- **Correction (2026-09-08, confirmed via actually setting up a real MetaApi billing
  account to get a usable API token)**: there is **no separate free trial tier**.
  **Paid pay-as-you-go is the only self-service tier**, and it bills as real metered
  usage starting from the very first API call — not after some free quota is used up.
  The earlier bullet above (FAQ claiming one free account) either no longer reflects
  MetaApi's current terms or referred to something narrower than "free to actually use
  this spike against a live account." Treat the FAQ claim as superseded by this
  confirmed, first-hand billing experience.

### Auth / account-linking shape (verified against SDK types)

Confirmed via `node_modules/metaapi.cloud-sdk`'s type definitions (v29.3.3):

- `metatraderAccountApi.createAccount({ login, password, server, platform: 'mt5', type: 'cloud-g2', magic, ... })`.
  `password` accepts **either** the investor (read-only) password **or** the full
  trading password — this spike always sends the investor password.
- **Important correction to older research**: some MetaApi docs/examples describe an
  older `cloud-g1` account type that requires first creating a "provisioning profile"
  and uploading a `servers.dat` file extracted from an MT5 terminal's data folder per
  broker. The SDK's current type definitions show `type: 'cloud-g2'` (the default,
  described as "faster and cheaper") does **not** require `provisioningProfileId` at
  all — broker/server resolution happens from the `server` string (optionally aided by
  a `keywords` array) instead. This spike's `CloudConnector` uses `cloud-g2` and never
  creates a provisioning profile. **This removes what earlier research flagged as a
  major setup-friction point** — but it is unverified against a live account (see
  "What's untested" below), so treat it as "documented behavior," not "confirmed
  behavior," until run once for real.
- Reading data uses a separate RPC connection per account
  (`account.getRPCConnection()` → `connection.connect()` →
  `connection.waitSynchronized()` → `getAccountInformation()` / `getPositions()` /
  `getDealsByTimeRange()`).

## The MT5Connector abstraction

```
Mt5Connector
 ├─ EAConnector    — reads broker_connections + trades (existing EA pipeline's data)
 └─ CloudConnector — reads through MetaApi.cloud's RPC API (investor password)
```

Both implement:

```ts
connect(request, userId) → { kind, ref }
disconnect(ref, userId)
getAccountSnapshot(ref, userId) → { balance, equity, margin, ... }
getPositions(ref, userId) → Mt5PositionSnapshot[]
getDealHistory(ref, userId, sinceDays?) → Mt5DealSnapshot[]
getStatus(ref, userId) → { state, message, checkedAt }
```

`userId` is threaded through every method (not just `connect()`) because `ref` for
`EAConnector` is a small sequential `broker_connections.id` — without a per-call
ownership check, any authenticated user of this dev page could read another user's real
trade history by guessing small integers. `CloudConnector`'s `ref` is a UUID scoped to a
gitignored per-user record, so the same check is cheap insurance there too.

The one asymmetry the interface can't fully hide: `EAConnector.connect()` doesn't take a
credential at all (it just looks up an existing ACTIVE connection the real wizard
already brought up), while `CloudConnector.connect()` takes
`{ login, investorPassword, server }` and actively provisions a new remote account.
That's a genuine architectural difference between "push, already connected" and "pull,
connect on demand" — the interface models it as a discriminated union
(`Mt5ConnectRequest`) rather than pretending both are the same shape.

## Encryption at rest

No existing helper in the codebase does reversible encryption —
`BrokerApiKeyService` (the EA connector's API key) only ever **hashes** (SHA-256,
one-way), which works there because the key is never needed back in plaintext. An
investor password has to be recoverable to hand to MetaApi, so hashing doesn't
substitute. `broker_connections.oauth_*_encrypted` columns exist in the schema for the
future Webull/Dime OAuth flow but are explicitly documented as having **no encryption
service behind them yet**.

`CredentialVaultService` (new, scoped to this spike module only) implements AES-256-GCM
envelope encryption: a 32-byte key from `MT5_CLOUD_SPIKE_ENCRYPTION_KEY` (env var,
base64), random 12-byte IV per encryption, versioned storage format
(`v1:<iv>:<authTag>:<ciphertext>`, all base64). The investor password is never logged,
never returned to the frontend, and the only plaintext copy in the process ever exists
transiently while it's being sent to MetaApi's API.

## Why no DB migration

This spike stores its one new piece of state (encrypted investor password + MetaApi
account id) in a gitignored JSON file
(`tradingjournal-backend/data/mt5-cloud-spike-store.json`), not a new Prisma
model/table. The app's real database is a shared Supabase instance other work depends
on; adding a migration for a table that might be deleted entirely depending on this
spike's outcome didn't seem worth the shared-schema footprint. If this becomes a real
feature, replace the JSON store with a proper table (and proper KMS-backed key
management — see "Future work").

## Live test results (2026-09-08)

Run against a real MetaApi.cloud token and a MetaQuotes-Demo demo account
(login `5055414461`, server `MetaQuotes-Demo`), through the actual
`POST /dev/mt5-cloud-spike/connect` route (JwtAuthGuard'd, real request, not a unit
test) — exact wall-clock timings, not rounded:

- **Connect call latency: 94,604 ms (~94.6s) to failure.** `POST connect` called
  `metatraderAccountApi.createAccount()` and it took just over 90 seconds to come back
  — consistent with the spike doc's earlier note that MetaApi's own docs describe a
  `Retry-After` of "around 60 seconds" as typical; this looks like an initial attempt
  plus one retry-after cycle before giving up, though the SDK doesn't surface that
  breakdown to the caller. **This is the one concrete provisioning-latency number this
  spike set out to get — even though the underlying auth attempt failed (see below), a
  ~95s round trip on `createAccount` before any answer at all is itself a real,
  material finding for UX purposes:** a synchronous "connect" button would need to
  either poll asynchronously from the start or show a fairly long spinner.
- **The demo credentials given (`5055414461` / `MetaQuotes-Demo`) failed MetaApi's
  authentication check**, not this app's code: `createAccount` returned MetaApi's own
  error — *"We failed to authenticate to your broker using credentials provided. This
  means that there is an 'Invalid account' or 'Account disabled' error on the trading
  terminal..."* — with an explicit warning that MetaApi "reserves the right to apply
  charges for each excessive occurrence of this error." Because retrying a failing
  auth call risks real metered charges on the connected MetaApi account, this spike
  run deliberately did **not** retry — the credentials/account need to be re-verified
  (e.g. by logging into the MT5 terminal itself with that exact login/investor
  password/server) before trying again.
- **Cleanup on failure works correctly**: `CloudConnector.connect()`'s catch block
  removed the locally-created credential-store record after `createAccount` threw —
  confirmed by checking both the `/dev/mt5-cloud-spike/cloud-records` endpoint and the
  raw `data/mt5-cloud-spike-store.json` file immediately after the failed call; both
  were empty. No orphaned encrypted-credential record was left at rest, and (since
  `createAccount` never returned an account id) no orphaned MetaApi-side account either.
- **Error-mapping gap found**: `CloudConnector.mapSdkError()` only recognizes the error
  by checking `error.name === 'UnauthorizedError'` to map it to the user-facing
  `INVALID_CREDENTIALS` code. In this live failure, the thrown error's `name` did
  **not** match `'UnauthorizedError'` — the response actually surfaced was the generic
  fallback, `{"code":"UNKNOWN"}`, with the raw MetaApi message text as `message`. So the
  doc's earlier assumption ("this spike maps SDK error class names... but the mapping
  is only as good as those class names actually being what gets thrown in practice") was
  right to flag as a risk — it's now confirmed: **the current `UnauthorizedError` class
  check does not catch this real authentication-failure shape**, and would need
  adjusting (e.g. matching on the error message text, or whatever the actual thrown
  error's constructor/name turns out to be) before the mapped `INVALID_CREDENTIALS` code
  could be relied on in a real UI.
- **Account snapshot / positions / deal history / per-call RPC latency remain
  unmeasured.** `getAccountSnapshot`/`getPositions`/`getDealHistory` only run after a
  `connect()` has produced a live `metaApiAccountId`, which didn't happen here — these
  numbers, and whether `cloud-g2` truly needs no provisioning profile for this broker's
  demo server, are still open until a connect call succeeds against verified-working
  credentials.

**Next step to unblock the remaining numbers**: re-verify the demo account's
login/investor-password/server actually work (e.g. sign into the MT5 terminal with
them directly) before attempting `connect` again, given MetaApi's stated
excessive-error charge policy above.

## Live test #2 (2026-09-08) — a real broker demo, successful connect

Same day, a second run against a **new MetaApi billing account/token** and a **real
broker's** demo server instead of the generic MetaQuotes-Demo pool: Exness
(login `414307761`, server `Exness-MT5Trial6`). Called directly against the same
`POST /dev/mt5-cloud-spike/connect` route and its sibling read routes (JwtAuthGuard'd,
real requests). Exact wall-clock timings, not rounded:

- **Connect call latency: 6,204 ms (~6.2s), success.** `createAccount()` +
  fire-and-forget `deploy()` returned `HTTP 201` with `{"kind":"CLOUD","ref":"9ed11f9d-…"}`
  in 6.2s — over 15x faster than the ~95s the MetaQuotes-Demo attempt took before
  *failing*. An immediate `GET .../status` call already reported
  `state=DEPLOYED connectionStatus=CONNECTED`. This is a strong signal that the earlier
  MetaQuotes-Demo failure wasn't primarily about the slow round trip — the account was
  never going to authenticate against that pool at all (see "Overall conclusion" below).
- **Account snapshot: succeeded, HTTP 200 in 5,964 ms.** Real data returned:
  - broker: `Exness Technologies Ltd`
  - currency: `USD`
  - balance: `1,000,200`
  - equity: `863,516`
  - margin: `101,497.76`
  - free margin: `762,018.24`
  - margin level: `850.77%`
  - leverage: `500`
  - credit: `0`

  Margin being non-zero confirms this demo account has at least one open position (it's
  using margin) — but see the positions failure immediately below, which means the
  actual position list was never retrieved to confirm what it is.
- **Positions: failed, HTTP 400 after 107,594 ms (~107.6s) — `TIMEOUT`.** Exact error
  body: `{"message":"บัญชียังไม่ online ทัน timeout (อาจกำลัง provisioning): Timed out
  waiting for MetaApi to synchronize to MetaTrader account
  6b3a6e04-71fb-4498-99ec-4ae4cda7b6f1","code":"TIMEOUT"}`. This is `mapSdkError()`
  correctly classifying a real `TimeoutError`/`NotSynchronizedError` — unlike the
  `UnauthorizedError` gap found in the first run (still unresolved, see below), the
  `TIMEOUT` mapping worked exactly as coded.
- **Deal history: never got a response at all.** The request hung and the backend
  connection was reset after ~12.7s wall-clock on the client side (`curl` exit code 000).
  The backend's own log shows the root cause: starting around the same time as the
  positions timeout, the MetaApi SDK logged a burst of repeated
  `Failed to subscribe ValidationError: It seems like you are trying to subscribe to an
  account, however you have no accounts deployed yet. Please deploy an account first`
  errors (multiple, distinct trace ids, ~10 seconds apart) for the same account id. The
  backend process became briefly unreachable (connection refused) during this window,
  then came back on its own (no manual restart this time — `nest start --watch`'s own
  recovery, or the underlying dist process respawned; the log stream for this instance
  stopped emitting further lines afterward, so the exact mechanism isn't fully visible
  from the log alone).
- **The account itself ended up undeployed.** A `GET .../status` call issued once the
  backend was reachable again returned
  `{"state":"DISCONNECTED","message":"state=UNDEPLOYED connectionStatus=DISCONNECTED"}` —
  a live MT5 account that was `CONNECTED` two API calls earlier came back `UNDEPLOYED` on
  its own, with no explicit undeploy call ever issued by this app. This is a genuine
  stability finding, not just a slow-response one: `CloudConnector`'s documented
  design choice of opening a **fresh RPC connection per read call** (see the code
  comment in `cloud-connector.ts`) is fragile enough in practice that a second/third
  call in the same short session can destabilize the account's own deployed state, not
  just time out cleanly. A pooled/kept-alive connection (already flagged in that code
  comment as the production-grade alternative) would very plausibly avoid this.
- **Cleanup, done immediately per the billing-safety requirement:**
  - `DELETE /dev/mt5-cloud-spike/CLOUD/9ed11f9d-…` → `HTTP 200 {"message":"revoked"}` in
    1,470 ms, issued at approximately `2026-09-08T14:13:46Z`.
  - `CloudConnector.disconnect()` calls MetaApi's `account.remove()` (not just
    `undeploy()`) before removing the local store record — verified this actually
    happened, not just trusted the app's own "revoked" response, by querying MetaApi's
    REST API directly (`GET
    https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/6b3a6e04-…`)
    within the same minute: **`HTTP 404 NotFoundError`** — the account no longer exists
    on MetaApi's side at all.
  - Also queried `GET .../users/current/accounts` (list all accounts under this token):
    **`[]`** — nothing else is deployed under this token.
  - The local `data/mt5-cloud-spike-store.json` file was confirmed empty (`[]`)
    immediately after.
  - Net billable-deployed window: connect at `2026-09-08T14:09:20.938Z` to the account
    going `UNDEPLOYED` on its own sometime before the `14:13:07Z` status check — **under
    4 minutes**, with explicit `remove()` confirmed shortly after. No other account was
    ever connected in this run.

**Next step to unblock full success-path numbers (positions + deal history)**: not
attempted further per the explicit "no further live MetaApi testing without an explicit
go-ahead" scope for this spike (see "Overall conclusion" below) — would need the
`withRpcConnection` per-call-reconnect pattern hardened (e.g. a single warm pooled
connection reused across `getAccountSnapshot`/`getPositions`/`getDealHistory` instead of
opening/closing one per call) before repeating this safely.

## IDOR check (2026-09-08, live)

Verified from a real logged-in session, against the running dev server, for both
connector kinds — not inferred from reading the code:

- **Both `EaConnector` and `CloudConnector` correctly refuse cross-user and
  nonexistent refs.** Tested: a random nonexistent CLOUD ref (UUID), a large
  nonexistent EA `brokerConnectionId`, and — the stronger test — a CLOUD record
  planted directly in the store file and owned by a *different, real* user account,
  accessed from `status`, `account`, `positions`, `deals`, and `DELETE`. Every case
  returned the exact same generic message (`"ไม่พบ ... (หรือไม่ใช่ของผู้ใช้นี้)"` /
  "not found or not yours") — there is no observable difference in response between
  "doesn't exist" and "exists but belongs to someone else," so no account-enumeration
  side channel exists via this path. The victim's record was left completely untouched
  in the store file (the `DELETE` attempt did not remove it).
- **Correction to what was recalled going into this test**: the response is **not** a
  plain 404. Both connectors throw `Mt5ConnectorError` with `code: 'NOT_FOUND'`, and
  the controller's `toHttpException()` maps *every* `Mt5ConnectorError` — regardless of
  code — to `BadRequestException`, i.e. **HTTP 400**, with a JSON body of
  `{"message": "...", "code": "NOT_FOUND"}`. The ownership check itself is sound (no
  information leak in the message content or timing), but the status code is 400, not
  404, and the `code: "NOT_FOUND"` field is machine-readable — a determined caller can
  script-detect "this ref doesn't resolve for me" faster than by string-matching the
  Thai message, though they still can't distinguish nonexistent from not-mine. If a
  plain, undifferentiated 404 is actually wanted here (matching the rest-of-app
  convention for "not yours"), `toHttpException()` would need a branch mapping
  `code === 'NOT_FOUND'` to `NotFoundException` specifically, separate from the other
  `Mt5ConnectorError` codes (`INVALID_CREDENTIALS`, `TIMEOUT`, `RATE_LIMITED`, etc.)
  which reasonably stay 400s. Not changed as part of this test — this is a spike page,
  and the request was to verify current behavior, not alter it.

## Frontend fix: dev page routing (2026-09-08)

The dev page at `/dev/mt5-cloud-spike` originally rendered a blank white page with a
console error, `QPage needs to be a deep child of QLayout`. Root cause: the route was
declared as a **top-level** entry in `tradingjournal-frontend/src/router/routes.ts`
(a sibling of the `MainLayout` block, not nested inside it), so its `<q-page>` template
root had no `<q-layout><q-page-container>` ancestor to render into — Quasar requires
that nesting. Fixed by moving the route into `MainLayout`'s `children` array (right
after `BrokerConnections`) instead of leaving it top-level; the URL is unchanged
(`http://localhost:9000/#/dev/mt5-cloud-spike`) since the parent layout route is `/`.
Verified via a headless-browser run (Playwright): the page now renders fully inside the
app shell with zero console errors. One side effect worth noting: nesting it under
`MainLayout` means the page now also requires auth (`meta.requiresAuth` on that parent
route) before it loads, matching the backend's own `JwtAuthGuard` instead of only
enforcing auth after the page had already rendered. `/dev/design-preview` has the same
latent top-level-route bug (no `<q-layout>` ancestor either) but was left as-is —
out of scope for this spike, flagged only for awareness.

## Future work: encryption key/data separation

`CredentialVaultService`'s AES-256-GCM key (`MT5_CLOUD_SPIKE_ENCRYPTION_KEY`) lives in
the same `.env` file, on the same disk, as the encrypted investor-password blobs it
protects (`data/mt5-cloud-spike-store.json`). That means anyone who can read the app's
filesystem — a server compromise, a misconfigured backup, a leaked `.env` — gets both
halves needed to decrypt every stored investor password in one shot; envelope
encryption only earns its name when the two halves are actually separated. A stronger
design would keep the decryption key in a dedicated secrets manager/KMS (e.g. a cloud
KMS with envelope-encryption support, or a secrets-manager service issuing short-lived
decrypt grants) entirely outside the app server's own disk, so compromising the
credential store alone — or the app server's `.env` alone — isn't sufficient to decrypt
anything. This is **not** being built now; it's scoped explicitly as future work, and
only matters at all if this spike leads to a "go" decision (see "What's needed before
this could ship for real" above, which already lists production-grade key management as
a prerequisite).

## What's needed before this could ship for real

None of this was built — the list is exactly the scope the brief said not to build yet:

- PDPA consent UI/flow for storing another party's (the broker's) investor credential
  on the user's behalf.
- A data-processing agreement (DPA) with MetaApi (or whichever vendor), and a
  documented legal basis for any cross-border transfer of trading credentials/data.
- Production-grade key management (a KMS, not a raw env var) for the encryption key,
  and a real DB table with proper access control instead of a JSON file.
- A real revocation UX (this spike's delete button is functional but not
  user-friendly/production-polished).
- A decision on pricing pass-through: MetaApi bills per connected account — is that
  cost absorbed, passed to the user, or gated behind a paid tier?

## Overall conclusion (spike closed, 2026-09-08)

This spike is now closed with two real live-test runs behind it (not zero, and not
just a failed attempt). Summary of everything it established:

- **The architecture is proven viable against a real broker server.** The
  `MT5Connector` abstraction (`EAConnector` / `CloudConnector` behind one interface)
  held up under real use, and `cloud-g2` account creation + investor-password auth +
  a real account-data read (balance/equity/margin/etc.) all worked, fast, against
  Exness's demo server (Live test #2: 6.2s connect, 6.0s account snapshot, real
  numbers back). This removes the two biggest open questions this spike existed to
  answer: does investor-password-only auth work at all (yes), and is `cloud-g2`'s
  no-provisioning-profile claim real (yes, confirmed live).
- **The generic MetaQuotes-Demo pool is not a usable target for this connector.**
  Live test #1 (login `5055414461`, server `MetaQuotes-Demo`) failed MetaApi's own
  authentication check outright, after a slow ~95s round trip, with an explicit
  "Invalid account or Account disabled" error. Live test #2, using the *same*
  connector code path against a real broker's demo server instead, connected in 6.2s
  with no auth issue at all. MetaQuotes-Demo is a shared, broker-less sandbox pool
  that MT5 terminals connect to out of the box — it is not tied to a specific broker's
  trade server infrastructure the way `Exness-MT5Trial6` is, and this spike's evidence
  is consistent with MetaApi (a broker-server-facing API bridge) simply not supporting
  it. Any future testing of this connector needs a **real broker's** demo/live server,
  never the generic MetaQuotes-Demo pool.
- **There is no free tier.** Corrected in "Pricing" above: MetaApi's self-service
  option is Paid pay-as-you-go only, metered from the first call — budget for that
  before any further live testing, including by this spike's own author.
- **The IDOR ownership check is sound** (verified live, both connectors, including a
  planted cross-user record) but returns `HTTP 400` with a machine-readable
  `{"code":"NOT_FOUND"}`, not the plain undifferentiated 404 that was expected going
  in — see "IDOR check" above for what would need to change if a plain 404 is wanted.
- **`mapSdkError()` has a confirmed, unresolved gap** on the `UnauthorizedError` case
  (falls through to generic `UNKNOWN` instead of `INVALID_CREDENTIALS` — found in Live
  test #1) even though its `TimeoutError` mapping was independently confirmed correct
  in Live test #2. Not fixed as part of this spike (verification was the ask, not a
  fix) — would need addressing before the mapped error codes could be trusted in a
  real UI.
- **A new, more serious stability finding from Live test #2**: the per-call
  fresh-RPC-connection design (already flagged as a known simplification in
  `cloud-connector.ts`'s own comments) isn't just slower than a pooled connection — in
  practice, a second read call in the same short session hit a real `TIMEOUT`, and the
  MetaApi-side account ended up fully `UNDEPLOYED` afterward with no explicit undeploy
  ever issued by this app. That's a correctness/reliability problem, not just a
  performance one, and would need to be fixed (warm pooled connection, or at minimum
  a redeploy-and-retry path) before this connector could be trusted for anything beyond
  a single one-shot read per session. **Fixed 2026-09-08 — see "Reliability fix:
  session-scoped RPC connection reuse" below.**
- **The `QPage`/`QLayout` dev-page routing bug is fixed** (see "Frontend fix" above)
  and confirmed working via a headless-browser run.
- **The encryption key/ciphertext separation limitation remains open, documented
  future work** (see "Future work" above) — not built, not blocking, but real.

**This remains an isolated, dev-only, feature-flagged prototype.** It is not linked
from any navigation, has no PDPA consent flow, is not wired into the real "Sync MT5"
flow the app actually ships, and is not production-ready. Everything captured above
was measured against a live MetaApi account, and that account has since been fully
removed (verified independently via MetaApi's own REST API, not just this app's
response) to stop any further billing. **No further live MetaApi testing should happen
without an explicit go-ahead** — the two live runs this spike now has (one failed
auth against an unsupported pool, one successful connect + partial read against a real
broker with a real stability finding) are enough to inform a go/no-go decision without
running up further metered usage. Given the EA connector already ships and works today,
and this spike surfaced a real reliability gap (not just missing numbers) in the
per-call-reconnect pattern, the recommendation is unchanged: **stay EA-only for now**.
If this is revisited, the next concrete step is hardening `withRpcConnection` to reuse
one warm connection instead of one per call, then re-measuring positions/deal-history
latency against a real broker demo — not retrying against MetaQuotes-Demo, and not
without confirming budget for MetaApi's pay-as-you-go billing first.

---

# Beta graduation work (2026-09-08, after the spike closed)

The spike above recommended staying EA-only. The product decision made afterward was to
proceed toward a gated beta anyway, starting with fixing the one concrete reliability
gap the spike surfaced. This section (and the ones that follow it) document that work,
part by part.

## Reliability fix: session-scoped RPC connection reuse

**What was broken**: `CloudConnector`'s `withRpcConnection()` opened a brand-new RPC
connection (`account.getRPCConnection()` → `connect()` → `waitSynchronized(60)`) for
*every single call* to `getAccountSnapshot`/`getPositions`/`getDealHistory`, then closed
it in a `finally` block immediately after reading. Live test #2 (see above) hit this
directly: the `positions` call — the second read in the same session — opened a second
RPC connection from scratch, timed out after ~107s trying to resynchronize, and the
MetaApi-side account ended up `UNDEPLOYED` with no explicit undeploy ever issued by this
app. Repeatedly opening/closing RPC sockets against the same account in quick succession
wasn't just slow — it was actively destabilizing the account's own deployed state.

**The fix** (`tradingjournal-backend/src/mt5-cloud-spike/cloud-connector.ts`):

- `CloudConnector` now keeps a `Map<recordId, { connection, lastUsedAt }>` of one RPC
  connection per active session. `getOrCreateConnection()` returns the cached connection
  on a hit, or establishes one (and caches it) on a miss — `connect()` + `waitSynchronized()`
  now happen **once per session**, not once per call.
- The connection is torn down only on:
  1. **Explicit `disconnect()`** — closes the cached connection deterministically before
     revoking the MetaApi account and removing the local record.
  2. **Idle timeout** — a background reaper (checked every 60s) closes any session
     connection that's gone unused for 15 minutes (`IDLE_CONNECTION_TTL_MS`), so an
     abandoned browser tab doesn't leak an open MetaApi socket forever.
  3. **Module shutdown** (`onModuleDestroy`) — closes every still-open session
     connection, e.g. on a graceful app/test-module close.
- A read failure (timeout, disconnect, etc.) still **drops** the cached connection
  before rethrowing the mapped error — the next call re-establishes cleanly rather than
  retrying against a socket that may correspond to an account MetaApi has already torn
  down out of band. This preserves the spirit of the original bug's lesson: never trust
  a connection object just because it's still sitting in memory.
- `CloudConnector` now implements `OnModuleDestroy` and owns its own idle-reap interval
  (`unref()`'d so it doesn't keep the process alive).

**Test**: `src/mt5-cloud-spike/cloud-connector.spec.ts` (new), 4 cases, all passing:

1. **Reproduces the original failure sequence** — connect → account snapshot →
   positions → deal history, all in one session, no disconnect between (the exact
   sequence that failed live) — and asserts `getRPCConnection()`, `connect()`, and
   `waitSynchronized()` were each called **exactly once** for the whole sequence (the
   old code would have called each **three times**, once per read). Also asserts the
   connection is never closed mid-session, and the account is looked up via
   `getAccount()` only once (cache hit avoids re-fetching it on every read).
2. Disconnect closes the cached connection deterministically, revokes the MetaApi
   account, and removes the local record — and a subsequent read correctly
   re-establishes a fresh connection rather than reusing anything.
3. `onModuleDestroy()` closes any still-open session connection.
4. A read failure (simulated `TimeoutError`, mirroring the live positions timeout) drops
   the cached connection so the *next* call opens a fresh one instead of retrying a
   stale socket.

**Regression run after this fix** (2026-09-08): full backend suite — 525/525 passing
(including the 4 new cases above). Full frontend suite — 482/482 passing (untouched by
this change; run as a sanity check). `nest build` and `tsc --noEmit` both clean.

**What this test can't prove**: it mocks the MetaApi SDK, so it verifies the connector's
*own* connection-management logic (call counts, teardown timing, failure handling) —
not MetaApi's real network behavior. The next live run against a real broker demo (once
scheduled, with budget confirmed) is what will actually confirm the ~107s timeout and
silent-undeploy scenario no longer reproduces against the live service.

## On-demand deploy lifecycle (Part 2)

Part 1's session-scoped RPC connection cache fixed *reading* reliability but doesn't
control MetaApi's actual **hourly "deployed account" billing** — that's driven entirely
by whether the account is `DEPLOYED` on MetaApi's side, independent of whether this
app's process happens to hold an open RPC socket to it. This is the other half: the
MetaApi account is now deployed **only while genuinely in use**, not continuously.

**Backend** (`tradingjournal-backend/src/mt5-cloud-spike/`):

- `Mt5CloudSpikeRecord` (`credential-store.service.ts`) gained three fields:
  `lastActivityAt` (touched by every status/account/positions/deals/sync call —
  `CloudConnector.touchLastActivity()`), `deployState` (`'DEPLOYED' | 'UNDEPLOYED' |
  null`, a local best-effort mirror of MetaApi's real state, kept so the idle reaper
  doesn't have to call MetaApi on every sweep), and `consentAcceptedAt` (see "Beta UI"
  below).
- `CloudConnector.redeploy(ref, userId, reason)` — on-demand redeploy for a session that
  went idle: fire-and-forget `account.deploy()` (same pattern as the initial `connect()`
  deploy — deployment takes real wall-clock time, must not block the HTTP response),
  marks the record `DEPLOYED`, logs a `deploy` transition.
- `CloudConnector.undeploy(ref, userId, reason)` — the actual cost-control primitive:
  calls MetaApi's `account.undeploy()` (**not** `remove()` — the account and its
  credential stay intact for a future on-demand redeploy; this is a pause, not a
  revoke), drops any cached RPC connection first, marks the record `UNDEPLOYED`, logs an
  `undeploy` transition. Returns `false` (rather than throwing) if the MetaApi call
  itself fails, and deliberately does **not** update local `deployState` in that case —
  otherwise the idle reaper would give up retrying an account that might still be
  running (and billing) on MetaApi's side.
- `Mt5CloudConnectorIdleReaperService` (`mt5-cloud-connector-idle-reaper.service.ts`) —
  a `@Interval(60_000)` sweep (via `@nestjs/schedule`, already a dependency elsewhere in
  this app) that calls `undeploy(..., 'idle-timeout')` on any record whose
  `lastActivityAt` is older than the idle threshold. **Threshold is
  `deploy-idle.constants.ts`'s `DEFAULT_IDLE_UNDEPLOY_MS` = 5 minutes, overridable via
  `MT5_CLOUD_CONNECTOR_IDLE_UNDEPLOY_MS` (milliseconds) — this is a first guess, not a
  measured number, tune it once real usage data exists.**
- `DeployLogService` (`mt5-cloud-connector-deploy-log.service.ts`) — append-only audit
  trail (gitignored JSON file, same pattern as `CredentialStoreService` and for the same
  reason: no new migration on the shared DB for a still-gated beta feature) of every
  deploy/undeploy transition, with `reason` ∈ `connect` / `manual-refresh` /
  `auto-poll` / `idle-timeout` / `explicit-disconnect`. Exposed read-only via
  `GET /brokers/mt5-cloud-connector/deploy-log` and surfaced in the beta UI so real
  MetaApi usage can be audited against what the app actually did.
- `disconnect()` (Part 1, untouched in mechanism) now also logs an `undeploy` /
  `explicit-disconnect` entry — it already awaited `account.remove()` deterministically
  before this change (not fire-and-forget), so "make disconnect deterministic" per the
  Part 2 brief was already true; what changed is only that it's now logged too.

**The redeploy-on-demand round trip, as implemented**: `POST
/brokers/mt5-cloud-connector/:ref/sync?trigger=manual|auto` checks current MetaApi state
first — if already `CONNECTED`/`CONNECTING`, no-ops (just touches activity); otherwise
calls `redeploy()` and returns `{state:'CONNECTING', redeployed:true}`. The frontend then
polls `.../status` every 5s (same fast-poll pattern the original `connect()` flow
already used) until `CONNECTED`, then fetches account/positions/deals. This means "the
account stays deployed only while the page is open and polling" is implemented exactly
as literally as it sounds: the frontend's 60s keep-alive poll *is* the mechanism keeping
`lastActivityAt` fresh, and stopping that poll (tab closed, navigated away) is *all* that
triggers the idle reaper 5 minutes later — no explicit "page closed" signal exists or is
needed.

**Tests** (all passing): `cloud-connector.spec.ts` gained a second `describe` block (3
cases: `redeploy()` calls `deploy()` again and logs it; `undeploy()` calls `undeploy()`
(not `remove()`) and logs it; `undeploy()` failure leaves local state alone so the
reaper retries). New `mt5-cloud-connector-idle-reaper.service.spec.ts` (5 cases: sweeps
past-threshold records, leaves recent ones alone, skips never-touched records, respects
the env override, and one failing `undeploy()` doesn't stop the rest of the sweep from
running). New `mt5-cloud-connector-beta.guard.spec.ts` (9 cases covering the allowlist
parsing and the guard's allow/deny/404 behavior — see "Beta UI" below).

**Live-verified at the HTTP layer** (2026-09-08, no MetaApi account actually deployed —
just the gating and routing): with `MT5_CLOUD_CONNECTOR_BETA_USER_IDS` unset,
`beta-status` correctly returned `{"enabled":false}` and `GET
.../records`/`.../deploy-log` correctly 404'd for a real logged-in test user. Temporarily
allowlisting that one test user's id confirmed `{"enabled":true}` and both endpoints
returning `200 []`, then the env var was reverted to empty and a fresh restart confirmed
it went back to `{"enabled":false}` — the safe default holds.

## Beta UI: BrokerConnectionsPage.vue (Part 2)

A second connection method now exists on the **real** `/BrokerConnections` page (not the
`/dev` route) — `Mt5CloudConnectorCard.vue`
(`tradingjournal-frontend/src/components/broker/`), mounted by
`BrokerConnectionsPage.vue` only after calling `mt5CloudConnectorService.betaStatus()`
and getting `{enabled: true}`. Never wired into `ConnectMt5Wizard.vue` or any onboarding
flow — a parallel option next to the existing EA create-connection form, not a
replacement.

- **Broker picker**: `MT5_BROKER_PRESETS` (`src/constants/mt5-cloud-connector.constants.ts`)
  lists Exness / IC Markets / XM Global / Pepperstone / FTMO, each pre-filling a
  *suggested* server-name pattern into the server field on selection. The field stays
  free-text and editable regardless of what's picked — exact demo/real server names vary
  too much per broker and per account to lock down, per the brief. An "อื่นๆ (Other)"
  option leaves the field blank.
- **Consent checkbox**: the exact DRAFT copy given in the Part 2 brief, rendered with a
  visible "ฉบับร่าง — รอทีมกฎหมายอนุมัติ (DRAFT)" badge directly above it, and the same
  "DRAFT, pending sign-off" framing repeated in the code comment on
  `MT5_CLOUD_CONNECTOR_CONSENT_TEXT_DRAFT`. **Enforced server-side, not just a UI gate**:
  `ConnectMt5CloudConnectorDto.consentAccepted` must be `true` or `POST connect` rejects
  with 400 — a direct API call can't bypass the checkbox. The timestamp is persisted
  (`consentAcceptedAt`) for whenever the real legal-reviewed copy replaces this draft.
- **Existing connections persist across idle-undeploy** — `GET .../records` lists what
  the user already has (login/server/deployState/lastActivityAt, never the credential),
  so reopening the page after an idle-undeploy shows "idle (ยังไม่ deploy)" rather than
  forcing the investor password to be re-entered. Opening it auto-calls `sync('auto')`,
  which is what redeploys on demand if needed.
- **Loading state is honest about redeploy latency**: while `CONNECTING`, the UI shows
  elapsed seconds and an explicit "อาจใช้เวลาถึง ~1 นาทีสำหรับการ deploy ครั้งแรกหรือหลัง
  idle" note rather than a bare spinner — Live test #2 measured 6.2s on a warm connect,
  but the spike's first (failed) attempt took ~95s, so the UI does not promise a fast
  number it can't back up.
- **Audit log**: a "Deploy log" toggle on the active-session view lists that record's
  deploy/undeploy transitions (transition, reason, timestamp) from `DeployLogService`.
- **Gating** (`Mt5CloudConnectorBetaGuard`, `mt5-cloud-connector-beta.guard.ts`): every
  route except `beta-status` requires both `MT5_CLOUD_SPIKE_ENABLED=true` *and* the
  caller's user id in `MT5_CLOUD_CONNECTOR_BETA_USER_IDS` (comma-separated, **empty/unset
  by default — deliberately not defaulted to any account**). 404s either way, matching
  the dev spike's "doesn't exist" convention. `beta-status` alone only needs a valid JWT
  and returns nothing but a boolean, so the frontend can decide whether to render the
  entry point at all without leaking anything to non-beta users.
- **To actually use this**: set `MT5_CLOUD_CONNECTOR_BETA_USER_IDS=<your user id>` in
  `.env` and restart the backend (env vars are read once at boot, not hot-reloaded).

**Tests**: `Mt5CloudConnectorCard.spec.ts` (new, 7 cases — broker preset pre-fill and
free-text override; connect button gating on all four required fields; connect → poll →
load; existing-record auto-activation via `sync('auto')` on mount; manual refresh calls
`sync('manual')`; disconnect resets to the form; and the load-bearing one — **polling
stops on unmount**, verified by advancing fake timers 180s past unmount and confirming
no further `sync()` calls, which is the actual mechanism the whole idle-undeploy story
depends on). `BrokerConnectionsPage.spec.ts` gained 2 cases confirming the card is
hidden/shown based on `betaStatus()`'s response, with every prior test in that file
defaulting to `{enabled: false}` so this addition doesn't change any existing test's
behavior.

**Regression after Part 2** (2026-09-08): backend 542/542 passing (525 after Part 1 + 17
new: 3 deploy-lifecycle + 5 idle-reaper + 9 beta-guard), `nest build` clean. Frontend
491/491 passing (482 baseline + 2 gating + 7 card), `vue-tsc --noEmit` and `eslint` both
clean on every new/changed file.

## Live-test bug: "please top up your account" on connect (2026-09-09)

Connecting through the real `/BrokerConnections` page (`Mt5CloudConnectorCard.vue`, not
the dev spike page) failed with a MetaApi provisioning error surfaced verbatim to the
user:

```
To allow high reliability please top up your account
```

from `POST https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts`.

**Root cause**: `CloudConnector.connect()`'s `createAccount()` call (`cloud-connector.ts`,
originally ~line 128-137) set `type: 'cloud-g2'` but never set `reliability`. The MetaApi
SDK defaults `reliability` to `'high'`, which MetaApi gates behind a topped-up
MetaApi.cloud account — `'regular'` reliability has no such requirement and, per MetaApi's
pricing, costs roughly a third as much. Nothing about this app's use case (a single RPC
connection, polled read access) needs `'high'` reliability; the default was simply never
overridden.

**A second, related fact surfaced while investigating this** — MetaApi's FAQ documents
that deploying an account is billed in a **minimum 6-hour increment**, not per-minute.
This changes the on-demand deploy lifecycle's mental model from "the idle reaper
(`mt5-cloud-connector-idle-reaper.service.ts`) bounds our cost" to "the idle reaper bounds
*how much idle time we pay for within a 6-hour block* — it cannot make a deploy cost less
than one 6-hour block, and on its own does nothing to stop a session from rolling into a
*second* 6-hour block if it never satisfies the idle-timeout condition." That second case
is exactly what a browser tab left open does: the frontend's 60s keep-alive poll (see
"On-demand deploy lifecycle" above) counts as activity, so `lastActivityAt` never goes
stale and idle-timeout never fires for as long as the tab stays open — a forgotten tab
could otherwise deploy-and-bill indefinitely, one 6-hour block after another.

**Fix** (`tradingjournal-backend/src/mt5-cloud-spike/`):

1. `cloud-connector.ts`'s `createAccount()` call now passes `reliability: 'regular'`
   explicitly, with a comment explaining why (cheaper, no top-up requirement). New test
   in `cloud-connector.spec.ts` asserts the SDK is called with
   `expect.objectContaining({ reliability: 'regular' })`.
2. New hard cap, independent of the existing idle-timeout: `Mt5CloudSpikeRecord` gained a
   `deploySessionStartedAt` field (`credential-store.service.ts`), stamped fresh by both
   `connect()` and `redeploy()` and cleared back to `null` by `undeploy()` — unlike
   `lastActivityAt`, it is *never* refreshed by activity, so it tracks how long the
   current deploy session has actually run regardless of how often the tab polls.
   `Mt5CloudConnectorIdleReaperService.sweep()` now checks both thresholds per record: if
   idle-timeout doesn't trigger, it separately checks whether `deploySessionStartedAt` is
   older than `deploy-idle.constants.ts`'s new `DEFAULT_MAX_SESSION_MS` (6 hours,
   overridable via `MT5_CLOUD_CONNECTOR_MAX_SESSION_MS`) and undeploys with reason
   `'max-session-timeout'` if so — a distinct reason from `'idle-timeout'` in the deploy
   log, so the audit trail (`DeployLogService`, surfaced in the beta UI) shows which
   threshold actually fired. Default is set to exactly MetaApi's 6-hour billing minimum on
   purpose: a session that hits this cap gets undeployed before it can roll into a second
   billed block, bounding the worst case at one block per session even if idle-timeout
   never fires. 6 new tests in `mt5-cloud-connector-idle-reaper.service.spec.ts` cover:
   tripping the cap despite fresh activity, staying under the default cap, skipping
   records with no `deploySessionStartedAt` yet, respecting the env override, and
   idle-timeout taking precedence when both thresholds trip at once.
3. `mapSdkError()` (`cloud-connector.ts`) gained a message-based case (MetaApi returns
   this as a generic error, not a distinct named error class) that catches any error
   message containing `"top up"` and raises `Mt5ConnectorError` with a readable Thai
   message and a new `'BILLING_REQUIRED'` code, instead of falling through to `'UNKNOWN'`
   and showing MetaApi's raw English text to the user. Kept as a safety net even though
   fix #1 should make it unreachable in the common path — e.g. if MetaApi adds other
   billing-gated fields later, or a plan's limits change. New test in
   `cloud-connector.spec.ts` (`mapSdkError billing case` describe block) asserts
   `connect()` rejects with `{code: 'BILLING_REQUIRED'}` when `createAccount()` throws a
   "top up" error.

**Regression after this fix** (2026-09-09): `mt5-cloud-spike` suite (`cloud-connector.spec.ts`,
`mt5-cloud-connector-idle-reaper.service.spec.ts`, `mt5-cloud-connector-beta.guard.spec.ts`)
27/27 passing, including all pre-existing cases plus the new reliability/session-cap/
billing-error coverage above.

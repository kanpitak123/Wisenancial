# Wisenancial MT5 EA — Setup Guide

The Wisenancial MT5 EA is a **read-only account observer**. It reports your account balance/equity, open positions, and closed deals to Wisenancial over HTTPS. **It never places, modifies, or closes any order or position** — it cannot trade on your behalf.

Source: `mt5-ea/WisenancialMT5EA.mq5` (+ `WisenancialSync.mqh`, `WisenancialSequence.mqh`).

## 1. Requirements

- MetaTrader 5 desktop terminal (Windows; Wine/other platforms not tested).
- A Wisenancial account with an **MT5 broker connection** created in the web app (Settings → Broker Connections), which gives you an **API key**.
- Outbound HTTPS access from the machine running the terminal to your Wisenancial backend URL.

## 2. How to install the EA

1. In MetaTrader 5: **File → Open Data Folder**.
2. Copy `WisenancialMT5EA.mq5`, `WisenancialSync.mqh`, and `WisenancialSequence.mqh` into `MQL5\Experts\` (all three files **must be in the same folder** — the `.mq5` file `#include`s the other two by relative path).
3. In MetaEditor (or the terminal's Navigator panel), compile `WisenancialMT5EA.mq5`. It should compile with no errors.
4. In the terminal's **Navigator** panel, under **Expert Advisors**, you should now see `WisenancialMT5EA`.

## 3. How to configure the API URL

Drag the EA onto any chart (the chart/symbol/timeframe you attach it to doesn't matter — the EA doesn't look at chart data at all). In the **Inputs** tab:

- **InpApiBaseUrl** — your Wisenancial backend's base URL, e.g. `https://api.wisenancial.example.com` (no trailing slash — the EA appends `/brokers/mt/ingest` itself).

## 4. How to configure the API key

- **InpApiKey** — paste the API key shown once when you created the broker connection in the Wisenancial web app.

**This key is sensitive.** Treat it like a password:
- It authenticates as your broker connection and lets whoever holds it push account/position/trade data into your Wisenancial portfolio.
- It is stored in this EA's chart/template input settings, in plaintext, inside your MetaTrader data folder — anyone with access to this Windows user account or this MT5 terminal installation can read it back out.
- Protect the machine running this terminal the same way you'd protect any machine holding trading credentials (disk encryption, account password, no shared/public machines).
- If you ever suspect the key has leaked, rotate it from the Wisenancial web app (Broker Connections → Rotate Key) — the old key stops working immediately, and you'll need to paste the new one into this EA's inputs and reattach.
- The EA never prints this key, the `Authorization` header, or any other secret to the Experts log or the chart Comment — if you see it in a log somewhere, that log wasn't produced by this EA.

## 5. How to whitelist the WebRequest URL

MT5 blocks all outbound HTTP calls from EAs unless the exact host is whitelisted:

1. In the terminal: **Tools → Options → Expert Advisors**.
2. Check **"Allow WebRequest for listed URL"**.
3. Add your backend's base URL (the same value as `InpApiBaseUrl`), e.g. `https://api.wisenancial.example.com`.
4. Click OK.

If you skip this step, the EA's status Comment and Experts log will show a clear message telling you to do exactly this (error 4060) — it won't just silently time out.

## 6. How to attach the EA to MT5

1. Drag `WisenancialMT5EA` from the Navigator onto any chart.
2. In the dialog: **Common** tab — make sure "Allow Algo Trading" (or "Allow live trading") is checked (MT5 requires this for any EA to run its timer/event handlers, even a read-only one like this — no orders will ever actually be sent).
3. **Inputs** tab — set `InpApiBaseUrl` and `InpApiKey` (see §3/§4). Defaults for timing inputs are fine for most users.
4. Click OK. The chart should show a "Wisenancial MT5 EA" status Comment in the top-left, starting at `State: BOOTSTRAPPING`.

## 7. One EA instance per API key

**Run only one MT5 terminal instance with this EA + this API key attached at a time.** Two concurrent instances holding the same key will race on the sequence number that guards your position snapshots — the loser of any given cycle gets its update silently skipped (it self-heals on the next cycle, but you'll see redundant "stale/duplicate" messages and occasionally-delayed sync). If you run multiple MT5 accounts, create a **separate broker connection and API key for each one** in the Wisenancial web app, and attach one EA instance per account/key.

## 8. Account/server identity behavior

The EA always reads the account currently logged into the terminal (`AccountInfoInteger(ACCOUNT_LOGIN)` / `AccountInfoString(ACCOUNT_SERVER)`) — it never trusts anything you type in as account identity. The **first** successful sync for a given API key permanently pins that account+server to the connection on the backend (trust-on-first-use). Every request after that is checked against the pin.

If you ever attach this EA (with a given API key) to a **different** MT5 account/server than the one it was first used with, the backend will reject it and the EA will show **`State: ACCOUNT MISMATCH`** and stop syncing entirely — no data is sent under the wrong account. This is deliberate: the EA does **not** attempt to automatically "migrate" a connection to a new account. If you intend to switch which account this connection tracks, create a new broker connection (and new API key) in the web app for the new account instead of reusing the old key.

## 9. Portfolio binding requirement

A broker connection only becomes active for syncing once you've bound it to a portfolio in the Wisenancial web app (Broker Connections → bind to a portfolio). Until then, the EA shows **`State: WAITING FOR PORTFOLIO`** — it keeps sending lightweight heartbeats (so you can see it's alive and correctly authenticated) but won't attempt to send account/position/deal data. Once you bind the portfolio, the EA picks this up automatically on its next heartbeat (within `InpHeartbeatIntervalSeconds`) and starts syncing.

## 10. What the EA syncs

- Account balance/equity/margin/currency/leverage (periodically).
- Every currently open position, in full, on every sync — not incremental.
- Closed deals (partial and full closes) as they happen, matched to their position.

## 11. What it does NOT sync

- **No pending orders** (limit/stop orders) — only positions and executed deals.
- **No trading actions of any kind** — this EA cannot open, modify, or close anything.
- **No true hedging-account netting semantics.** MT5's `OUT_BY` deal type (used on hedging accounts when one position is closed against an opposite one) is recorded using the profit/commission/swap MT5 itself reports for that deal, attached only to its own position — the EA/backend do not attempt to reconstruct which two positions were netted against each other.

## 12. Historical import limitation

**This EA is not a historical importer.** On first attach, it reconciles only what's needed to represent your *currently open* positions correctly plus a short recovery window — it does not upload your account's entire trading history. If you want historical (already-closed, from before this EA was ever attached) trades in Wisenancial, use the application's existing **manual/CSV import** workflow — that is a separate, independent feature from MT5 sync, and the two will never create duplicate rows for the same trade (they're tracked as different data sources).

## 13. Troubleshooting common HTTP errors

The EA's chart Comment always shows its current state and last error. States and what they mean:

| State | Meaning | What to do |
|---|---|---|
| `BOOTSTRAPPING` | Just attached, waiting for the first timer cycle | Normal — should resolve within a few seconds |
| `WAITING FOR PORTFOLIO` | Connected, but not bound to a portfolio yet | Bind the connection to a portfolio in the web app (§9) |
| `CONNECTED` | Normal operation | Nothing to do |
| `BACKOFF` (shown alongside another state) | A recent request failed transiently (network blip, timeout, 429, 5xx) | Usually resolves on its own — the EA is retrying with increasing delay, not hammering the server |
| `AUTH ERROR` | HTTP 401 — the API key is invalid or was revoked/rotated | Get the current key from the web app and update `InpApiKey`, then reattach the EA |
| `CONFIG ERROR` | HTTP 400/413/other — a request was rejected for a reason other than account mismatch (e.g. clock skew, or in the rare case of a genuinely oversized payload) | Check the "Last error" line in the Comment and the Experts log for the exact message; verify your PC's clock is correct |
| `ACCOUNT MISMATCH` | This account/server doesn't match what this API key was first used with | See §8 — do not reuse the key across accounts; create a new connection instead |

Additional specific cases:
- **"WebRequest ถูกปฏิเสธ (error 4060)"** — the URL isn't whitelisted yet; see §5.
- **HTTP 413** — the request was too large. Practically shouldn't happen (the route accepts payloads well beyond any normal account's size), but if it does, it's logged loudly and the EA will not retry the identical payload or send a partial position snapshot — check the Experts log and contact support if this persists.

## 14. How to rotate/reconfigure the API key safely

1. In the Wisenancial web app: Broker Connections → the connection → **Rotate Key**. The old key stops working immediately.
2. In MT5, open the EA's Inputs (right-click the chart → Expert Advisors → Properties, or re-drag the EA), update `InpApiKey` to the new value, click OK.
3. The EA will show `AUTH ERROR` briefly (from the old key failing, if the rotate happened before you updated the input) and then recover on its own once the new key is in place and the next heartbeat succeeds — no separate "reset" step needed. If you already had it in `AUTH ERROR` state, it re-checks every ~10 minutes automatically, or you can just reattach the EA to retry immediately.

## Known limitations (for maintainers)

- Trade timestamps (`openedAt`/`executedAt`) reflect the MT5 trade server's own clock, which may not be true UTC (many brokers run UTC+2/UTC+3). This is informational/display-only — it does not affect ordering or idempotency, which use `snapshotSequence` and `dealTicket` instead, both unaffected by this.
- The EA's `ACCOUNT MISMATCH` classification is a best-effort match on a substring ("TOFU") of the backend's current error message text for that specific rejection. If that backend message text changes, mismatches degrade gracefully to the generic `CONFIG ERROR` state (still safe — sync stops, the raw error is shown, no data is misattributed) but lose the more specific label. A machine-readable error code on the backend's error responses would remove this coupling; recommended as a small follow-up, not implemented in this phase.
- JSON handling in the EA is hand-rolled (targeted builders/readers for this project's own fixed payload shapes), not a general-purpose JSON library — see the header comment in `WisenancialSync.mqh` for why that's the right amount of engineering here.

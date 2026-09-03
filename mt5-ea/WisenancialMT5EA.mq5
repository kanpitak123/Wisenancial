//+------------------------------------------------------------------------+
//|                                                WisenancialMT5EA.mq5    |
//|                                                                        |
//| Read-only MT5 account observer for Wisenancial — reports account       |
//| snapshots, open-position snapshots, and closed-deal history to the     |
//| backend over HTTPS. This EA never places, modifies, or closes any      |
//| order/position — it only reads MT5 state and reports it. See item 6 of |
//| the Phase 3J spec ("The EA is read-only... no trading/order execution").|
//|                                                                        |
//| Backend: POST /brokers/mt/ingest (Bearer API key) — see                |
//| tradingjournal-backend/src/brokers/ingestion/ for the authoritative    |
//| contract this EA implements against (DTOs, TOFU account pinning,       |
//| snapshotSequence gating, closing-by-absence). Do not change the shapes |
//| built here without re-checking that contract first.                   |
//|                                                                        |
//| FILE RESPONSIBILITIES (kept deliberately separate):                    |
//|   WisenancialMT5EA.mq5   - event handlers, state machine, MT5 data     |
//|                            collection, scheduling/backoff, orchestration|
//|   WisenancialSync.mqh    - HTTP transport, JSON building/parsing        |
//|   WisenancialSequence.mqh - snapshotSequence local persistence/bootstrap|
//| No business logic that belongs to the backend (accounting, closing-by- |
//| absence, dedupe) is duplicated here — this EA reports raw MT5 state    |
//| and lets the backend decide what to do with it.                       |
//|                                                                        |
//| PROTOCOL-CRITICAL RULES — do not violate these when editing:           |
//|   1. WebRequest() is called ONLY from OnTimer() (via Sync.mqh). Never  |
//|      from OnInit/OnDeinit/OnTradeTransaction — WebRequest is           |
//|      synchronous/blocking; calling it anywhere else either delays      |
//|      EA attachment (OnInit) or risks overflowing the 1024-deep trade-  |
//|      transaction queue (OnTradeTransaction — see MQL5 docs).           |
//|   2. Every FULL positions snapshot must be genuinely complete — never  |
//|      send a partial/truncated positions[] under any circumstance,      |
//|      including a 413. The backend's closing-by-absence treats an      |
//|      accepted FULL snapshot's positions[] as authoritative truth.      |
//|   3. snapshotSequence is persisted locally BEFORE the request carrying |
//|      it is sent, and is never reused after a rejection — see           |
//|      WisenancialSequence.mqh's header for the full rationale.          |
//|   4. Never Sleep() inside OnTimer for retry pacing — use timestamp-    |
//|      gated state instead (g_nextAllowedAttempt).                       |
//+------------------------------------------------------------------------+
#property copyright "Wisenancial"
#property version   "1.00"

#include "WisenancialSync.mqh"
#include "WisenancialSequence.mqh"

//===========================================================================
// Inputs
//===========================================================================

input group "Connection";
input string InpApiBaseUrl                  = "https://api.wisenancial.example.com"; // Backend base URL (no trailing slash) - EA appends /brokers/mt/ingest
input string InpApiKey                      = "";  // API key (Bearer token) for this broker connection - SENSITIVE, see docs/mt5-ea-setup.md
input string InpClientVersion               = "1.0.0"; // reported as clientId = "WisenancialMT5EA/<this>" - diagnostic only, not security-relevant

input group "Timing";
input int    InpTimerIntervalSeconds        = 5;   // OnTimer cadence - the only place WebRequest runs (min 1)
input int    InpWebRequestTimeoutMs         = 8000; // WebRequest timeout in milliseconds
input int    InpHeartbeatIntervalSeconds    = 60;  // minimum gap between HEARTBEAT sends in STEADY state
input int    InpForcedReconcileIntervalSeconds = 60; // periodic full-reconcile safety net even when nothing is "dirty"

input group "Diagnostics";
input bool   InpDebugLogging                = false; // verbose Print() logging - never logs the API key or Authorization header

//===========================================================================
// Constants
//===========================================================================

#define WNC_MAX_POSITIONS               2000   // matches Mt5PositionsSnapshotPayloadDto's ArrayMaxSize
#define WNC_MAX_DEALS_PER_RECONCILE     3000   // split-path trigger - backend's RECONCILE cap is 5000; split well before it
#define WNC_DEAL_BATCH_SIZE             1000   // per-request size when splitting (backend's standalone DEALS cap is 2000)
#define WNC_FATAL_POLL_INTERVAL_SECONDS 600    // 10 min slow poll for FATAL_AUTH / CONFIG_ERROR recovery checks
#define WNC_INITIAL_DEAL_LOOKBACK_SECONDS 86400 // 24h - only used when there are no open positions to anchor the deal watermark to

//===========================================================================
// State machine
//===========================================================================

enum WNC_STATE
{
   WNC_STATE_NEEDS_BOOTSTRAP,
   WNC_STATE_WAITING_FOR_PORTFOLIO,
   WNC_STATE_STEADY,
   WNC_STATE_FATAL_AUTH,
   WNC_STATE_CONFIG_ERROR,
   WNC_STATE_ACCOUNT_MISMATCH
};

enum WNC_FAILURE_ACTION
{
   WNC_FAIL_TRANSIENT,
   WNC_FAIL_FATAL_AUTH,
   WNC_FAIL_WAITING_FOR_PORTFOLIO,
   WNC_FAIL_ACCOUNT_MISMATCH,
   WNC_FAIL_CONFIG_ERROR
};

//===========================================================================
// EA-instance state (reset every OnInit — nothing here is trusted to
// survive a restart; anything that must survive a restart lives in
// WisenancialSequence.mqh's GlobalVariable, not here)
//===========================================================================

WNC_STATE g_state;
bool      g_dirty;
bool      g_syncInProgress;

long      g_connectionId;          // -1 = unknown (not yet learned from a heartbeat response)
bool      g_portfolioBound;
long      g_nextSequence;          // -1 = not bootstrapped yet this session
datetime  g_dealWatermark;         // 0 = not established yet

datetime  g_lastHeartbeatAttempt;
datetime  g_lastReconcileAttempt;
datetime  g_lastSuccessfulSync;
datetime  g_lastFatalPollAttempt;

int       g_consecutiveFailures;
datetime  g_nextAllowedAttempt;
string    g_lastErrorMessage;

string    g_clientId;

//===========================================================================
// MT5 event handlers
//===========================================================================

int OnInit()
{
   g_state = WNC_STATE_NEEDS_BOOTSTRAP;
   g_dirty = false;
   g_syncInProgress = false;
   g_connectionId = -1;
   g_portfolioBound = false;
   g_nextSequence = -1;
   g_dealWatermark = 0;
   g_lastHeartbeatAttempt = 0;
   g_lastReconcileAttempt = 0;
   g_lastSuccessfulSync = 0;
   g_lastFatalPollAttempt = 0;
   g_consecutiveFailures = 0;
   g_nextAllowedAttempt = 0;
   g_lastErrorMessage = "";

   if (StringLen(InpApiKey) == 0)
   {
      Print("[Wisenancial] InpApiKey is empty - set the broker connection's API key (Input tab) before attaching this EA");
      Comment("Wisenancial MT5 EA\nState: CONFIG ERROR\nInpApiKey is empty - see input parameters");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if (StringLen(InpApiBaseUrl) == 0)
   {
      Print("[Wisenancial] InpApiBaseUrl is empty");
      Comment("Wisenancial MT5 EA\nState: CONFIG ERROR\nInpApiBaseUrl is empty - see input parameters");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if (InpTimerIntervalSeconds < 1)
   {
      Print("[Wisenancial] InpTimerIntervalSeconds must be >= 1 (EventSetTimer's minimum granularity)");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if (MQLInfoInteger(MQL_TESTER))
   {
      // WebRequest is unavailable in the Strategy Tester per MQL5 docs - this
      // EA has nothing useful to do there. Not a hard failure - just a heads up.
      Print("[Wisenancial] running under the Strategy Tester - WebRequest is not available here, sync will never succeed");
   }

   g_clientId = "WisenancialMT5EA/" + Wnc_TruncateForDto(InpClientVersion, 80);

   // NO WebRequest() here - OnInit must stay fast/synchronous. The first
   // OnTimer tick performs the actual bootstrap (HEARTBEAT etc).
   EventSetTimer(InpTimerIntervalSeconds);

   Comment("Wisenancial MT5 EA\nState: BOOTSTRAPPING\n(waiting for first timer cycle)");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   // Force-destroyed automatically if not killed (per MQL5 docs), but explicit
   // is correct practice and avoids any ambiguity across a fast deinit/init cycle.
   EventKillTimer();

   g_syncInProgress = false;
   g_dirty = false;

   if (InpDebugLogging) Print("[Wisenancial] OnDeinit reason=", Wnc_DeinitReasonLabel(reason));

   if (reason == REASON_ACCOUNT)
   {
      // Item 6 / item 11: do not invent an automatic account-switch migration.
      // If this EA reinitializes (OnInit) under a different MT5 account than
      // the one last confirmed for this API key's connection, DoBootstrap()
      // will detect the backend's TOFU rejection and enter ACCOUNT_MISMATCH -
      // no data will be sent under the wrong account.
      Print("[Wisenancial] account/terminal context is changing (REASON_ACCOUNT) - on reinit this EA will "
            "refuse to sync if the new account doesn't match what was previously confirmed for this API key.");
   }

   Comment(""); // don't leave a stale status comment on the chart after removal
}

void OnTimer()
{
   // Defensive re-entrancy guard. MQL5 event handlers for one program
   // instance run sequentially (the terminal won't re-enter OnTimer while a
   // previous call is still executing for the same chart/EA), but this is
   // cheap insurance against a long-running WebRequest bumping into the next
   // tick, and it costs nothing when everything is running normally.
   if (g_syncInProgress) return;

   g_syncInProgress = true;
   Wnc_RunStateMachineTick();
   g_syncInProgress = false;
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   // Lightweight ONLY - see file header rule #1. No WebRequest, no Sleep, no
   // history/position enumeration here. The next OnTimer tick does the work.
   g_dirty = true;
}

// OnTick() is intentionally not implemented - this EA is timer-driven only.

//===========================================================================
// State machine driver
//===========================================================================

void Wnc_RunStateMachineTick()
{
   if (TimeCurrent() < g_nextAllowedAttempt)
   {
      Wnc_UpdateStatusComment();
      return; // backoff window still open - do nothing this tick
   }

   switch (g_state)
   {
      case WNC_STATE_NEEDS_BOOTSTRAP:       Wnc_DoBootstrap();           break;
      case WNC_STATE_WAITING_FOR_PORTFOLIO: Wnc_DoWaitingForPortfolio(); break;
      case WNC_STATE_STEADY:                Wnc_DoSteadyStateTick();     break;
      case WNC_STATE_FATAL_AUTH:            Wnc_DoFatalPoll();           break;
      case WNC_STATE_CONFIG_ERROR:          Wnc_DoFatalPoll();           break;
      case WNC_STATE_ACCOUNT_MISMATCH:
         // No automatic recovery by design (item 6/11) - only a fresh EA
         // reattach (OnInit) re-enters the bootstrap path. No network calls here.
         break;
      default:
         break;
   }

   Wnc_UpdateStatusComment();
}

//---------------------------------------------------------------------------
// NEEDS_BOOTSTRAP - run on every OnInit (first timer cycle after attach,
// restart, reconnect, or recovering from FATAL_AUTH/CONFIG_ERROR) and again
// whenever a positions send comes back accepted:false. Exactly one algorithm
// covers "first ever run" and "the 500th restart" identically - see item 11.
//---------------------------------------------------------------------------
void Wnc_DoBootstrap()
{
   WncIngestResponse resp;
   WncHttpResult http;

   if (!Wnc_SendHeartbeat(resp, http))
   {
      if (http.outcome == WNC_HTTP_OK) Wnc_HandleMalformedResponse("bootstrap heartbeat");
      else Wnc_HandleFailure(http);
      return;
   }

   if (!resp.hasConnection)
   {
      Wnc_HandleMalformedResponse("bootstrap heartbeat (no connection object)");
      return;
   }

   g_connectionId = resp.connection.id;
   g_portfolioBound = resp.connection.hasPortfolioId;

   long serverSeq = resp.connection.hasLastSnapshotSequence ? resp.connection.lastSnapshotSequence : -1;
   g_nextSequence = Wnc_BootstrapNextSequence(g_connectionId, true, serverSeq);

   Wnc_ResetBackoff();
   g_lastErrorMessage = "";

   if (!g_portfolioBound)
   {
      g_state = WNC_STATE_WAITING_FOR_PORTFOLIO;
      return;
   }

   // Portfolio is bound - perform the startup/recovery reconciliation
   // immediately within this same tick, before declaring STEADY (item 11
   // step 8). forceFullBacklog=true anchors the deal watermark to each open
   // position's own open time (or a bounded 24h lookback if flat) rather
   // than an arbitrary "since last run" guess.
   bool ok = Wnc_SendPositionsAndDealsSplitOrCombined(true);
   if (ok)
   {
      g_state = WNC_STATE_STEADY;
      g_dirty = false;
      g_lastSuccessfulSync = TimeCurrent();
      g_lastReconcileAttempt = TimeCurrent();
   }
   // On failure: stay in NEEDS_BOOTSTRAP. Wnc_SendPositionsAndDealsSplitOrCombined
   // already reported the failure (state/backoff) internally.
}

//---------------------------------------------------------------------------
// WAITING_FOR_PORTFOLIO - heartbeat-only cadence, re-checking portfolio_id.
// No POSITIONS_SNAPSHOT/DEALS/RECONCILE attempts here - they'd just 403
// repeatedly for no benefit (assertPortfolioBound on the backend).
//---------------------------------------------------------------------------
void Wnc_DoWaitingForPortfolio()
{
   if (TimeCurrent() - g_lastHeartbeatAttempt < InpHeartbeatIntervalSeconds) return;

   WncIngestResponse resp;
   WncHttpResult http;

   if (!Wnc_SendHeartbeat(resp, http))
   {
      if (http.outcome == WNC_HTTP_OK) Wnc_HandleMalformedResponse("waiting-for-portfolio heartbeat");
      else Wnc_HandleFailure(http);
      return;
   }
   if (!resp.hasConnection)
   {
      Wnc_HandleMalformedResponse("waiting-for-portfolio heartbeat (no connection object)");
      return;
   }

   Wnc_ResetBackoff();
   g_portfolioBound = resp.connection.hasPortfolioId;

   if (!g_portfolioBound) return; // still waiting - nothing more to do this tick

   long serverSeq = resp.connection.hasLastSnapshotSequence ? resp.connection.lastSnapshotSequence : -1;
   g_nextSequence = Wnc_BootstrapNextSequence(g_connectionId, true, serverSeq);

   bool ok = Wnc_SendPositionsAndDealsSplitOrCombined(true);
   if (ok)
   {
      g_state = WNC_STATE_STEADY;
      g_dirty = false;
      g_lastSuccessfulSync = TimeCurrent();
      g_lastReconcileAttempt = TimeCurrent();
   }
   else
   {
      g_state = WNC_STATE_NEEDS_BOOTSTRAP; // clean retry path next cycle
   }
}

//---------------------------------------------------------------------------
// STEADY - normal operation. Heartbeat periodically; sync when dirty or on
// the forced-reconcile safety-net interval, whichever comes first. Never
// clears dirty on a failed sync (item 13).
//---------------------------------------------------------------------------
void Wnc_DoSteadyStateTick()
{
   bool needSync = g_dirty || (TimeCurrent() - g_lastReconcileAttempt >= InpForcedReconcileIntervalSeconds);

   if (needSync)
   {
      bool ok = Wnc_SendPositionsAndDealsSplitOrCombined(false);
      g_lastReconcileAttempt = TimeCurrent();
      if (ok)
      {
         g_dirty = false;
         g_lastSuccessfulSync = TimeCurrent();
         Wnc_ResetBackoff();
      }
      // on failure g_dirty is left as-is (still true if it was set) so the
      // next tick retries the same work; Wnc_SendPositionsAndDealsSplitOrCombined
      // already applied backoff/state transition internally
      return; // at most one network-touching action per tick
   }

   bool needHeartbeat = (TimeCurrent() - g_lastHeartbeatAttempt >= InpHeartbeatIntervalSeconds);
   if (needHeartbeat)
   {
      WncIngestResponse resp;
      WncHttpResult http;
      if (!Wnc_SendHeartbeat(resp, http))
      {
         if (http.outcome == WNC_HTTP_OK) Wnc_HandleMalformedResponse("steady-state heartbeat");
         else Wnc_HandleFailure(http);
         return;
      }
      if (resp.hasConnection)
      {
         g_portfolioBound = resp.connection.hasPortfolioId;
         if (!g_portfolioBound)
         {
            // portfolio was unbound after being bound (e.g. via the web UI) -
            // stop attempting snapshot/deal sends until it's rebound
            g_state = WNC_STATE_WAITING_FOR_PORTFOLIO;
            return;
         }
      }
      Wnc_ResetBackoff();
   }
}

//---------------------------------------------------------------------------
// FATAL_AUTH / CONFIG_ERROR share this slow-poll recovery check - both are
// "something needs the user's attention, stop hammering the backend" states.
// A successful heartbeat means whatever was wrong is no longer true, so we
// return to NEEDS_BOOTSTRAP rather than assume anything about current state.
//---------------------------------------------------------------------------
void Wnc_DoFatalPoll()
{
   if (TimeCurrent() - g_lastFatalPollAttempt < WNC_FATAL_POLL_INTERVAL_SECONDS) return;
   g_lastFatalPollAttempt = TimeCurrent();

   WncIngestResponse resp;
   WncHttpResult http;
   if (!Wnc_SendHeartbeat(resp, http))
   {
      if (http.outcome == WNC_HTTP_OK) Wnc_HandleMalformedResponse("fatal-state recovery poll");
      else Wnc_HandleFailure(http); // may re-confirm the same (or a different) fatal-ish state
      return;
   }

   Print("[Wisenancial] recovery heartbeat succeeded - leaving fatal state, re-bootstrapping");
   g_state = WNC_STATE_NEEDS_BOOTSTRAP;
   Wnc_ResetBackoff();
   g_lastErrorMessage = "";
}

//===========================================================================
// HTTP send helpers (thin wrappers around Sync.mqh — every WebRequest call
// in this EA funnels through Wnc_PostIngest)
//===========================================================================

bool Wnc_SendHeartbeat(WncIngestResponse &resp, WncHttpResult &http)
{
   g_lastHeartbeatAttempt = TimeCurrent();

   string envelope = Wnc_BuildEnvelope("HEARTBEAT", "{}", CurrentAccountLogin(), CurrentAccountServer(), g_clientId);
   http = Wnc_PostIngest(InpApiBaseUrl, InpApiKey, InpWebRequestTimeoutMs, envelope);

   if (http.outcome != WNC_HTTP_OK) return false;
   if (!Wnc_ParseIngestResponse(http.body, resp)) return false;
   return true;
}

// Sends a standalone FULL POSITIONS_SNAPSHOT (used only by the split-deal-
// batches path's final step — item 9/11: the FULL snapshot itself is never
// split, only ever sent whole).
bool Wnc_SendPositionsSnapshot(WncPosition &positions[], const int positionCount)
{
   string positionsJson[];
   ArrayResize(positionsJson, positionCount);
   for (int i = 0; i < positionCount; i++) positionsJson[i] = Wnc_BuildPositionJson(positions[i]);

   long sequenceToUse = g_nextSequence;
   Wnc_PersistLocalSequence(g_connectionId, sequenceToUse); // persist BEFORE send - see Sequence.mqh header
   g_nextSequence = sequenceToUse + 1; // advance regardless of outcome below - never reused

   string snapshotId = Wnc_GenerateSnapshotId();
   string payload = Wnc_BuildPositionsSnapshotPayload(positionsJson, positionCount, sequenceToUse, snapshotId);
   string envelope = Wnc_BuildEnvelope("POSITIONS_SNAPSHOT", payload, CurrentAccountLogin(), CurrentAccountServer(), g_clientId);

   WncHttpResult http = Wnc_PostIngest(InpApiBaseUrl, InpApiKey, InpWebRequestTimeoutMs, envelope);
   if (http.outcome != WNC_HTTP_OK) { Wnc_HandleFailure(http); return false; }

   WncIngestResponse resp;
   if (!Wnc_ParseIngestResponse(http.body, resp)) { Wnc_HandleMalformedResponse("positions_snapshot"); return false; }

   if (resp.hasAccepted && !resp.accepted)
   {
      // Stale/duplicate per the backend's snapshotSequence gate - not a
      // transport/HTTP error, but also not applied. Item 7/16: do not retry
      // with the same sequence; re-bootstrap next cycle instead.
      g_state = WNC_STATE_NEEDS_BOOTSTRAP;
      g_lastErrorMessage = StringFormat(
         "positions snapshot (sequence %d) ถูกปฏิเสธเป็น stale/duplicate โดย backend - bootstrap ใหม่รอบถัดไป",
         sequenceToUse);
      return false;
   }

   return true;
}

//===========================================================================
// Data collection from MT5
//===========================================================================

int Wnc_CollectPositions(WncPosition &out[])
{
   ArrayResize(out, 0);
   int count = 0;
   int total = PositionsTotal();

   for (int i = 0; i < total && count < WNC_MAX_POSITIONS; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (!PositionSelectByTicket(ticket)) continue;

      WncPosition p;
      p.positionTicket = (long)ticket;
      p.symbol = Wnc_TruncateForDto(PositionGetString(POSITION_SYMBOL), 30);
      p.direction = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "LONG" : "SHORT";
      p.volume = PositionGetDouble(POSITION_VOLUME);
      p.openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      p.currentPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
      p.sl = PositionGetDouble(POSITION_SL);
      p.tp = PositionGetDouble(POSITION_TP);
      p.swap = PositionGetDouble(POSITION_SWAP);
      p.profit = PositionGetDouble(POSITION_PROFIT);
      p.openedAt = (datetime)PositionGetInteger(POSITION_TIME);

      ArrayResize(out, count + 1);
      out[count] = p;
      count++;
   }

   if (total > WNC_MAX_POSITIONS)
   {
      Print(StringFormat(
         "[Wisenancial] WARNING: %d open positions but only %d were included (DTO cap) - "
         "the snapshot sent this cycle is NOT complete. This should not happen in normal use.",
         total, WNC_MAX_POSITIONS));
   }

   return count;
}

string Wnc_MapDealEntry(const int entry)
{
   // MQL5's switch() only accepts int/uint expressions (not long) — entry is
   // narrowed to int at the call site; DEAL_ENTRY_* ordinals are tiny (0-3),
   // so this is always a safe, lossless narrowing.
   switch (entry)
   {
      case DEAL_ENTRY_IN:    return "IN";
      case DEAL_ENTRY_OUT:   return "OUT";
      case DEAL_ENTRY_INOUT: return "INOUT";
      case DEAL_ENTRY_OUT_BY:return "OUT_BY"; // no client-side pairing/netting attempted - see file header
      default:               return "IN"; // shouldn't occur for BUY/SELL trade deals; safe fallback
   }
}

// Collects trade deals (BUY/SELL only — balance/credit/charge/correction/
// bonus entries are deliberately excluded, they have no symbol/position and
// aren't part of this DTO) executed at or after `fromTime`.
int Wnc_CollectDealsSince(const datetime fromTime, WncDeal &out[])
{
   ArrayResize(out, 0);
   if (!HistorySelect(fromTime, TimeCurrent())) return 0;

   int total = HistoryDealsTotal();
   int count = 0;

   for (int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if (ticket == 0) continue;

      long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if (dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      long positionId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      if (positionId == 0) continue; // not tied to a position - nothing to attach it to

      WncDeal d;
      d.dealTicket = (long)ticket;
      d.orderTicket = (long)HistoryDealGetInteger(ticket, DEAL_ORDER);
      d.positionTicket = positionId;
      d.symbol = Wnc_TruncateForDto(HistoryDealGetString(ticket, DEAL_SYMBOL), 30);
      d.entryType = Wnc_MapDealEntry((int)HistoryDealGetInteger(ticket, DEAL_ENTRY));
      d.volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      d.price = HistoryDealGetDouble(ticket, DEAL_PRICE);
      d.commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      d.swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
      d.profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      d.executedAt = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      ArrayResize(out, count + 1);
      out[count] = d;
      count++;
   }

   return count;
}

// Historical scope (item 12): this EA is not an importer. The initial
// (first-ever) deal lookback is anchored to the earliest currently-open
// position's own open time — exactly enough to reconcile what's open right
// now — or a bounded 24h window if the account is flat. Existing historical
// CLOSED trades from before this EA was ever attached are out of scope; the
// application's existing manual/import workflow remains the tool for that.
datetime Wnc_ComputeInitialDealWatermark()
{
   datetime earliest = 0;
   int total = PositionsTotal();
   for (int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (!PositionSelectByTicket(ticket)) continue;
      datetime openedAt = (datetime)PositionGetInteger(POSITION_TIME);
      if (earliest == 0 || openedAt < earliest) earliest = openedAt;
   }
   if (earliest == 0) earliest = TimeCurrent() - WNC_INITIAL_DEAL_LOOKBACK_SECONDS;
   return earliest;
}

//===========================================================================
// The one sync primitive used both at startup/recovery and in steady state
// (item 9/11) — always sends a genuinely FULL positions snapshot; decides
// between one RECONCILE request and the DEALS-batches-then-POSITIONS_SNAPSHOT
// split path purely based on how many pending deals there are.
//===========================================================================

bool Wnc_SendPositionsAndDealsSplitOrCombined(const bool forceFullBacklog)
{
   WncAccountSnapshot acc;
   acc.accountLogin = CurrentAccountLogin();
   acc.balance = AccountInfoDouble(ACCOUNT_BALANCE);
   acc.equity = AccountInfoDouble(ACCOUNT_EQUITY);
   acc.margin = AccountInfoDouble(ACCOUNT_MARGIN);
   acc.marginFree = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   acc.marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   acc.credit = AccountInfoDouble(ACCOUNT_CREDIT);
   acc.currency = Wnc_TruncateForDto(AccountInfoString(ACCOUNT_CURRENCY), 10);
   acc.leverage = (double)AccountInfoInteger(ACCOUNT_LEVERAGE);
   // Note: this is a report of broker-side account vitals only. The backend
   // never treats it as authoritative for Wisenancial's own portfolio/ledger
   // calculations (item 15) - it's informational/connection-health data.

   WncPosition positions[];
   int positionCount = Wnc_CollectPositions(positions);

   datetime fromTime = (g_dealWatermark > 0) ? g_dealWatermark : Wnc_ComputeInitialDealWatermark();
   WncDeal deals[];
   int dealCount = Wnc_CollectDealsSince(fromTime, deals);

   datetime newWatermark = fromTime;
   for (int i = 0; i < dealCount; i++)
      if (deals[i].executedAt > newWatermark) newWatermark = deals[i].executedAt;

   if (dealCount > WNC_MAX_DEALS_PER_RECONCILE)
   {
      if (InpDebugLogging)
         Print(StringFormat("[Wisenancial] %d pending deals exceeds split threshold - sending in batches of %d", dealCount, WNC_DEAL_BATCH_SIZE));

      int sent = 0;
      while (sent < dealCount)
      {
         int batchSize = (int)MathMin(WNC_DEAL_BATCH_SIZE, dealCount - sent);

         string dealsJson[];
         ArrayResize(dealsJson, batchSize);
         for (int j = 0; j < batchSize; j++) dealsJson[j] = Wnc_BuildDealJson(deals[sent + j]);

         string payload = Wnc_BuildDealsPayload(dealsJson, batchSize);
         string envelope = Wnc_BuildEnvelope("DEALS", payload, acc.accountLogin, CurrentAccountServer(), g_clientId);

         WncHttpResult http = Wnc_PostIngest(InpApiBaseUrl, InpApiKey, InpWebRequestTimeoutMs, envelope);
         if (http.outcome != WNC_HTTP_OK)
         {
            // Abort remaining batches this tick. Do NOT send the final positions
            // snapshot with a known-incomplete deal backlog - closing-by-absence
            // must never run while we know history isn't fully caught up. Safe to
            // retry later: DEALS batching is idempotent (dedupe by dealTicket).
            Wnc_HandleFailure(http);
            return false;
         }

         WncIngestResponse resp;
         if (!Wnc_ParseIngestResponse(http.body, resp))
         {
            Wnc_HandleMalformedResponse("deals_batch");
            return false;
         }

         sent += batchSize;
      }

      bool ok = Wnc_SendPositionsSnapshot(positions, positionCount);
      if (ok) g_dealWatermark = newWatermark;
      return ok;
   }

   // Normal path - one RECONCILE request (account + FULL positions + deals).
   string positionsJson[];
   ArrayResize(positionsJson, positionCount);
   for (int i = 0; i < positionCount; i++) positionsJson[i] = Wnc_BuildPositionJson(positions[i]);

   string dealsJson[];
   ArrayResize(dealsJson, dealCount);
   for (int i = 0; i < dealCount; i++) dealsJson[i] = Wnc_BuildDealJson(deals[i]);

   long sequenceToUse = g_nextSequence;
   Wnc_PersistLocalSequence(g_connectionId, sequenceToUse); // persist BEFORE send
   g_nextSequence = sequenceToUse + 1; // advance regardless of outcome below

   string snapshotId = Wnc_GenerateSnapshotId();
   string payload = Wnc_BuildReconcilePayload(acc, positionsJson, positionCount, sequenceToUse, snapshotId, dealsJson, dealCount);
   string envelope = Wnc_BuildEnvelope("RECONCILE", payload, acc.accountLogin, CurrentAccountServer(), g_clientId);

   WncHttpResult http = Wnc_PostIngest(InpApiBaseUrl, InpApiKey, InpWebRequestTimeoutMs, envelope);
   if (http.outcome != WNC_HTTP_OK) { Wnc_HandleFailure(http); return false; }

   WncIngestResponse resp;
   if (!Wnc_ParseIngestResponse(http.body, resp)) { Wnc_HandleMalformedResponse("reconcile"); return false; }

   if (resp.hasAccepted && !resp.accepted)
   {
      g_state = WNC_STATE_NEEDS_BOOTSTRAP;
      g_lastErrorMessage = StringFormat(
         "RECONCILE positions (sequence %d) ถูกปฏิเสธเป็น stale/duplicate โดย backend - bootstrap ใหม่รอบถัดไป",
         sequenceToUse);
      return false;
   }

   g_dealWatermark = newWatermark;
   return true;
}

//===========================================================================
// Failure classification / backoff (item 14)
//===========================================================================

WNC_FAILURE_ACTION Wnc_ClassifyFailure(const WncHttpResult &http)
{
   if (http.outcome == WNC_HTTP_TRANSPORT_ERROR) return WNC_FAIL_TRANSIENT; // 5200/5201/5202-class
   if (http.outcome == WNC_HTTP_SERVER_ERROR)    return WNC_FAIL_TRANSIENT; // 5xx

   if (http.httpStatus == 401) return WNC_FAIL_FATAL_AUTH;
   if (http.httpStatus == 403) return WNC_FAIL_WAITING_FOR_PORTFOLIO;
   if (http.httpStatus == 429) return WNC_FAIL_TRANSIENT;
   if (http.httpStatus == 413) return WNC_FAIL_CONFIG_ERROR; // never retry the identical oversized payload

   if (http.httpStatus == 400)
   {
      // Best-effort classification: assertAccountIdentity's rejection message
      // (Mt5SyncService.accountIdentityMismatchMessage) contains this literal
      // marker. This is coupled to the current exact backend message text -
      // if that ever changes, this degrades gracefully to WNC_FAIL_CONFIG_ERROR
      // (still safe: stops, shows the raw error, slow-polls - just without the
      // more specific "ACCOUNT MISMATCH" label). A machine-readable error code
      // on the backend response would remove this fragility; see the setup
      // doc's "Known limitations" for this recommendation.
      if (StringFind(http.body, "TOFU") >= 0) return WNC_FAIL_ACCOUNT_MISMATCH;
      return WNC_FAIL_CONFIG_ERROR; // any other 400 (clock skew, DTO validation, protocol version, etc.)
   }

   return WNC_FAIL_CONFIG_ERROR; // any other unexpected non-2xx/5xx status
}

void Wnc_ApplyBackoff(const WncHttpResult &http)
{
   int ladder[6] = {5, 10, 30, 60, 120, 300};
   int idx = g_consecutiveFailures;
   if (idx >= 6) idx = 5;
   int delaySeconds = ladder[idx];

   if (StringLen(http.retryAfterHeader) > 0)
   {
      int hinted = (int)StringToInteger(http.retryAfterHeader);
      // Only honor a plain integer-seconds Retry-After (the common form) -
      // an HTTP-date value parses to 0 here and is safely ignored rather
      // than risk mis-parsing it.
      if (hinted > 0 && hinted < 3600) delaySeconds = (int)MathMax(delaySeconds, hinted);
   }

   g_consecutiveFailures++;
   g_nextAllowedAttempt = TimeCurrent() + delaySeconds;
}

void Wnc_ResetBackoff()
{
   g_consecutiveFailures = 0;
   g_nextAllowedAttempt = 0;
}

void Wnc_HandleFailure(const WncHttpResult &http)
{
   string detail = (http.outcome == WNC_HTTP_TRANSPORT_ERROR)
      ? Wnc_DescribeTransportError(http.mqlError)
      : StringFormat("HTTP %d: %s", http.httpStatus, StringSubstr(http.body, 0, 200));
   g_lastErrorMessage = detail;

   WNC_FAILURE_ACTION action = Wnc_ClassifyFailure(http);
   switch (action)
   {
      case WNC_FAIL_FATAL_AUTH:
         g_state = WNC_STATE_FATAL_AUTH;
         Print("[Wisenancial] AUTH ERROR - ", detail);
         break;

      case WNC_FAIL_ACCOUNT_MISMATCH:
         g_state = WNC_STATE_ACCOUNT_MISMATCH;
         Print("[Wisenancial] ACCOUNT MISMATCH - ", detail);
         break;

      case WNC_FAIL_WAITING_FOR_PORTFOLIO:
         g_state = WNC_STATE_WAITING_FOR_PORTFOLIO;
         break;

      case WNC_FAIL_CONFIG_ERROR:
         g_state = WNC_STATE_CONFIG_ERROR;
         Print("[Wisenancial] CONFIG/VALIDATION ERROR - ", detail);
         break;

      case WNC_FAIL_TRANSIENT:
      default:
         Wnc_ApplyBackoff(http);
         if (InpDebugLogging) Print("[Wisenancial] transient failure - ", detail);
         break;
   }
}

// A 200 OK whose body we couldn't parse as expected - not an HTTP failure,
// but not usable either. Treated as transient (item 14: "log safely, back
// off, do not crash") rather than routed into the slower CONFIG_ERROR poll,
// since a one-off malformed body (proxy hiccup, truncated response) is more
// likely transient than a persistent problem.
void Wnc_HandleMalformedResponse(const string context)
{
   g_lastErrorMessage = "ได้รับ HTTP 200 แต่ parse response ไม่ได้ (" + context + ")";
   if (InpDebugLogging) Print("[Wisenancial] malformed response: ", context);

   WncHttpResult empty;
   empty.outcome = WNC_HTTP_OK;
   empty.httpStatus = 200;
   empty.body = "";
   empty.mqlError = 0;
   empty.retryAfterHeader = "";
   Wnc_ApplyBackoff(empty);
}

//===========================================================================
// Misc helpers
//===========================================================================

long CurrentAccountLogin()
{
   // Always read fresh from MT5 - never cached, never trusted from anywhere
   // else (item 6: "do not trust user input for account identity").
   return AccountInfoInteger(ACCOUNT_LOGIN);
}

string CurrentAccountServer()
{
   return Wnc_TruncateForDto(AccountInfoString(ACCOUNT_SERVER), 100);
}

string Wnc_TruncateForDto(const string value, const int maxLen)
{
   if (StringLen(value) <= maxLen) return value;
   return StringSubstr(value, 0, maxLen);
}

string Wnc_GenerateSnapshotId()
{
   // Descriptive only - never used for ordering/correctness (item 8).
   return IntegerToString(CurrentAccountLogin()) + "-" + IntegerToString((long)GetTickCount64());
}

string Wnc_DeinitReasonLabel(const int reason)
{
   switch (reason)
   {
      case REASON_PROGRAM:    return "PROGRAM (EA removed by code)";
      case REASON_REMOVE:     return "REMOVE (EA removed by user)";
      case REASON_RECOMPILE:  return "RECOMPILE";
      case REASON_CHARTCHANGE:return "CHARTCHANGE";
      case REASON_CHARTCLOSE: return "CHARTCLOSE";
      case REASON_PARAMETERS: return "PARAMETERS";
      case REASON_ACCOUNT:    return "ACCOUNT (account/login switched)";
      case REASON_TEMPLATE:   return "TEMPLATE";
      case REASON_INITFAILED: return "INITFAILED";
      case REASON_CLOSE:      return "CLOSE (terminal closing)";
      default:                return "UNKNOWN(" + IntegerToString(reason) + ")";
   }
}

string Wnc_StateLabel(const WNC_STATE s)
{
   switch (s)
   {
      case WNC_STATE_NEEDS_BOOTSTRAP:       return "BOOTSTRAPPING";
      case WNC_STATE_WAITING_FOR_PORTFOLIO: return "WAITING FOR PORTFOLIO";
      case WNC_STATE_STEADY:                return "CONNECTED";
      case WNC_STATE_FATAL_AUTH:            return "AUTH ERROR";
      case WNC_STATE_CONFIG_ERROR:          return "CONFIG ERROR";
      case WNC_STATE_ACCOUNT_MISMATCH:      return "ACCOUNT MISMATCH";
      default:                              return "UNKNOWN";
   }
}

// User-facing status (item 19). Never includes the API key / Authorization
// header / any secret - only connection metadata already visible elsewhere
// in the terminal (account number, server name) plus this EA's own state.
void Wnc_UpdateStatusComment()
{
   string label = Wnc_StateLabel(g_state);

   string backoffInfo = "";
   if (g_consecutiveFailures > 0 && g_state != WNC_STATE_FATAL_AUTH
       && g_state != WNC_STATE_CONFIG_ERROR && g_state != WNC_STATE_ACCOUNT_MISMATCH)
   {
      int remaining = (int)(g_nextAllowedAttempt - TimeCurrent());
      if (remaining < 0) remaining = 0;
      backoffInfo = StringFormat(" | BACKOFF (retry in %ds, %d consecutive failures)", remaining, g_consecutiveFailures);
   }

   string text = "";
   text += "Wisenancial MT5 EA\n";
   text += "State: " + label + backoffInfo + "\n";
   text += "Account: " + IntegerToString(CurrentAccountLogin()) + " @ " + CurrentAccountServer() + "\n";
   text += "Connection ID: " + (g_connectionId >= 0 ? IntegerToString(g_connectionId) : "(unknown)") + "\n";
   text += "Portfolio bound: " + (g_portfolioBound ? "yes" : "no") + "\n";
   text += "Next sequence: " + (g_nextSequence >= 0 ? IntegerToString(g_nextSequence) : "(not bootstrapped)") + "\n";
   text += "Last successful sync: " + (g_lastSuccessfulSync > 0 ? TimeToString(g_lastSuccessfulSync, TIME_DATE | TIME_SECONDS) : "(never)") + "\n";
   if (StringLen(g_lastErrorMessage) > 0)
      text += "Last error: " + g_lastErrorMessage + "\n";

   Comment(text);
}

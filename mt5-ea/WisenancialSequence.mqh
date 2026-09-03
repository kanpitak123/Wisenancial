//+------------------------------------------------------------------------+
//|                                             WisenancialSequence.mqh    |
//|                                                                        |
//| Local persistence for snapshotSequence — the monotonic per-connection  |
//| counter that guards FULL positions snapshots against being applied     |
//| stale/out-of-order (see broker_connections.last_snapshot_sequence and  |
//| Mt5SyncService.applyPositionsSnapshot on the backend).                 |
//|                                                                        |
//| DESIGN — backend-anchored hybrid (chosen during the Phase 3I design    |
//| gate; see that review for the full rationale on why a pure local       |
//| counter, a pure timestamp, and a UUID were all rejected):              |
//|                                                                        |
//|   The backend is the source of truth. This file's GlobalVariable is a  |
//|   CACHE, never trusted blindly. Every bootstrap computes:              |
//|     candidate = max(serverLastSequence, localCachedValue) + 1          |
//|   and persists `candidate` BEFORE the snapshot carrying it is ever     |
//|   sent — so even if the send never reaches the backend (crash, network |
//|   partition), the next bootstrap will never reissue the same value.    |
//|   Gaps in the sequence are harmless by design (the backend only        |
//|   requires strictly increasing, not contiguous) — see item 7 of the    |
//|   Phase 3J spec.                                                       |
//|                                                                        |
//|   MQL5 GlobalVariables only store `double` — safe here since sequence  |
//|   values are ordinary small-ish integers, nowhere near the 2^53 exact- |
//|   integer boundary of a double (even a 5s timer running non-stop for   |
//|   10 years is ~63M increments).                                       |
//+------------------------------------------------------------------------+
// Namespaced by broker_connection_id (learned from the backend's own
// heartbeat/ingest response — see WncConnectionState.id in
// WisenancialSync.mqh) so two different broker connections — whether two
// EAs on one terminal, or the same EA reattached to a brand-new connection
// after the user recreated it — can never share sequence state. A fresh
// connection id simply has no matching GlobalVariable yet, which correctly
// starts it from "no snapshot accepted yet" rather than inheriting any
// prior connection's history.
string Wnc_SequenceGvName(const long connectionId)
{
   return "WNC_MT5_SEQ_" + IntegerToString(connectionId);
}

// Returns false if no valid local value is cached for this connection
// (never run before, GlobalVariable pool was cleared, MT5 purged it after
// 4 weeks of inactivity per MQL5 docs, EA copied to a different terminal,
// or the terminal's Global Variables were reset/deleted by the user) — all
// of these collapse to the same safe fallback: treat local as "unknown",
// let the server's value be the only input to the bootstrap calculation.
bool Wnc_TryReadLocalSequence(const long connectionId, long &outValue)
{
   string name = Wnc_SequenceGvName(connectionId);
   if (!GlobalVariableCheck(name)) return false;

   double raw = GlobalVariableGet(name);
   if (raw < 0) return false; // corrupted/nonsensical — treat as absent, don't trust it

   outValue = (long)MathRound(raw);
   return true;
}

void Wnc_PersistLocalSequence(const long connectionId, const long value)
{
   GlobalVariableSet(Wnc_SequenceGvName(connectionId), (double)value);
}

// Bootstrap: called (a) once per NEEDS_BOOTSTRAP cycle at EA start/restart/
// reconnect, and (b) again whenever a positions snapshot comes back
// accepted:false (per item 7/16 — "do not immediately retry with the same
// sequence; re-bootstrap from HEARTBEAT on a later timer cycle; recompute").
// `hasServerSequence`/`serverSequence` come straight from the connection
// state the backend just returned (WncConnectionState.hasLastSnapshotSequence
// / .lastSnapshotSequence) — pass hasServerSequence=false only for the
// theoretical case where a response couldn't be parsed at all; a genuinely
// unset (null) server sequence should be represented as
// hasServerSequence=true, serverSequence=-1 (see NOTE at the call site in
// WisenancialMT5EA.mq5) so a brand-new connection's "no snapshot yet" state
// (-1) still correctly loses to a higher local cache from a prior run of
// the same EA/terminal.
long Wnc_BootstrapNextSequence(const long connectionId, const bool hasServerSequence, const long serverSequence)
{
   long localValue = -1;
   bool hasLocal = Wnc_TryReadLocalSequence(connectionId, localValue);

   long serverValue = hasServerSequence ? serverSequence : -1;
   long baseline = hasLocal ? (long)MathMax(localValue, serverValue) : serverValue;

   long candidate = baseline + 1;

   // Persist BEFORE the caller sends anything carrying this value — see
   // file header. This is the one call site that matters for the "never
   // resend a value the backend might already have accepted" guarantee.
   Wnc_PersistLocalSequence(connectionId, candidate);

   return candidate;
}

//+------------------------------------------------------------------------+
//|                                                 WisenancialSync.mqh    |
//|                                                                        |
//| HTTP transport + JSON building/parsing for the Wisenancial MT5 EA.     |
//| This file owns everything that talks HTTP or touches raw JSON text —   |
//| WisenancialMT5EA.mq5 never builds a request string or reads a response |
//| body directly. WisenancialSequence.mqh (sequence bootstrap) is the     |
//| only other piece of protocol-critical logic, kept separate on purpose. |
//|                                                                        |
//| Backend contract this file targets (do not drift from it silently —   |
//| see tradingjournal-backend/src/brokers/ingestion/dto/mt5-ingest.dto.ts |
//| and mt5-sync.service.ts, Phase 3A-3J):                                 |
//|   POST /brokers/mt/ingest                                             |
//|   Authorization: Bearer <apiKey>                                       |
//|   { protocolVersion, platform, accountLogin, accountServer, clientId,  |
//|     sentAt, eventType, payload }                                       |
//|                                                                        |
//| JSON is hand-built/hand-parsed on purpose: MQL5 has no native JSON      |
//| type and no JSON library ships with this repository (it's a           |
//| NestJS/Vue web app — nothing MQL5-specific to reuse). Every payload    |
//| shape here is fixed and small (our own DTO contract, not arbitrary     |
//| user data), so hand-rolled typed builders/readers are enough — a       |
//| general-purpose recursive JSON parser would be over-engineering for    |
//| what is, in practice, always exactly one of a handful of known shapes. |
//+------------------------------------------------------------------------+
//===========================================================================
// Constants
//===========================================================================

#define WNC_PROTOCOL_VERSION   1
#define WNC_PLATFORM           "MT5"
#define WNC_INGEST_PATH        "/brokers/mt/ingest"

//===========================================================================
// String / number formatting helpers — locale-independent per MQL5 docs
// (DoubleToString/IntegerToString always use '.' and no grouping regardless
// of Windows locale), which is exactly what JSON requires.
//===========================================================================

// Minimal JSON string escaping — sufficient for our own field values
// (symbols, server names, currency codes, client id, error text we log).
string Wnc_JsonEscape(const string value)
{
   string out = "";
   int len = StringLen(value);
   for (int i = 0; i < len; i++)
   {
      ushort ch = StringGetCharacter(value, i);
      switch (ch)
      {
         case '"':  out += "\\\""; break;
         case '\\': out += "\\\\"; break;
         case '\n': out += "\\n";  break;
         case '\r': out += "\\r";  break;
         case '\t': out += "\\t";  break;
         default:
            if (ch < 0x20)
            {
               // control character — encode as \u00XX rather than emit it raw
               out += StringFormat("\\u%04x", ch);
            }
            else
            {
               out += StringSubstr(value, i, 1);
            }
      }
   }
   return out;
}

string Wnc_JsonStr(const string value)
{
   return "\"" + Wnc_JsonEscape(value) + "\"";
}

string Wnc_JsonNum(const double value, const int digits = 8)
{
   return DoubleToString(value, digits);
}

string Wnc_JsonInt(const long value)
{
   return IntegerToString(value);
}

string Wnc_JsonBool(const bool value)
{
   return value ? "true" : "false";
}

string Wnc_JsonNullableInt(const bool hasValue, const long value)
{
   return hasValue ? Wnc_JsonInt(value) : "null";
}

string Wnc_JsonNullableNum(const bool hasValue, const double value, const int digits = 8)
{
   return hasValue ? Wnc_JsonNum(value, digits) : "null";
}

// ISO-8601 UTC timestamp built from TimeGMT() — TimeGMT() derives true UTC
// from the local machine clock/timezone (unlike TimeCurrent(), which is the
// trade server's own clock and may sit in an arbitrary broker timezone).
// The backend's clock-skew check (Mt5SyncService.assertReasonableTimestamp,
// +-24h) compares this against real wall-clock UTC, so TimeGMT() is the
// correct source here — using TimeCurrent() instead would make every
// request look "skewed" on any broker not running its server clock in UTC.
string Wnc_NowIso8601Gmt()
{
   datetime now = TimeGMT();
   string date = TimeToString(now, TIME_DATE);      // "2026.09.03"
   string time = TimeToString(now, TIME_SECONDS);    // "2026.09.03 12:34:56" (includes date again)
   string timePart = StringSubstr(time, StringFind(time, " ") + 1); // "12:34:56"
   StringReplace(date, ".", "-");
   return date + "T" + timePart + "Z";
}

// Best-effort ISO-8601 formatting for a trade-event datetime (POSITION_TIME /
// DEAL_TIME). Known limitation, documented for the user in docs/mt5-ea-setup.md:
// these values are reported by the trade server in ITS OWN clock, which is not
// guaranteed to be true UTC (many brokers run UTC+2/UTC+3, some run UTC). The
// backend only uses this field for display/record-keeping, never for
// ordering/security decisions (those are snapshotSequence and dealTicket, both
// unaffected by this), so treating the raw server datetime as if it were UTC
// is an accepted, informational-only simplification — not a data-integrity risk.
string Wnc_ServerTimeToIso8601(const datetime value)
{
   string date = TimeToString(value, TIME_DATE);
   string time = TimeToString(value, TIME_SECONDS);
   string timePart = StringSubstr(time, StringFind(time, " ") + 1);
   StringReplace(date, ".", "-");
   return date + "T" + timePart + "Z";
}

//===========================================================================
// Envelope + payload builders
//===========================================================================

string Wnc_BuildEnvelope(
   const string eventType,
   const string payloadJson,
   const long accountLogin,
   const string accountServer,
   const string clientId
)
{
   string json = "{";
   json += "\"protocolVersion\":" + Wnc_JsonInt(WNC_PROTOCOL_VERSION) + ",";
   json += "\"platform\":" + Wnc_JsonStr(WNC_PLATFORM) + ",";
   json += "\"accountLogin\":" + Wnc_JsonInt(accountLogin) + ",";
   json += "\"accountServer\":" + Wnc_JsonStr(accountServer) + ",";
   json += "\"clientId\":" + Wnc_JsonStr(clientId) + ",";
   json += "\"sentAt\":" + Wnc_JsonStr(Wnc_NowIso8601Gmt()) + ",";
   json += "\"eventType\":" + Wnc_JsonStr(eventType) + ",";
   json += "\"payload\":" + payloadJson;
   json += "}";
   return json;
}

// --- ACCOUNT_SNAPSHOT payload -------------------------------------------
// Matches Mt5AccountSnapshotPayloadDto exactly (field-for-field, no extras —
// the backend validates with forbidNonWhitelisted:true).
struct WncAccountSnapshot
{
   long   accountLogin;
   double balance;
   double equity;
   double margin;
   double marginFree;
   double marginLevel;
   double credit;
   string currency;
   double leverage;
};

string Wnc_BuildAccountSnapshotPayload(const WncAccountSnapshot &acc)
{
   string json = "{";
   json += "\"accountLogin\":" + Wnc_JsonInt(acc.accountLogin) + ",";
   json += "\"balance\":" + Wnc_JsonNum(acc.balance, 2) + ",";
   json += "\"equity\":" + Wnc_JsonNum(acc.equity, 2) + ",";
   json += "\"margin\":" + Wnc_JsonNum(acc.margin, 2) + ",";
   json += "\"marginFree\":" + Wnc_JsonNum(acc.marginFree, 2) + ",";
   json += "\"marginLevel\":" + Wnc_JsonNum(acc.marginLevel, 2) + ",";
   json += "\"credit\":" + Wnc_JsonNum(acc.credit, 2) + ",";
   json += "\"currency\":" + Wnc_JsonStr(acc.currency) + ",";
   json += "\"leverage\":" + Wnc_JsonNum(acc.leverage, 2);
   json += "}";
   return json;
}

// --- position (one element of positions[]) ------------------------------
// Matches Mt5PositionDto. currentPrice/sl/tp/profit are nullable in the DTO
// — MT5 always has concrete values for an open position, so this EA always
// sends them (hasX flags kept only for symmetry/future-proofing, always true
// here).
struct WncPosition
{
   long   positionTicket;
   string symbol;
   string direction;      // "LONG" | "SHORT"
   double volume;
   double openPrice;
   double currentPrice;
   double sl;
   double tp;
   double swap;
   double profit;
   datetime openedAt;
};

string Wnc_BuildPositionJson(const WncPosition &p)
{
   string json = "{";
   json += "\"positionTicket\":" + Wnc_JsonInt(p.positionTicket) + ",";
   json += "\"symbol\":" + Wnc_JsonStr(p.symbol) + ",";
   json += "\"direction\":" + Wnc_JsonStr(p.direction) + ",";
   json += "\"volume\":" + Wnc_JsonNum(p.volume, 2) + ",";
   json += "\"openPrice\":" + Wnc_JsonNum(p.openPrice, 8) + ",";
   json += "\"currentPrice\":" + Wnc_JsonNum(p.currentPrice, 8) + ",";
   json += "\"sl\":" + Wnc_JsonNum(p.sl, 8) + ",";
   json += "\"tp\":" + Wnc_JsonNum(p.tp, 8) + ",";
   json += "\"swap\":" + Wnc_JsonNum(p.swap, 2) + ",";
   json += "\"profit\":" + Wnc_JsonNum(p.profit, 2) + ",";
   json += "\"openedAt\":" + Wnc_JsonStr(Wnc_ServerTimeToIso8601(p.openedAt));
   json += "}";
   return json;
}

// snapshotId is descriptive only (never used for ordering — snapshotSequence
// is) so any unique-enough string is fine.
string Wnc_BuildPositionsSnapshotPayload(
   const string &positionsJson[],
   const int positionCount,
   const long snapshotSequence,
   const string snapshotId
)
{
   string json = "{";
   json += "\"snapshotId\":" + Wnc_JsonStr(snapshotId) + ",";
   json += "\"snapshotType\":\"FULL\",";
   json += "\"snapshotSequence\":" + Wnc_JsonInt(snapshotSequence) + ",";
   json += "\"positionCount\":" + Wnc_JsonInt(positionCount) + ",";
   json += "\"positions\":[";
   for (int i = 0; i < positionCount; i++)
   {
      if (i > 0) json += ",";
      json += positionsJson[i];
   }
   json += "]}";
   return json;
}

// --- deal (one element of deals[]) --------------------------------------
// Matches Mt5DealDto. orderTicket is nullable in the DTO; MT5 deals always
// carry DEAL_ORDER, so this EA always sends a concrete value.
struct WncDeal
{
   long   dealTicket;
   long   orderTicket;
   long   positionTicket;
   string symbol;
   string entryType;   // "IN" | "OUT" | "INOUT" | "OUT_BY"
   double volume;
   double price;
   double commission;
   double swap;
   double profit;
   datetime executedAt;
};

string Wnc_BuildDealJson(const WncDeal &d)
{
   string json = "{";
   json += "\"dealTicket\":" + Wnc_JsonInt(d.dealTicket) + ",";
   json += "\"orderTicket\":" + Wnc_JsonInt(d.orderTicket) + ",";
   json += "\"positionTicket\":" + Wnc_JsonInt(d.positionTicket) + ",";
   json += "\"symbol\":" + Wnc_JsonStr(d.symbol) + ",";
   json += "\"entryType\":" + Wnc_JsonStr(d.entryType) + ",";
   json += "\"volume\":" + Wnc_JsonNum(d.volume, 2) + ",";
   json += "\"price\":" + Wnc_JsonNum(d.price, 8) + ",";
   json += "\"commission\":" + Wnc_JsonNum(d.commission, 2) + ",";
   json += "\"swap\":" + Wnc_JsonNum(d.swap, 2) + ",";
   json += "\"profit\":" + Wnc_JsonNum(d.profit, 2) + ",";
   json += "\"executedAt\":" + Wnc_JsonStr(Wnc_ServerTimeToIso8601(d.executedAt));
   json += "}";
   return json;
}

string Wnc_BuildDealsArrayJson(const string &dealsJson[], const int count)
{
   string json = "[";
   for (int i = 0; i < count; i++)
   {
      if (i > 0) json += ",";
      json += dealsJson[i];
   }
   json += "]";
   return json;
}

string Wnc_BuildDealsPayload(const string &dealsJson[], const int count)
{
   return "{\"deals\":" + Wnc_BuildDealsArrayJson(dealsJson, count) + "}";
}

string Wnc_BuildReconcilePayload(
   const WncAccountSnapshot &acc,
   const string &positionsJson[],
   const int positionCount,
   const long snapshotSequence,
   const string snapshotId,
   const string &dealsJson[],
   const int dealCount
)
{
   string json = "{";
   json += "\"accountSnapshot\":" + Wnc_BuildAccountSnapshotPayload(acc) + ",";
   json += "\"positionsSnapshot\":" + Wnc_BuildPositionsSnapshotPayload(
              positionsJson, positionCount, snapshotSequence, snapshotId) + ",";
   json += "\"deals\":" + Wnc_BuildDealsArrayJson(dealsJson, dealCount);
   json += "}";
   return json;
}

//===========================================================================
// Minimal JSON reader — flat key lookup + one level of nested-object
// extraction. Deliberately not a general parser (see file header). Only
// reads what our own backend's known response shapes can contain: strings,
// numbers, booleans, null, and (for "connection") one nested object.
//===========================================================================

bool Wnc_JsonFindValueStart(const string &json, const string key, int &valueStart)
{
   string pattern = "\"" + key + "\"";
   int keyPos = StringFind(json, pattern);
   if (keyPos < 0) return false;

   int colonPos = StringFind(json, ":", keyPos + StringLen(pattern));
   if (colonPos < 0) return false;

   int i = colonPos + 1;
   int len = StringLen(json);
   while (i < len)
   {
      ushort ch = StringGetCharacter(json, i);
      if (ch != ' ' && ch != '\t' && ch != '\n' && ch != '\r') break;
      i++;
   }
   if (i >= len) return false;

   valueStart = i;
   return true;
}

// Reads the raw slice of a JSON value starting at `start` (as produced by
// Wnc_JsonFindValueStart). For a string value, quotes are stripped and \" \\
// are unescaped (sufficient for our own field values — status enums, ISO
// dates, error text). For an object value, the full "{...}" slice is
// returned (brace-depth counted, so it's safe even if the object contains
// further nested objects). Returns "" and endIndex==start on malformed input
// rather than throwing — callers treat that as "field absent/unusable".
string Wnc_JsonReadRawValue(const string &json, const int start, int &endIndex)
{
   int len = StringLen(json);
   if (start >= len) { endIndex = start; return ""; }

   ushort first = StringGetCharacter(json, start);

   if (first == '"')
   {
      string out = "";
      int i = start + 1;
      while (i < len)
      {
         ushort ch = StringGetCharacter(json, i);
         if (ch == '\\' && i + 1 < len)
         {
            ushort next = StringGetCharacter(json, i + 1);
            if (next == '"') { out += "\""; i += 2; continue; }
            if (next == '\\') { out += "\\"; i += 2; continue; }
            if (next == 'n') { out += "\n"; i += 2; continue; }
            if (next == 't') { out += "\t"; i += 2; continue; }
            // unknown escape — pass the character through as-is rather than guess
            out += StringSubstr(json, i + 1, 1);
            i += 2;
            continue;
         }
         if (ch == '"') { endIndex = i + 1; return out; }
         out += StringSubstr(json, i, 1);
         i++;
      }
      endIndex = len;
      return out; // unterminated — best effort
   }

   if (first == '{')
   {
      int depth = 0;
      int i = start;
      bool inString = false;
      while (i < len)
      {
         ushort ch = StringGetCharacter(json, i);
         if (inString)
         {
            if (ch == '\\') { i += 2; continue; }
            if (ch == '"') inString = false;
            i++;
            continue;
         }
         if (ch == '"') { inString = true; i++; continue; }
         if (ch == '{') depth++;
         if (ch == '}')
         {
            depth--;
            if (depth == 0) { endIndex = i + 1; return StringSubstr(json, start, i + 1 - start); }
         }
         i++;
      }
      endIndex = len;
      return StringSubstr(json, start, len - start); // unterminated — best effort
   }

   // number / true / false / null — read until a delimiter
   int i = start;
   while (i < len)
   {
      ushort ch = StringGetCharacter(json, i);
      if (ch == ',' || ch == '}' || ch == ']' || ch == ' ' || ch == '\n' || ch == '\r' || ch == '\t') break;
      i++;
   }
   endIndex = i;
   return StringSubstr(json, start, i - start);
}

bool Wnc_JsonGetString(const string &json, const string key, string &out)
{
   int start, end;
   if (!Wnc_JsonFindValueStart(json, key, start)) return false;
   string raw = Wnc_JsonReadRawValue(json, start, end);
   if (raw == "null") return false;
   out = raw;
   return true;
}

bool Wnc_JsonGetBool(const string &json, const string key, bool &out)
{
   int start, end;
   if (!Wnc_JsonFindValueStart(json, key, start)) return false;
   string raw = Wnc_JsonReadRawValue(json, start, end);
   if (raw == "true") { out = true; return true; }
   if (raw == "false") { out = false; return true; }
   return false;
}

// Returns false if the field is missing OR explicitly null — callers use
// this to distinguish "no value" from "zero", which matters for
// last_snapshot_sequence (null means "no FULL snapshot accepted yet", a
// meaningfully different case from sequence 0).
bool Wnc_JsonGetNumber(const string &json, const string key, double &out)
{
   int start, end;
   if (!Wnc_JsonFindValueStart(json, key, start)) return false;
   string raw = Wnc_JsonReadRawValue(json, start, end);
   if (raw == "null" || raw == "") return false;
   out = StringToDouble(raw);
   return true;
}

bool Wnc_JsonGetObject(const string &json, const string key, string &out)
{
   int start, end;
   if (!Wnc_JsonFindValueStart(json, key, start)) return false;
   string raw = Wnc_JsonReadRawValue(json, start, end);
   if (raw == "null" || StringLen(raw) == 0 || StringGetCharacter(raw, 0) != '{') return false;
   out = raw;
   return true;
}

//===========================================================================
// Connection state — parsed out of the "connection" object every event
// response now carries (Phase 3J prep §1 — unified heartbeat response;
// present on every event type's response, not just HEARTBEAT's, since
// Mt5SyncService returns it uniformly). Mirrors PublicBrokerConnection's
// snake_case field names verbatim — deliberately not renamed to camelCase,
// to stay literally in sync with what the backend actually sends.
//===========================================================================

struct WncConnectionState
{
   bool   hasId;
   long   id;
   string status;
   bool   hasPortfolioId;
   long   portfolioId;
   bool   hasLastSnapshotSequence;
   long   lastSnapshotSequence;
   string lastSyncAt;
};

void Wnc_ResetConnectionState(WncConnectionState &s)
{
   s.hasId = false;
   s.id = -1;
   s.status = "";
   s.hasPortfolioId = false;
   s.portfolioId = -1;
   s.hasLastSnapshotSequence = false;
   s.lastSnapshotSequence = -1;
   s.lastSyncAt = "";
}

bool Wnc_ParseConnectionState(const string &json, WncConnectionState &out)
{
   Wnc_ResetConnectionState(out);

   string connJson;
   if (!Wnc_JsonGetObject(json, "connection", connJson)) return false;

   double num;
   if (Wnc_JsonGetNumber(connJson, "id", num)) { out.hasId = true; out.id = (long)num; }
   Wnc_JsonGetString(connJson, "status", out.status);
   if (Wnc_JsonGetNumber(connJson, "portfolio_id", num)) { out.hasPortfolioId = true; out.portfolioId = (long)num; }
   if (Wnc_JsonGetNumber(connJson, "last_snapshot_sequence", num))
   {
      out.hasLastSnapshotSequence = true;
      out.lastSnapshotSequence = (long)num;
   }
   Wnc_JsonGetString(connJson, "last_sync_at", out.lastSyncAt);

   return out.hasId;
}

//===========================================================================
// Ingest response — the top-level fields Mt5SyncService.ingest() returns,
// across every event type (see mt5-sync.service.ts). Not every field
// applies to every event type; callers check hasX before reading.
//===========================================================================

struct WncIngestResponse
{
   bool   parsedOk;
   string eventType;
   bool   applied;
   bool   hasAccepted;
   bool   accepted;
   bool   hasSnapshotSequence;
   long   snapshotSequence;
   bool   hasConnection;
   WncConnectionState connection;
};

bool Wnc_ParseIngestResponse(const string &body, WncIngestResponse &out)
{
   out.parsedOk = false;
   out.eventType = "";
   out.applied = false;
   out.hasAccepted = false;
   out.accepted = false;
   out.hasSnapshotSequence = false;
   out.snapshotSequence = -1;
   Wnc_ResetConnectionState(out.connection);
   out.hasConnection = false;

   if (StringLen(body) == 0) return false;
   if (StringGetCharacter(body, 0) != '{') return false; // top-level must be a JSON object

   Wnc_JsonGetString(body, "eventType", out.eventType);
   Wnc_JsonGetBool(body, "applied", out.applied);
   out.hasAccepted = Wnc_JsonGetBool(body, "accepted", out.accepted);

   double seq;
   out.hasSnapshotSequence = Wnc_JsonGetNumber(body, "snapshotSequence", seq);
   if (out.hasSnapshotSequence) out.snapshotSequence = (long)seq;

   out.hasConnection = Wnc_ParseConnectionState(body, out.connection);

   // For RECONCILE the "positions" sub-result (accepted/snapshotSequence)
   // is nested one level deeper — pull it up so callers have one place to
   // look regardless of eventType.
   string positionsJson;
   if (!out.hasAccepted && Wnc_JsonGetObject(body, "positions", positionsJson))
   {
      out.hasAccepted = Wnc_JsonGetBool(positionsJson, "accepted", out.accepted);
      if (!out.hasSnapshotSequence)
      {
         double pseq;
         out.hasSnapshotSequence = Wnc_JsonGetNumber(positionsJson, "snapshotSequence", pseq);
         if (out.hasSnapshotSequence) out.snapshotSequence = (long)pseq;
      }
   }

   out.parsedOk = true;
   return true;
}

//===========================================================================
// HTTP transport
//===========================================================================

enum WNC_HTTP_OUTCOME
{
   WNC_HTTP_OK,               // 2xx
   WNC_HTTP_CLIENT_ERROR,     // 4xx (classification left to the caller — status is set)
   WNC_HTTP_SERVER_ERROR,     // 5xx
   WNC_HTTP_TRANSPORT_ERROR   // WebRequest itself failed — no HTTP status at all
};

struct WncHttpResult
{
   WNC_HTTP_OUTCOME outcome;
   int    httpStatus;     // meaningful only when outcome != WNC_HTTP_TRANSPORT_ERROR
   string body;
   int    mqlError;       // GetLastError() value, meaningful only for WNC_HTTP_TRANSPORT_ERROR
   string retryAfterHeader; // raw "Retry-After" header value if present, else ""
};

string Wnc_ExtractHeader(const string &headers, const string headerName)
{
   int pos = StringFind(headers, headerName + ":");
   if (pos < 0)
   {
      // headers are case-sensitive-ish in practice from most servers, but be lenient
      pos = StringFind(headers, headerName + ": ");
      if (pos < 0) return "";
   }
   int valueStart = pos + StringLen(headerName) + 1;
   while (valueStart < StringLen(headers) && StringGetCharacter(headers, valueStart) == ' ') valueStart++;
   int lineEnd = StringFind(headers, "\r\n", valueStart);
   if (lineEnd < 0) lineEnd = StringFind(headers, "\n", valueStart);
   if (lineEnd < 0) lineEnd = StringLen(headers);
   return StringSubstr(headers, valueStart, lineEnd - valueStart);
}

// The one and only place WebRequest() is called in this EA. Callers
// (WisenancialMT5EA.mq5) must only ever call this from OnTimer — see
// WNC_STOP: no WebRequest in OnInit/OnDeinit/OnTradeTransaction.
WncHttpResult Wnc_PostIngest(
   const string baseUrl,
   const string apiKey,
   const int timeoutMs,
   const string jsonBody
)
{
   WncHttpResult result;
   result.outcome = WNC_HTTP_TRANSPORT_ERROR;
   result.httpStatus = 0;
   result.body = "";
   result.mqlError = 0;
   result.retryAfterHeader = "";

   string url = baseUrl + WNC_INGEST_PATH;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + apiKey + "\r\n";

   uchar data[];
   // WHOLE_ARRAY (not StringLen()) — StringLen() counts characters, not bytes;
   // a multi-byte UTF-8 sequence (e.g. a non-ASCII broker/server name) would
   // under-count and truncate the body if character count were used as the
   // byte count here.
   int bytes = StringToCharArray(jsonBody, data, 0, WHOLE_ARRAY, CP_UTF8);
   // StringToCharArray appends a trailing null terminator — trim it so the
   // POST body doesn't carry a stray 0x00 byte after the closing brace.
   if (bytes > 0) ArrayResize(data, bytes - 1);

   uchar responseData[];
   string responseHeaders;

   ResetLastError();
   int status = WebRequest("POST", url, headers, timeoutMs, data, responseData, responseHeaders);

   if (status == -1)
   {
      result.outcome = WNC_HTTP_TRANSPORT_ERROR;
      result.mqlError = GetLastError();
      return result;
   }

   result.httpStatus = status;
   result.body = CharArrayToString(responseData, 0, WHOLE_ARRAY, CP_UTF8);
   result.retryAfterHeader = Wnc_ExtractHeader(responseHeaders, "Retry-After");

   if (status >= 200 && status < 300) result.outcome = WNC_HTTP_OK;
   else if (status >= 500) result.outcome = WNC_HTTP_SERVER_ERROR;
   else result.outcome = WNC_HTTP_CLIENT_ERROR; // includes 4xx and any other non-2xx/5xx

   return result;
}

// Human-readable explanation for a transport-level failure — special-cases
// the "URL not whitelisted" error (4060, per MQL5 docs: WebRequest requires
// the target host to be added under Tools > Options > Expert Advisors >
// "Allow WebRequest for listed URL") since it's by far the most common setup
// mistake and otherwise just looks like an opaque timeout.
string Wnc_DescribeTransportError(const int mqlError)
{
   if (mqlError == 4060)
   {
      return "WebRequest ถูกปฏิเสธ (error 4060) — URL นี้ยังไม่ได้เพิ่มใน MT5: Tools > Options > "
             "Expert Advisors > 'Allow WebRequest for listed URL' ต้อง whitelist API base URL "
             "ที่ตั้งใน input ก่อน EA ถึงจะยิง request ออกไปได้";
   }
   if (mqlError == 4014)
   {
      return "WebRequest ไม่ได้รับอนุญาตให้เรียกจาก context นี้ (error 4014)";
   }
   return StringFormat("WebRequest ล้มเหลวระดับ transport (MQL error %d) — ตรวจสอบการเชื่อมต่อเน็ตเวิร์ก", mqlError);
}

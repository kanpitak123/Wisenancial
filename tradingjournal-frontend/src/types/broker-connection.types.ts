/**
 * Mirrors backend PublicBrokerConnection (tradingjournal-backend/src/brokers/connections/
 * broker-connection.presenter.ts) field-for-field, snake_case included — this is the
 * literal wire shape returned by /brokers/connections, not renamed to camelCase, to
 * stay obviously in sync with what the backend actually sends.
 */

export type BrokerType = 'MT4' | 'MT5' | 'WEBULL' | 'DIME';

export type BrokerConnectionStatus = 'ACTIVE' | 'INACTIVE' | 'REVOKED' | 'ERROR' | 'DISCONNECTED';

export interface BrokerConnection {
  id: number;
  user_id: number;
  portfolio_id: number | null;
  broker_type: BrokerType;
  external_account_id: string | null;
  broker_server: string | null;
  oauth_token_expires_at: string | null;
  status: BrokerConnectionStatus;
  last_heartbeat_at: string | null;
  last_sync_at: string | null;
  last_snapshot_sequence: number | null;
  /** ดู Mt5IngestErrorCode ฝั่ง backend (mt5-ingest-error-codes.ts) — ACCOUNT_MISMATCH /
   * PORTFOLIO_NOT_BOUND / CONFIG_ERROR เท่านั้น ไม่ครอบคลุมทุก failure mode ที่เป็นไปได้
   * (invalid API key / WebRequest ถูกปฏิเสธ ไม่มีทาง record ตรงนี้ได้ — ดู comment บน
   * backend's broker_connections model) — null เสมอถ้ายังไม่เคย error หรือ error ล่าสุด
   * ถูกล้างไปแล้วหลัง heartbeat/sync สำเร็จรอบถัดมา */
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateBrokerConnectionPayload {
  broker_type: BrokerType;
  portfolio_id?: number;
}

/** apiKey is the plaintext key — the backend returns it exactly once, here, at creation. */
export interface CreatedBrokerConnection {
  connection: BrokerConnection;
  apiKey: string | null;
}

/** apiKey is the plaintext key — returned exactly once, here, at rotation. */
export interface RotatedBrokerConnection {
  connection: BrokerConnection;
  apiKey: string;
}

export interface ApiErrorResponse {
  message?: string | string[];
}

/**
 * Mirrors backend Mt5SyncUpdateEvent (tradingjournal-backend/src/brokers/broker-sync.gateway.ts)
 * — the realtime "something changed, go refetch" signal Phase 3L introduced. No trade/
 * position payload is ever included by design (see that file's header comment), so
 * this type only carries metadata, never data to render directly.
 */
export interface Mt5SyncUpdateEvent {
  connectionId: number;
  eventType: 'ACCOUNT_SNAPSHOT' | 'POSITIONS_SNAPSHOT' | 'DEALS' | 'RECONCILE';
  portfolioId: number;
  upsertedCount?: number;
  closedByAbsenceCount?: number;
  appliedDealsCount?: number;
}

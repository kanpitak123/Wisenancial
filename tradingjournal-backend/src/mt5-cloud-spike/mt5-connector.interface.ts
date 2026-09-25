/**
 * Technical spike (see docs/mt5-investor-password-spike.md) — NOT wired into the real
 * "Sync MT5" flow. Proves out an MT5Connector abstraction that could sit in front of
 * either the already-shipped EA/push connector (EAConnector) or a managed/investor-
 * password connector (CloudConnector), so a future production decision could swap the
 * implementation without touching callers. Isolated on purpose from
 * src/brokers/interfaces/broker-adapter.interface.ts — that interface covers the whole
 * multi-broker app (Webull/Dime included) and is owned by the real broker-connections
 * feature; this one only needs to describe "read an MT5 account through some transport",
 * which is all a spike needs to prove.
 */

export type Mt5ConnectorKind = 'EA' | 'CLOUD';

export interface Mt5AccountSnapshot {
  broker: string | null;
  currency: string;
  balance: number;
  /** null when the connector has no independent way to compute equity (e.g. EAConnector
   * without live open-position pricing) — callers should fall back to balance for display. */
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  leverage: number | null;
  credit: number | null;
}

export interface Mt5PositionSnapshot {
  ticket: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  profit: number | null;
  openedAt: Date | null;
}

export interface Mt5DealSnapshot {
  ticket: string;
  symbol: string | null;
  volume: number | null;
  price: number | null;
  profit: number;
  commission: number | null;
  swap: number | null;
  executedAt: Date;
}

export type Mt5ConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';

export interface Mt5ConnectionStatus {
  state: Mt5ConnectionState;
  message?: string;
  checkedAt: Date;
}

/** Request shape differs per connector kind — CLOUD needs investor-password credentials
 * up front (that's the whole point of the spike), EA only needs to point at a connection
 * that the untouched wizard/EA flow already brought ACTIVE. */
export type Mt5ConnectRequest =
  | { kind: 'EA'; brokerConnectionId: number }
  | { kind: 'CLOUD'; login: string; investorPassword: string; server: string };

export interface Mt5ConnectorHandle {
  kind: Mt5ConnectorKind;
  /** Opaque id the connector uses to look itself back up later — broker_connections.id
   * for EA, our spike credential-store record id for CLOUD. Callers should treat this as
   * an opaque string and never parse it. */
  ref: string;
}

/**
 * Every method takes `userId` and re-checks ownership on every call, not just at
 * connect() — `ref` for EA is a small sequential broker_connections.id, which would
 * otherwise let any authenticated dev-page user read another user's real trade history
 * by guessing small integers. Costs an extra ownership check per call; worth it for a
 * page that reads real production trade data even in spike form.
 */
export interface Mt5Connector {
  readonly kind: Mt5ConnectorKind;

  connect(request: Mt5ConnectRequest, userId: number): Promise<Mt5ConnectorHandle>;

  /** Revokes/deletes whatever credential or remote registration this connector holds for
   * `ref`. For EAConnector this is a documented no-op (see ea-connector.ts) — the spike
   * never touches the real EA connection lifecycle. */
  disconnect(ref: string, userId: number): Promise<void>;

  getAccountSnapshot(ref: string, userId: number): Promise<Mt5AccountSnapshot>;
  getPositions(ref: string, userId: number): Promise<Mt5PositionSnapshot[]>;
  getDealHistory(ref: string, userId: number, sinceDays?: number): Promise<Mt5DealSnapshot[]>;
  getStatus(ref: string, userId: number): Promise<Mt5ConnectionStatus>;
}

export class Mt5ConnectorError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

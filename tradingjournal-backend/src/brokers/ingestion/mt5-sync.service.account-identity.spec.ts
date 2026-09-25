import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TradesService } from '../../trades/trades.service';
import { BrokerSyncGateway } from '../broker-sync.gateway';
import { BrokerConnectionsService } from '../connections/broker-connections.service';
import { Mt5EventType } from './dto/mt5-ingest.dto';
import { Mt5SyncService } from './mt5-sync.service';

/**
 * Phase 3J prep §1 (unified heartbeat response) and §2 (TOFU account/server pinning).
 *
 * §2G item 12 ("revoked API key still gets 401 before identity validation") is NOT
 * retested here — Mt5SyncService.ingest() is only ever reached after
 * BrokerApiKeyGuard.canActivate() has already accepted the request (Nest runs guards
 * before the controller method), so a revoked connection structurally never reaches
 * this service at all. That 401 behavior is already covered by
 * broker-api-key.guard.spec.ts ("REVOKED -> UnauthorizedException").
 */

const tradesMock = {
  upsertMt5Position: jest.fn(async () => ({ id: 1 })),
  closeMt5PositionsByAbsence: jest.fn(async () => []),
  applyMt5Deal: jest.fn(async () => ({ trade: { id: 1 }, applied: true })),
};

const syncGatewayMock = {
  broadcastMt5SyncUpdate: jest.fn(),
};

let snapshotSequenceStore: Record<number, number | null>;

function createPrismaMock() {
  return {
    $transaction: jest.fn(async (fn: any) =>
      fn({
        broker_connections: {
          findUnique: jest.fn(async ({ where }: any) => ({
            last_snapshot_sequence: snapshotSequenceStore[where.id] ?? null,
          })),
          update: jest.fn(async ({ where, data }: any) => {
            snapshotSequenceStore[where.id] = data.last_snapshot_sequence;
            return {};
          }),
        },
      }),
    ),
  };
}

/**
 * Faithful (if simplified) reimplementation of BrokerConnectionsService's real atomic
 * conditional UPDATE, against an in-memory row store — mirrors exactly what the
 * Postgres statement does (see pinOrVerifyMt5Identity's doc comment): matches if each
 * column is either still null or already equal to the incoming value, and only then
 * writes. True cross-request interleaving/locking is a Postgres row-lock guarantee
 * this unit test cannot reproduce directly — what's validated here is that the calling
 * code (Mt5SyncService.assertAccountIdentity) correctly turns a "0 rows matched"
 * result into a rejection, which is the contract the real atomic UPDATE provides.
 */
function createConnectionsMock() {
  const pinnedRows: Record<
    number,
    { external_account_id: string | null; broker_server: string | null }
  > = {};
  const heartbeatState: Record<
    number,
    { status: BrokerConnectionStatus; portfolio_id: number | null }
  > = {};

  return {
    _pinnedRows: pinnedRows,
    recordHeartbeat: jest.fn(async (id: number) => {
      const state = heartbeatState[id] ?? {
        status: BrokerConnectionStatus.ACTIVE,
        portfolio_id: 3,
      };
      return {
        id,
        user_id: 1,
        status: state.status,
        portfolio_id: state.portfolio_id,
        broker_type: BrokerType.MT5,
        external_account_id: pinnedRows[id]?.external_account_id ?? null,
        broker_server: pinnedRows[id]?.broker_server ?? null,
        last_heartbeat_at: new Date('2026-09-03T00:00:00Z'),
        last_sync_at: null,
        last_snapshot_sequence: snapshotSequenceStore[id] ?? null,
        created_at: new Date('2026-09-01T00:00:00Z'),
        updated_at: new Date('2026-09-03T00:00:00Z'),
        deleted_at: null,
      };
    }),
    recordSync: jest.fn(async () => ({})),
    recordError: jest.fn(async () => undefined),
    pinOrVerifyMt5Identity: jest.fn(
      async (id: number, accountLogin: string, accountServer: string) => {
        const row = pinnedRows[id] ?? {
          external_account_id: null,
          broker_server: null,
        };
        const loginOk =
          row.external_account_id === null ||
          row.external_account_id === accountLogin;
        const serverOk =
          row.broker_server === null || row.broker_server === accountServer;
        if (!loginOk || !serverOk) return false;
        pinnedRows[id] = {
          external_account_id: row.external_account_id ?? accountLogin,
          broker_server: row.broker_server ?? accountServer,
        };
        return true;
      },
    ),
    _setHeartbeatState(
      id: number,
      state: { status: BrokerConnectionStatus; portfolio_id: number | null },
    ) {
      heartbeatState[id] = state;
    },
  };
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    user_id: 1,
    portfolio_id: 3,
    broker_type: BrokerType.MT5,
    status: BrokerConnectionStatus.ACTIVE,
    external_account_id: null,
    broker_server: null,
    ...overrides,
  } as any;
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1,
    platform: 'MT5',
    accountLogin: 12345678,
    accountServer: 'Broker-Live-01',
    clientId: 'WisenancialMT5EA/1.0.0',
    sentAt: new Date().toISOString(),
    eventType: Mt5EventType.HEARTBEAT,
    payload: {},
    ...overrides,
  } as any;
}

const positionPayload = {
  positionTicket: 'P1',
  symbol: 'XAUUSD',
  direction: 'LONG',
  volume: 1,
  openPrice: 2350,
  currentPrice: 2360,
  sl: 2300,
  tp: 2400,
  swap: 0,
  profit: 100,
  openedAt: '2026-09-01T08:00:00Z',
};

const accountSnapshotPayload = {
  accountLogin: 12345678,
  balance: 10000,
  equity: 10100,
  margin: 200,
  marginFree: 9900,
  marginLevel: 5000,
  credit: 0,
  currency: 'USD',
  leverage: 100,
};

describe('Mt5SyncService — unified heartbeat response + TOFU account identity (Phase 3J prep)', () => {
  let service: Mt5SyncService;
  let connectionsMock: ReturnType<typeof createConnectionsMock>;

  beforeEach(async () => {
    jest.clearAllMocks();
    snapshotSequenceStore = {};
    connectionsMock = createConnectionsMock();
    const prismaMock = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Mt5SyncService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TradesService, useValue: tradesMock },
        { provide: BrokerConnectionsService, useValue: connectionsMock },
        { provide: BrokerSyncGateway, useValue: syncGatewayMock },
      ],
    }).compile();
    service = module.get<Mt5SyncService>(Mt5SyncService);
  });

  describe('§1 unified heartbeat response', () => {
    it('a valid HEARTBEAT returns connection state (id/status/portfolio_id/last_snapshot_sequence/last_sync_at)', async () => {
      snapshotSequenceStore[7] = 41;
      const result: any = await service.ingest(
        connection(),
        envelope({ eventType: Mt5EventType.HEARTBEAT }),
      );

      expect(result.eventType).toBe('HEARTBEAT');
      expect(result.applied).toBe(true);
      expect(result.connection).toMatchObject({
        id: 7,
        status: BrokerConnectionStatus.ACTIVE,
        portfolio_id: 3,
        last_snapshot_sequence: 41,
      });
      expect(result.connection).toHaveProperty('last_sync_at');
    });

    it('an unbound connection (portfolio_id null) is still allowed to heartbeat and gets its state back', async () => {
      connectionsMock._setHeartbeatState(7, {
        status: BrokerConnectionStatus.ACTIVE,
        portfolio_id: null,
      });

      const result: any = await service.ingest(
        connection({ portfolio_id: null }),
        envelope({ eventType: Mt5EventType.HEARTBEAT }),
      );

      expect(result.applied).toBe(true);
      expect(result.connection.portfolio_id).toBeNull();
    });

    it('never exposes api_key_hash or OAuth token fields in the heartbeat response', async () => {
      const result: any = await service.ingest(
        connection(),
        envelope({ eventType: Mt5EventType.HEARTBEAT }),
      );

      expect(result.connection).not.toHaveProperty('api_key_hash');
      expect(result.connection).not.toHaveProperty(
        'oauth_access_token_encrypted',
      );
      expect(result.connection).not.toHaveProperty(
        'oauth_refresh_token_encrypted',
      );
    });

    // Guard-level 401 for revoked/invalid API key is out of Mt5SyncService's reach —
    // see file header. Nothing to test here beyond confirming this service never
    // second-guesses connection.status itself for HEARTBEAT (that's the guard's job).
  });

  describe('§2 TOFU pinning — first use / subsequent / mismatch', () => {
    it('1. first successful ingest for a brand-new connection pins both fields', async () => {
      const result: any = await service.ingest(
        connection({ external_account_id: null, broker_server: null }),
        envelope({ accountLogin: 12345678, accountServer: 'Broker-Live-01' }),
      );

      expect(result.applied).toBe(true);
      expect(connectionsMock._pinnedRows[7]).toEqual({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });
    });

    it('2. a subsequent request with the matching identity is accepted (fast path — no pin write needed)', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      const result: any = await service.ingest(
        pinned,
        envelope({ accountLogin: 12345678, accountServer: 'Broker-Live-01' }),
      );

      expect(result.applied).toBe(true);
      // already fully pinned in-memory -> fast path never calls the DB pin method at all
      expect(connectionsMock.pinOrVerifyMt5Identity).not.toHaveBeenCalled();
    });

    it('3. accountLogin mismatch against an already-pinned connection is rejected', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          pinned,
          envelope({ accountLogin: 99999999, accountServer: 'Broker-Live-01' }),
        ),
      ).rejects.toThrow(BadRequestException);

      // Setup-wizard error surfacing — the frontend polls last_error_code to show a
      // specific reason instead of an indefinite spinner (see mt5-ingest-error-codes.ts).
      expect(connectionsMock.recordError).toHaveBeenCalledWith(
        7,
        'ACCOUNT_MISMATCH',
        expect.any(String),
      );
    });

    it('4. accountServer (broker_server) mismatch against an already-pinned connection is rejected', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          pinned,
          envelope({ accountLogin: 12345678, accountServer: 'Broker-Live-99' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. both accountLogin and accountServer mismatching is rejected', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          pinned,
          envelope({ accountLogin: 99999999, accountServer: 'Broker-Live-99' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. partially-populated connection (server pinned, login still null): matching server fills in the missing login', async () => {
      const partial = connection({
        external_account_id: null,
        broker_server: 'Broker-Live-01',
      });

      const result: any = await service.ingest(
        partial,
        envelope({ accountLogin: 12345678, accountServer: 'Broker-Live-01' }),
      );

      expect(result.applied).toBe(true);
      expect(connectionsMock.pinOrVerifyMt5Identity).toHaveBeenCalledWith(
        7,
        '12345678',
        'Broker-Live-01',
      );
    });

    it('6b. partially-populated connection: a mismatch on the ALREADY-populated field is rejected without touching the still-null one', async () => {
      const partial = connection({
        external_account_id: null,
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          partial,
          envelope({
            accountLogin: 12345678,
            accountServer: 'Broker-Live-WRONG',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      // rejected purely from the in-memory fast check — never even reaches the DB call
      expect(connectionsMock.pinOrVerifyMt5Identity).not.toHaveBeenCalled();
    });

    it('7. concurrent first-use race: two different accountLogins racing on the same brand-new connection — only one wins', async () => {
      const fresh = connection({
        external_account_id: null,
        broker_server: null,
      });

      const [a, b] = await Promise.allSettled([
        service.ingest(
          fresh,
          envelope({ accountLogin: 11111111, accountServer: 'Broker-Live-01' }),
        ),
        service.ingest(
          fresh,
          envelope({ accountLogin: 22222222, accountServer: 'Broker-Live-01' }),
        ),
      ]);

      const outcomes = [a.status, b.status].sort();
      expect(outcomes).toEqual(['fulfilled', 'rejected']);
      // whichever won, the pinned row reflects exactly one identity, never a mix
      const pinnedLogin = connectionsMock._pinnedRows[7].external_account_id;
      expect(['11111111', '22222222']).toContain(pinnedLogin);
    });

    it('8. HEARTBEAT participates in pinning (rejects a mismatched account on heartbeat too)', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          pinned,
          envelope({
            eventType: Mt5EventType.HEARTBEAT,
            accountLogin: 99999999,
            accountServer: 'Broker-Live-01',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('9. RECONCILE participates in pinning (rejects a mismatched account before touching deals/positions)', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          pinned,
          envelope({
            eventType: Mt5EventType.RECONCILE,
            accountLogin: 99999999,
            accountServer: 'Broker-Live-01',
            payload: {
              accountSnapshot: accountSnapshotPayload,
              positionsSnapshot: {
                snapshotId: 'uuid-1',
                snapshotType: 'FULL',
                snapshotSequence: 5,
                positionCount: 1,
                positions: [positionPayload],
              },
              deals: [],
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(tradesMock.upsertMt5Position).not.toHaveBeenCalled();
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
      expect(tradesMock.applyMt5Deal).not.toHaveBeenCalled();
    });

    it('10. a rejected mismatch never mutates trades/records (upsert/close-by-absence/deals all untouched)', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });

      await expect(
        service.ingest(
          pinned,
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            accountLogin: 99999999,
            accountServer: 'Broker-Live-01',
            payload: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: 1,
              positions: [positionPayload],
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(tradesMock.upsertMt5Position).not.toHaveBeenCalled();
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
      // Phase 3L — nothing changed, so no realtime "go refetch" signal either
      expect(syncGatewayMock.broadcastMt5SyncUpdate).not.toHaveBeenCalled();
    });

    it('11. a rejected mismatch never advances last_snapshot_sequence, even when its snapshotSequence would otherwise be treated as a harmless stale duplicate (<=)', async () => {
      const pinned = connection({
        external_account_id: '12345678',
        broker_server: 'Broker-Live-01',
      });
      snapshotSequenceStore[7] = 102; // already at 102 — an incoming <=102 would normally be a silent no-op

      await expect(
        service.ingest(
          pinned,
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            accountLogin: 99999999, // wrong account
            accountServer: 'Broker-Live-01',
            payload: {
              snapshotId: 'uuid-x',
              snapshotType: 'FULL',
              snapshotSequence: 50, // <= 102, would be a harmless no-op for the RIGHT account
              positionCount: 0,
              positions: [],
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);

      // rejected as an identity mismatch (loud 400), never silently absorbed as a
      // stale-duplicate no-op — the sequence gate is never even reached
      expect(snapshotSequenceStore[7]).toBe(102);
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
    });
  });
});

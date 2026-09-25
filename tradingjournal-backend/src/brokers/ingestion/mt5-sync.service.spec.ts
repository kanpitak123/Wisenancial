import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TraderAnalyticsService } from '../../analytics/trader-analytics.service';
import { TradesService } from '../../trades/trades.service';
import { BrokerSyncGateway } from '../broker-sync.gateway';
import { BrokerConnectionsService } from '../connections/broker-connections.service';
import { Mt5EventType } from './dto/mt5-ingest.dto';
import { Mt5SyncService } from './mt5-sync.service';

/**
 * broker_connections.last_snapshot_sequence needs to persist across separate
 * service.ingest() calls within a test (simulating separate HTTP requests hitting the
 * same connection) so snapshot-ordering tests can assert real gating behavior, not just
 * that some mock was called. Keyed by connection id so different tests/connections
 * don't bleed into each other.
 */
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

let prismaMock: ReturnType<typeof createPrismaMock>;

const tradesMock = {
  upsertMt5Position: jest.fn(async () => ({ id: 1 })),
  closeMt5PositionsByAbsence: jest.fn(async () => []),
  applyMt5Deal: jest.fn(async () => ({ trade: { id: 1 }, applied: true })),
};

const connectionsMock = {
  recordHeartbeat: jest.fn(async () => ({})),
  recordSync: jest.fn(async () => ({})),
  pinOrVerifyMt5Identity: jest.fn(async () => true),
  recordError: jest.fn(async () => undefined),
};

const syncGatewayMock = {
  broadcastMt5SyncUpdate: jest.fn(),
};

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
    accountServer: 'Broker-Server',
    clientId: 'WisenancialMT5EA/1.0.0',
    sentAt: new Date().toISOString(),
    eventType: Mt5EventType.HEARTBEAT,
    payload: {},
    ...overrides,
  } as any;
}

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

const dealPayload = {
  dealTicket: 'D1',
  orderTicket: 'O1',
  positionTicket: 'P1',
  symbol: 'XAUUSD',
  entryType: 'IN',
  volume: 1,
  price: 2350,
  commission: -5,
  swap: 0,
  profit: 0,
  executedAt: '2026-09-01T08:00:00Z',
};

describe('Mt5SyncService', () => {
  let service: Mt5SyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    snapshotSequenceStore = {};
    prismaMock = createPrismaMock();
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

  describe('protocol / envelope validation', () => {
    it('rejects an unsupported protocolVersion', async () => {
      await expect(
        service.ingest(connection(), envelope({ protocolVersion: 999 })),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when envelope.platform does not match the authenticated connection broker_type', async () => {
      await expect(
        service.ingest(connection({ broker_type: BrokerType.MT4 }), envelope()),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects sentAt far outside the clock-skew window', async () => {
      const staleSentAt = new Date(
        Date.now() - 48 * 60 * 60 * 1000,
      ).toISOString();
      await expect(
        service.ingest(connection(), envelope({ sentAt: staleSentAt })),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a timestamp within the generous clock-skew window', async () => {
      const almostFresh = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
      await expect(
        service.ingest(connection(), envelope({ sentAt: almostFresh })),
      ).resolves.toBeDefined();
    });
  });

  describe('HEARTBEAT', () => {
    it('does not require a portfolio binding', async () => {
      const result = await service.ingest(
        connection({ portfolio_id: null }),
        envelope({ eventType: Mt5EventType.HEARTBEAT }),
      );
      expect(result.applied).toBe(true);
      expect(connectionsMock.recordHeartbeat).toHaveBeenCalledWith(7);
    });
  });

  describe('portfolio-binding requirement', () => {
    it.each([
      Mt5EventType.ACCOUNT_SNAPSHOT,
      Mt5EventType.POSITIONS_SNAPSHOT,
      Mt5EventType.DEALS,
      Mt5EventType.RECONCILE,
    ])(
      'rejects %s when the connection has no portfolio bound',
      async (eventType) => {
        const payloadByType: Record<string, unknown> = {
          [Mt5EventType.ACCOUNT_SNAPSHOT]: accountSnapshotPayload,
          [Mt5EventType.POSITIONS_SNAPSHOT]: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 1,
            positionCount: 1,
            positions: [positionPayload],
          },
          [Mt5EventType.DEALS]: { deals: [dealPayload] },
          [Mt5EventType.RECONCILE]: {
            accountSnapshot: accountSnapshotPayload,
            positionsSnapshot: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: 0,
              positions: [],
            },
            deals: [],
          },
        };

        await expect(
          service.ingest(
            connection({ portfolio_id: null }),
            envelope({ eventType, payload: payloadByType[eventType] }),
          ),
        ).rejects.toThrow(ForbiddenException);

        expect(connectionsMock.recordError).toHaveBeenCalledWith(
          7,
          'PORTFOLIO_NOT_BOUND',
          expect.any(String),
        );
      },
    );
  });

  describe('setup-wizard error surfacing (last_error_code)', () => {
    it('records CONFIG_ERROR for a generic rejected request (unsupported protocol version)', async () => {
      await expect(
        service.ingest(connection(), envelope({ protocolVersion: 999 })),
      ).rejects.toThrow(BadRequestException);

      expect(connectionsMock.recordError).toHaveBeenCalledWith(
        7,
        'CONFIG_ERROR',
        expect.any(String),
      );
    });

    it('does not record anything for a successful ingest', async () => {
      await service.ingest(
        connection(),
        envelope({ eventType: Mt5EventType.HEARTBEAT }),
      );

      expect(connectionsMock.recordError).not.toHaveBeenCalled();
    });
  });

  describe('ACCOUNT_SNAPSHOT', () => {
    it('accepts a structurally valid account snapshot and records sync', async () => {
      const result = await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.ACCOUNT_SNAPSHOT,
          payload: accountSnapshotPayload,
        }),
      );
      expect(result.applied).toBe(true);
      expect(connectionsMock.recordSync).toHaveBeenCalledWith(7);
    });

    it('rejects a payload missing a required field', async () => {
      const { balance: _balance, ...broken } = accountSnapshotPayload;
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.ACCOUNT_SNAPSHOT,
            payload: broken,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unexpected extra field (whitelist/forbidNonWhitelisted)', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.ACCOUNT_SNAPSHOT,
            payload: { ...accountSnapshotPayload, extraField: 'not allowed' },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POSITIONS_SNAPSHOT — full-snapshot safety', () => {
    it('rejects snapshotType other than FULL', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            payload: {
              snapshotId: 'uuid-1',
              snapshotType: 'DELTA',
              positionCount: 1,
              positions: [positionPayload],
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when positionCount does not match positions.length (malformed/inconsistent snapshot)', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            payload: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: 5,
              positions: [positionPayload],
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
    });

    it('never invokes closing-by-absence when the snapshot is rejected as malformed', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            payload: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: 0 /* missing positions[] */,
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
    });

    it('accepts a valid FULL snapshot and applies closing-by-absence exactly once', async () => {
      const result = await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 1,
            positionCount: 1,
            positions: [positionPayload],
          },
        }),
      );
      expect(result.upsertedCount).toBe(1);
      expect(result.accepted).toBe(true);
      expect(tradesMock.upsertMt5Position).toHaveBeenCalledTimes(1);
      expect(tradesMock.closeMt5PositionsByAbsence).toHaveBeenCalledTimes(1);
      expect(connectionsMock.recordSync).toHaveBeenCalledWith(7);
    });

    it('an empty FULL positions[] is accepted (0 open positions is a legitimate state) and still runs closing-by-absence', async () => {
      const result = await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 1,
            positionCount: 0,
            positions: [],
          },
        }),
      );
      expect(result.upsertedCount).toBe(0);
      expect(result.accepted).toBe(true);
      expect(tradesMock.closeMt5PositionsByAbsence).toHaveBeenCalledWith(
        expect.anything(),
        7,
        new Set(),
      );
    });
  });

  describe('POSITIONS_SNAPSHOT — snapshotSequence staleness/ordering (Phase 3 hardening review §2/§3)', () => {
    function snapshotEnvelope(
      sequence: number,
      overrides: Record<string, unknown> = {},
    ) {
      return envelope({
        eventType: Mt5EventType.POSITIONS_SNAPSHOT,
        payload: {
          snapshotId: `uuid-${sequence}`,
          snapshotType: 'FULL',
          snapshotSequence: sequence,
          positionCount: 1,
          positions: [positionPayload],
          ...overrides,
        },
      });
    }

    it('1. snapshot 101 then 102 — both strictly newer, both applied in order', async () => {
      const r101 = await service.ingest(connection(), snapshotEnvelope(101));
      const r102 = await service.ingest(connection(), snapshotEnvelope(102));

      expect(r101.accepted).toBe(true);
      expect(r102.accepted).toBe(true);
      expect(tradesMock.closeMt5PositionsByAbsence).toHaveBeenCalledTimes(2);
    });

    it('2. snapshot 102 then 101 — the late-arriving older snapshot is rejected as stale, does not close/upsert', async () => {
      const r102 = await service.ingest(connection(), snapshotEnvelope(102));
      expect(r102.accepted).toBe(true);
      tradesMock.upsertMt5Position.mockClear();
      tradesMock.closeMt5PositionsByAbsence.mockClear();

      const r101 = await service.ingest(connection(), snapshotEnvelope(101));

      expect(r101.accepted).toBe(false);
      expect(tradesMock.upsertMt5Position).not.toHaveBeenCalled();
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
      // stale snapshot must not regress the stored sequence back down to 101
      expect(snapshotSequenceStore[7]).toBe(102);
    });

    it('3. duplicate 102 sent twice — second delivery is a harmless no-op, not an error', async () => {
      const first = await service.ingest(connection(), snapshotEnvelope(102));
      expect(first.accepted).toBe(true);
      tradesMock.upsertMt5Position.mockClear();
      tradesMock.closeMt5PositionsByAbsence.mockClear();

      const second = await service.ingest(connection(), snapshotEnvelope(102));

      expect(second.accepted).toBe(false);
      expect(tradesMock.upsertMt5Position).not.toHaveBeenCalled();
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
      expect(snapshotSequenceStore[7]).toBe(102);
    });

    it('4. empty FULL snapshot with a strictly newer sequence is accepted (0 open positions is legitimate)', async () => {
      const result = await service.ingest(
        connection(),
        snapshotEnvelope(5, { positionCount: 0, positions: [] }),
      );
      expect(result.accepted).toBe(true);
      expect(tradesMock.closeMt5PositionsByAbsence).toHaveBeenCalledWith(
        expect.anything(),
        7,
        new Set(),
      );
    });

    it('5. invalid snapshot (DTO validation failure) never reaches the sequence gate or closing-by-absence', async () => {
      const { snapshotSequence, ...brokenPayload } = {
        snapshotId: 'uuid-x',
        snapshotType: 'FULL',
        snapshotSequence: 10,
        positionCount: 1,
        positions: [positionPayload],
      };
      void snapshotSequence;
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            payload: brokenPayload,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
      expect(snapshotSequenceStore[7]).toBeUndefined();
    });

    it('6. positionCount mismatch is rejected before the sequence gate ever runs (stored sequence unaffected)', async () => {
      await expect(
        service.ingest(
          connection(),
          snapshotEnvelope(10, { positionCount: 99 }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
      expect(snapshotSequenceStore[7]).toBeUndefined();
    });

    it('7. a stale snapshot can never trigger closing-by-absence, even one listing zero positions', async () => {
      await service.ingest(connection(), snapshotEnvelope(50));
      tradesMock.closeMt5PositionsByAbsence.mockClear();

      const stale = await service.ingest(
        connection(),
        snapshotEnvelope(10, { positionCount: 0, positions: [] }),
      );

      expect(stale.accepted).toBe(false);
      expect(tradesMock.closeMt5PositionsByAbsence).not.toHaveBeenCalled();
    });

    it('sequences are tracked independently per connection', async () => {
      const connA = connection({ id: 7 });
      const connB = connection({ id: 8 });

      await service.ingest(connA, snapshotEnvelope(100));
      const staleForB = await service.ingest(connB, snapshotEnvelope(5));

      // 5 is newer than connection B's own history (still null/unset) even though it's
      // far below connection A's 100 — per-connection state must not bleed across connections
      expect(staleForB.accepted).toBe(true);
      expect(snapshotSequenceStore[7]).toBe(100);
      expect(snapshotSequenceStore[8]).toBe(5);
    });
  });

  describe('DEALS', () => {
    it('normalizes and forwards each deal to TradesService.applyMt5Deal', async () => {
      const result = await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );
      expect(tradesMock.applyMt5Deal).toHaveBeenCalledTimes(1);
      expect(result.totalCount).toBe(1);
      expect(result.appliedCount).toBe(1);
    });

    it('counts a duplicate deal (applied=false) separately from applied', async () => {
      tradesMock.applyMt5Deal.mockResolvedValueOnce({
        trade: { id: 1 },
        applied: false,
      });
      const result = await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );
      expect(result.appliedCount).toBe(0);
      expect(result.duplicateCount).toBe(1);
    });

    it('rejects a deal with an invalid entryType at the DTO layer', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.DEALS,
            payload: { deals: [{ ...dealPayload, entryType: 'CLOSE' }] },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // 2026-09-24: closes the QA-round latency fix's cache-invalidation gap — the broker-sync
  // path used to rely on the Analytics TTL cache expiring naturally (up to 15s of stale
  // numbers after a sync) instead of busting it immediately like the manual/CSV trade
  // write paths do.
  describe('Analytics cache invalidation', () => {
    let invalidateSpy: jest.SpyInstance;

    beforeEach(() => {
      invalidateSpy = jest
        .spyOn(TraderAnalyticsService, 'invalidate')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      invalidateSpy.mockRestore();
    });

    it('POSITIONS_SNAPSHOT: invalidates once, keyed by portfolio/user, when the snapshot is accepted', async () => {
      await service.ingest(
        connection({ portfolio_id: 3, user_id: 1 }),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 1,
            positionCount: 1,
            positions: [positionPayload],
          },
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith(3, 1);
    });

    it('POSITIONS_SNAPSHOT: does not invalidate a stale/duplicate snapshot (accepted:false, no writes happened)', async () => {
      snapshotSequenceStore[7] = 5; // connection already at sequence 5
      await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 1,
            positionCount: 1,
            positions: [positionPayload],
          },
        }),
      );
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('DEALS: invalidates once, keyed by portfolio/user, when at least one deal is newly applied', async () => {
      await service.ingest(
        connection({ portfolio_id: 3, user_id: 1 }),
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith(3, 1);
    });

    it('DEALS: does not invalidate when the whole batch is duplicates (appliedCount:0, no writes happened)', async () => {
      tradesMock.applyMt5Deal.mockResolvedValueOnce({
        trade: { id: 1 },
        applied: false,
      });
      await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('RECONCILE', () => {
    it('applies deals before the positions snapshot (closing-by-absence sees fresh realized pnl)', async () => {
      const callOrder: string[] = [];
      tradesMock.applyMt5Deal.mockImplementation(async () => {
        callOrder.push('deal');
        return { trade: { id: 1 }, applied: true };
      });
      tradesMock.upsertMt5Position.mockImplementation(async () => {
        callOrder.push('position');
        return { id: 1 };
      });
      tradesMock.closeMt5PositionsByAbsence.mockImplementation(async () => {
        callOrder.push('close-by-absence');
        return [];
      });

      await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.RECONCILE,
          payload: {
            accountSnapshot: accountSnapshotPayload,
            positionsSnapshot: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: 1,
              positions: [positionPayload],
            },
            deals: [dealPayload],
          },
        }),
      );

      expect(callOrder).toEqual(['deal', 'position', 'close-by-absence']);
    });

    it('rejects a RECONCILE payload whose positionsSnapshot is not FULL', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.RECONCILE,
            payload: {
              accountSnapshot: accountSnapshotPayload,
              positionsSnapshot: {
                snapshotId: 'uuid-1',
                snapshotType: 'DELTA',
                positionCount: 0,
                positions: [],
              },
              deals: [],
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Phase 3L — realtime broadcast only fires when something actually changed', () => {
    it('POSITIONS_SNAPSHOT: broadcasts to the connection owner (user_id) when accepted', async () => {
      await service.ingest(
        connection({ user_id: 42 }),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 1,
            positionCount: 1,
            positions: [positionPayload],
          },
        }),
      );

      expect(syncGatewayMock.broadcastMt5SyncUpdate).toHaveBeenCalledTimes(1);
      expect(syncGatewayMock.broadcastMt5SyncUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          connectionId: 7,
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          portfolioId: 3,
          upsertedCount: 1,
        }),
      );
    });

    it('POSITIONS_SNAPSHOT: does NOT broadcast when the snapshot is rejected as stale/duplicate', async () => {
      // sequence 1 accepted first, then a duplicate resend of the same sequence
      await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 5,
            positionCount: 1,
            positions: [positionPayload],
          },
        }),
      );
      syncGatewayMock.broadcastMt5SyncUpdate.mockClear();

      const result = await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.POSITIONS_SNAPSHOT,
          payload: {
            snapshotId: 'uuid-1',
            snapshotType: 'FULL',
            snapshotSequence: 5,
            positionCount: 1,
            positions: [positionPayload],
          },
        }),
      );

      expect(result.accepted).toBe(false);
      expect(syncGatewayMock.broadcastMt5SyncUpdate).not.toHaveBeenCalled();
    });

    it('DEALS: broadcasts when at least one deal is newly applied', async () => {
      await service.ingest(
        connection({ user_id: 42 }),
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );

      expect(syncGatewayMock.broadcastMt5SyncUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          eventType: Mt5EventType.DEALS,
          appliedDealsCount: 1,
        }),
      );
    });

    it('DEALS: does NOT broadcast when the whole batch is duplicates (appliedCount:0)', async () => {
      tradesMock.applyMt5Deal.mockResolvedValueOnce({
        trade: { id: 1 },
        applied: false,
      });

      await service.ingest(
        connection(),
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );

      expect(syncGatewayMock.broadcastMt5SyncUpdate).not.toHaveBeenCalled();
    });

    it('HEARTBEAT never broadcasts (nothing mutates)', async () => {
      await service.ingest(
        connection(),
        envelope({ eventType: Mt5EventType.HEARTBEAT }),
      );
      expect(syncGatewayMock.broadcastMt5SyncUpdate).not.toHaveBeenCalled();
    });

    it('RECONCILE: broadcasts once when either the deals or the positions half changed something', async () => {
      const result = await service.ingest(
        connection({ user_id: 42 }),
        envelope({
          eventType: Mt5EventType.RECONCILE,
          payload: {
            accountSnapshot: accountSnapshotPayload,
            positionsSnapshot: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: 1,
              positions: [positionPayload],
            },
            deals: [dealPayload],
          },
        }),
      );

      expect((result.positions as any).accepted).toBe(true);
      expect(syncGatewayMock.broadcastMt5SyncUpdate).toHaveBeenCalledTimes(1);
      expect(syncGatewayMock.broadcastMt5SyncUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          eventType: Mt5EventType.RECONCILE,
          upsertedCount: 1,
          appliedDealsCount: 1,
        }),
      );
    });
  });

  describe('payload size limits', () => {
    it('rejects a positions[] array larger than the configured cap (2000)', async () => {
      const tooMany = Array.from({ length: 2001 }, (_, i) => ({
        ...positionPayload,
        positionTicket: `P${i}`,
      }));
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.POSITIONS_SNAPSHOT,
            payload: {
              snapshotId: 'uuid-1',
              snapshotType: 'FULL',
              snapshotSequence: 1,
              positionCount: tooMany.length,
              positions: tooMany,
            },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    }, 15000);

    it('rejects a deals[] array larger than the configured cap (2000)', async () => {
      const tooMany = Array.from({ length: 2001 }, (_, i) => ({
        ...dealPayload,
        dealTicket: `D${i}`,
      }));
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.DEALS,
            payload: { deals: tooMany },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    }, 15000);
  });

  describe('portfolio_id is never taken from the EA payload', () => {
    it('a spoofed portfolio_id-shaped field inside the payload is rejected by whitelist validation, not honored', async () => {
      await expect(
        service.ingest(
          connection(),
          envelope({
            eventType: Mt5EventType.DEALS,
            payload: { deals: [dealPayload], portfolio_id: 999 },
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('TradesService always receives portfolioId sourced from the authenticated connection, never from payload', async () => {
      const spoofedConnection = connection({ portfolio_id: 3 });
      await service.ingest(
        spoofedConnection,
        envelope({
          eventType: Mt5EventType.DEALS,
          payload: { deals: [dealPayload] },
        }),
      );
      expect(tradesMock.applyMt5Deal).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ portfolioId: 3, connectionId: 7, userId: 1 }),
      );
    });
  });
});

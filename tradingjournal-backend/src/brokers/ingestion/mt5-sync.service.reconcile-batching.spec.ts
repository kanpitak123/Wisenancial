import { Test, TestingModule } from '@nestjs/testing';
import { BrokerConnectionStatus, BrokerType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordsService } from '../../records/records.service';
import { PnlCalculatorService } from '../../trades/pnl-calculator.service';
import { TradesService } from '../../trades/trades.service';
import { BrokerSyncGateway } from '../broker-sync.gateway';
import { BrokerConnectionsService } from '../connections/broker-connections.service';
import { Mt5EventType } from './dto/mt5-ingest.dto';
import { Mt5SyncService } from './mt5-sync.service';

/**
 * Phase 3 pre-EA hardening review §1 — "OR, if technically cleaner: allow
 * reconciliation to span multiple requests". This spec proves that alternative is
 * already safe today with zero new machinery: a RECONCILE's deals[] doesn't have to
 * arrive in one giant request — the EA can send several plain DEALS events instead
 * (each well within the route's body limit, see mt5-ingest-body-limit.ts) and the
 * result is identical to one big batch, because TradesService.applyMt5Deal dedupes by
 * dealTicket against durable DB state (not in-memory per-request state) and
 * recomputes totals from the full accumulated deal log every time — see Phase 3 design
 * review §4 "Idempotency design" and trades.service.mt5-sync.spec.ts. No new table, no
 * batch/session token needed.
 *
 * Wires a REAL TradesService (against an in-memory fake Prisma.TransactionClient,
 * same technique as trades.service.mt5-sync.spec.ts) behind a REAL Mt5SyncService, so
 * these tests exercise actual dedupe/accumulation logic — not just that some mock was
 * called.
 */
function createFakeTx() {
  let nextId = 1;
  const tradeRows: Record<string, any>[] = [];
  const connectionRows: Record<number, { last_snapshot_sequence: number | null }> = {};

  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const tx = {
    trades: {
      findFirst: jest.fn(async ({ where }: any) => tradeRows.find((r) => matches(r, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => tradeRows.filter((r) => matches(r, where))),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId++, raw_data: {}, pnl: null, ...data };
        tradeRows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = tradeRows.find((r) => r.id === where.id);
        if (!row) throw new Error(`fake tx: no trade row with id ${where.id}`);
        Object.assign(row, data);
        return row;
      }),
    },
    broker_connections: {
      findUnique: jest.fn(async ({ where }: any) => connectionRows[where.id] ?? { last_snapshot_sequence: null }),
      update: jest.fn(async ({ where, data }: any) => {
        connectionRows[where.id] = { last_snapshot_sequence: data.last_snapshot_sequence };
        return {};
      }),
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, tradeRows };
}

const recordsMock = {
  createSystem: jest.fn(),
  replaceSystem: jest.fn(async (input: any) => ({ id: 999, amount: new Prisma.Decimal(input.signedAmount) })),
};

const connectionsMock = {
  recordHeartbeat: jest.fn(async () => ({})),
  recordSync: jest.fn(async () => ({})),
  pinOrVerifyMt5Identity: jest.fn(async () => true),
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
    eventType: Mt5EventType.DEALS,
    payload: {},
    ...overrides,
  } as any;
}

function deal(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('Mt5SyncService — DEALS spanning multiple requests (RECONCILE batching alternative)', () => {
  let service: Mt5SyncService;
  let tx: Prisma.TransactionClient;
  let tradeRows: Record<string, any>[];

  beforeEach(async () => {
    jest.clearAllMocks();
    const fake = createFakeTx();
    tx = fake.tx;
    tradeRows = fake.tradeRows;

    const prismaMock = { $transaction: jest.fn(async (fn: any) => fn(tx)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Mt5SyncService,
        TradesService,
        PnlCalculatorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RecordsService, useValue: recordsMock },
        { provide: BrokerConnectionsService, useValue: connectionsMock },
        { provide: BrokerSyncGateway, useValue: syncGatewayMock },
      ],
    }).compile();
    service = module.get<Mt5SyncService>(Mt5SyncService);
  });

  it('multiple DEALS batches: a deal history split across two separate ingest() calls accumulates identically to one big batch', async () => {
    const batch1 = [
      deal({ dealTicket: 'D1', entryType: 'IN', volume: 1.0, commission: -5, swap: 0, profit: 0 }),
      deal({ dealTicket: 'D2', entryType: 'OUT', volume: 0.3, commission: -1.5, swap: -0.5, profit: 30 }),
    ];
    const batch2 = [
      deal({ dealTicket: 'D3', entryType: 'OUT', volume: 0.3, commission: -1.5, swap: -0.5, profit: 45 }),
      deal({ dealTicket: 'D4', entryType: 'OUT', volume: 0.4, commission: -2, swap: -1, profit: 80 }),
    ];

    const r1 = await service.ingest(connection(), envelope({ payload: { deals: batch1 } }));
    const r2 = await service.ingest(connection(), envelope({ payload: { deals: batch2 } }));

    expect(r1.appliedCount).toBe(2);
    expect(r2.appliedCount).toBe(2);
    expect(tradeRows).toHaveLength(1);
    const row = tradeRows[0];
    expect(row.ticket_id).toBe('P1');
    expect(Number(row.commission)).toBeCloseTo(-10);
    expect(Number(row.swap)).toBeCloseTo(-2);
    expect(Number(row.pnl)).toBeCloseTo(155);
    expect(row.raw_data.deals.map((d: any) => d.dealTicket)).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('duplicate DEAL_TICKET across batches: resending an already-applied deal in a later batch is deduped, not double counted', async () => {
    const batch1 = [
      deal({ dealTicket: 'D1', entryType: 'IN', volume: 1.0, commission: -5, swap: 0, profit: 0 }),
      deal({ dealTicket: 'D2', entryType: 'OUT', volume: 0.3, commission: -1.5, swap: -0.5, profit: 30 }),
    ];
    // batch2 re-sends D2 (already applied in batch1 — e.g. EA retried after a timeout
    // that actually succeeded server-side) alongside genuinely new deals
    const batch2 = [
      deal({ dealTicket: 'D2', entryType: 'OUT', volume: 0.3, commission: -1.5, swap: -0.5, profit: 30 }),
      deal({ dealTicket: 'D3', entryType: 'OUT', volume: 0.7, commission: -3.5, swap: -0.5, profit: 90 }),
    ];

    await service.ingest(connection(), envelope({ payload: { deals: batch1 } }));
    const r2 = await service.ingest(connection(), envelope({ payload: { deals: batch2 } }));

    expect(r2.appliedCount).toBe(1); // only D3
    expect(r2.duplicateCount).toBe(1); // D2
    expect(tradeRows).toHaveLength(1);
    const row = tradeRows[0];
    expect(row.raw_data.deals).toHaveLength(3); // D1, D2, D3 — D2 not duplicated
    expect(Number(row.pnl)).toBeCloseTo(120); // 30 (D2) + 90 (D3), not 150
    expect(Number(row.volume)).toBeCloseTo(0); // 1.0 in - (0.3 + 0.7) out
  });

  it('out-of-order batches: a later batch (chronologically) arrives and is processed before an earlier one, final state still converges correctly', async () => {
    const earlyBatch = [
      deal({ dealTicket: 'D1', entryType: 'IN', volume: 1.0, commission: -5, swap: 0, profit: 0 }),
      deal({ dealTicket: 'D2', entryType: 'OUT', volume: 0.3, commission: -1.5, swap: -0.5, profit: 30 }),
    ];
    const laterBatch = [
      deal({ dealTicket: 'D3', entryType: 'OUT', volume: 0.7, commission: -3.5, swap: -0.5, profit: 90 }),
    ];

    // laterBatch (D3, which depends on the position D1 opened) arrives and is processed
    // first — e.g. network reordering between two independent EA requests
    const r1 = await service.ingest(connection(), envelope({ payload: { deals: laterBatch } }));
    const r2 = await service.ingest(connection(), envelope({ payload: { deals: earlyBatch } }));

    expect(r1.appliedCount).toBe(1);
    expect(r2.appliedCount).toBe(2);
    expect(tradeRows).toHaveLength(1); // still one row, keyed by positionTicket regardless of arrival order
    const row = tradeRows[0];
    expect(Number(row.commission)).toBeCloseTo(-10);
    expect(Number(row.swap)).toBeCloseTo(-1);
    expect(Number(row.pnl)).toBeCloseTo(120);
    expect(Number(row.volume)).toBeCloseTo(0);
  });
});

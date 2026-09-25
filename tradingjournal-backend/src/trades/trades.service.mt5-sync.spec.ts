import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { BrokerDeal, BrokerPosition } from '../brokers/interfaces/broker-types';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { PnlCalculatorService } from './pnl-calculator.service';
import { TradesService } from './trades.service';

/**
 * Fake ของ Prisma.TransactionClient แบบ in-memory เท่าที่ mt5 sync methods ต้องใช้
 * (trades.findFirst/findMany/create/update) — เขียนแบบนี้แทน jest mock ที่ต้องกำหนดค่า
 * return ทีละ call เพราะ scenario partial-close ต้องเรียกซ้ำหลายรอบต่อเนื่องกัน (open ->
 * partial -> partial -> close -> duplicate -> replay) การมี state จริงๆ ให้ query ทำให้
 * เทสต์อ่านง่ายและตรงกับพฤติกรรมจริงมากกว่า
 */
function createFakeTx() {
  let nextId = 1;
  const rows: Record<string, any>[] = [];

  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  return {
    tx: {
      trades: {
        findFirst: jest.fn(
          async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
        ),
        findMany: jest.fn(async ({ where }: any) =>
          rows.filter((r) => matches(r, where)),
        ),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextId++, raw_data: {}, pnl: null, ...data };
          rows.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = rows.find((r) => r.id === where.id);
          if (!row) throw new Error(`fake tx: no row with id ${where.id}`);
          Object.assign(row, data);
          return row;
        }),
      },
    } as unknown as Prisma.TransactionClient,
    rows,
  };
}

function position(overrides: Partial<BrokerPosition> = {}): BrokerPosition {
  return {
    externalPositionId: 'P1',
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 1.0,
    openPrice: 2350,
    currentPrice: 2360,
    profit: 100,
    openedAt: new Date('2026-09-01T08:00:00Z'),
    stopLoss: 2300,
    takeProfit: 2400,
    swap: 0,
    ...overrides,
  };
}

function deal(overrides: Partial<BrokerDeal> = {}): BrokerDeal {
  return {
    externalDealId: 'D1',
    externalOrderId: 'O1',
    externalPositionId: 'P1',
    symbol: 'XAUUSD',
    entryType: 'IN',
    volume: 1.0,
    price: 2350,
    commission: -5,
    swap: 0,
    profit: 0,
    executedAt: new Date('2026-09-01T08:00:00Z'),
    ...overrides,
  };
}

const recordsMock = {
  createSystem: jest.fn(),
  replaceSystem: jest.fn(async (input: any) => ({
    id: 999,
    amount: new Prisma.Decimal(input.signedAmount),
  })),
};

describe('TradesService — MT5 sync (Phase 3)', () => {
  let service: TradesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradesService,
        PnlCalculatorService,
        { provide: PrismaService, useValue: {} },
        { provide: RecordsService, useValue: recordsMock },
      ],
    }).compile();
    service = module.get<TradesService>(TradesService);
  });

  const CONNECTION_ID = 7;
  const PORTFOLIO_ID = 3;
  const USER_ID = 1;

  describe('partial close scenario: open -> partial -> partial -> final close', () => {
    it('produces exactly one trades row, keyed by POSITION_TICKET, with correctly accumulated totals', async () => {
      const { tx, rows } = createFakeTx();

      // 1. Open (deal IN)
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          commission: -5,
          swap: 0,
          profit: 0,
        }),
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].ticket_id).toBe('P1');
      expect(recordsMock.replaceSystem).not.toHaveBeenCalled(); // IN deal alone realizes nothing

      // 2. First partial close (OUT, 0.3 lots)
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 0.3,
          commission: -1.5,
          swap: -0.5,
          profit: 30,
        }),
      });

      expect(rows).toHaveLength(1); // still exactly one row — not a new trade
      expect(recordsMock.replaceSystem).toHaveBeenCalledTimes(1);
      expect(recordsMock.replaceSystem.mock.calls[0][0].signedAmount).toBe(30);

      // 3. Second partial close (OUT, 0.3 lots)
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D3',
          entryType: 'OUT',
          volume: 0.3,
          commission: -1.5,
          swap: -0.5,
          profit: 45,
        }),
      });

      expect(rows).toHaveLength(1);
      expect(recordsMock.replaceSystem).toHaveBeenCalledTimes(2);
      expect(recordsMock.replaceSystem.mock.calls[1][0].signedAmount).toBe(75); // cumulative: 30 + 45

      // 4. Final close (OUT, remaining 0.4 lots)
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D4',
          entryType: 'OUT',
          volume: 0.4,
          commission: -2,
          swap: -1,
          profit: 80,
        }),
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.ticket_id).toBe('P1'); // ticket_id ยังคงเป็น POSITION_TICKET เดิมตลอด ไม่เปลี่ยนเป็น DEAL_TICKET
      expect(Number(row.commission)).toBeCloseTo(-10); // -5 + -1.5 + -1.5 + -2, ไม่ double-count
      expect(Number(row.swap)).toBeCloseTo(-2); // 0 + -0.5 + -0.5 + -1, ไม่ double-count
      expect(Number(row.pnl)).toBeCloseTo(155); // 30 + 45 + 80, ไม่ double-count
      expect(row.raw_data.deals).toHaveLength(4);
      expect(row.raw_data.deals.map((d: any) => d.dealTicket)).toEqual([
        'D1',
        'D2',
        'D3',
        'D4',
      ]);
      expect(Number(row.volume)).toBeCloseTo(0); // 1.0 in - (0.3+0.3+0.4) out
      expect(recordsMock.replaceSystem).toHaveBeenCalledTimes(3);
      expect(recordsMock.replaceSystem.mock.calls[2][0].signedAmount).toBe(155);
      // result_status/closed_at ต้องไม่ถูกแตะโดย applyMt5Deal — เป็นหน้าที่ของ
      // closeMt5PositionsByAbsence เท่านั้น (แยก path การตรวจจับ "ปิดแล้ว" ออกจากกัน)
      expect(row.result_status).toBe('OPEN');
      expect(row.closed_at).toBeUndefined();
    });

    it('closing-by-absence (positions snapshot no longer lists P1) closes the row using the already-accumulated realized pnl', async () => {
      const { tx, rows } = createFakeTx();

      for (const d of [
        deal({ externalDealId: 'D1', entryType: 'IN', volume: 1.0, profit: 0 }),
        deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 0.3,
          profit: 30,
        }),
        deal({
          externalDealId: 'D3',
          entryType: 'OUT',
          volume: 0.3,
          profit: 45,
        }),
        deal({
          externalDealId: 'D4',
          entryType: 'OUT',
          volume: 0.4,
          profit: 80,
        }),
      ]) {
        await service.applyMt5Deal(tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: d,
        });
      }

      const closedIds = await service.closeMt5PositionsByAbsence(
        tx,
        CONNECTION_ID,
        new Set<string>(),
      );

      expect(closedIds).toEqual([rows[0].id]);
      expect(rows[0].result_status).toBe('WIN'); // pnl 155 > 0
      expect(rows[0].closed_at).toBeInstanceOf(Date);
    });

    it('duplicate DEAL_TICKET does nothing — no row change, no extra records write, final result unchanged', async () => {
      const { tx, rows } = createFakeTx();

      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          profit: 0,
        }),
      });
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 0.3,
          commission: -1.5,
          swap: -0.5,
          profit: 30,
        }),
      });

      const before = { ...rows[0] };
      expect(recordsMock.replaceSystem).toHaveBeenCalledTimes(1);

      const { trade, applied } = await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 0.3,
          commission: -1.5,
          swap: -0.5,
          profit: 30,
        }), // exact re-send of D2
      });

      expect(applied).toBe(false);
      expect(trade.id).toBe(before.id);
      expect(Number(trade.pnl)).toBe(Number(before.pnl));
      expect(Number(trade.commission)).toBe(Number(before.commission));
      expect(Number(trade.swap)).toBe(Number(before.swap));
      expect((trade.raw_data as any).deals).toHaveLength(2); // ยังคง 2 ไม่ใช่ 3
      expect(recordsMock.replaceSystem).toHaveBeenCalledTimes(1); // ไม่ถูกเรียกเพิ่ม
    });

    it('replaying the entire deal sequence a second time does not change the final financial result', async () => {
      const { tx, rows } = createFakeTx();
      const deals = [
        deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          commission: -5,
          swap: 0,
          profit: 0,
        }),
        deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 0.3,
          commission: -1.5,
          swap: -0.5,
          profit: 30,
        }),
        deal({
          externalDealId: 'D3',
          entryType: 'OUT',
          volume: 0.3,
          commission: -1.5,
          swap: -0.5,
          profit: 45,
        }),
        deal({
          externalDealId: 'D4',
          entryType: 'OUT',
          volume: 0.4,
          commission: -2,
          swap: -1,
          profit: 80,
        }),
      ];

      for (const d of deals) {
        await service.applyMt5Deal(tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: d,
        });
      }
      const afterFirstRun = {
        pnl: Number(rows[0].pnl),
        commission: Number(rows[0].commission),
        swap: Number(rows[0].swap),
      };
      const replaceSystemCallsAfterFirstRun =
        recordsMock.replaceSystem.mock.calls.length;

      // Simulate EA/backend restart replaying the identical payload from scratch
      for (const d of deals) {
        await service.applyMt5Deal(tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: d,
        });
      }

      expect(rows).toHaveLength(1);
      expect(Number(rows[0].pnl)).toBe(afterFirstRun.pnl);
      expect(Number(rows[0].commission)).toBe(afterFirstRun.commission);
      expect(Number(rows[0].swap)).toBe(afterFirstRun.swap);
      expect(rows[0].raw_data.deals).toHaveLength(4);
      expect(recordsMock.replaceSystem).toHaveBeenCalledTimes(
        replaceSystemCallsAfterFirstRun,
      ); // ไม่ถูกเรียกเพิ่มเลยในรอบ replay
    });

    it('deals applied out of order accumulate to the same final totals as in-order', async () => {
      const inOrder = createFakeTx();
      const outOfOrder = createFakeTx();
      const d1 = deal({
        externalDealId: 'D1',
        entryType: 'IN',
        volume: 1.0,
        commission: -5,
        swap: 0,
        profit: 0,
      });
      const d2 = deal({
        externalDealId: 'D2',
        entryType: 'OUT',
        volume: 0.3,
        commission: -1.5,
        swap: -0.5,
        profit: 30,
      });
      const d3 = deal({
        externalDealId: 'D3',
        entryType: 'OUT',
        volume: 0.7,
        commission: -3.5,
        swap: -0.5,
        profit: 90,
      });

      for (const d of [d1, d2, d3]) {
        await service.applyMt5Deal(inOrder.tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: d,
        });
      }
      for (const d of [d3, d1, d2]) {
        await service.applyMt5Deal(outOfOrder.tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: d,
        });
      }

      expect(Number(outOfOrder.rows[0].pnl)).toBe(Number(inOrder.rows[0].pnl));
      expect(Number(outOfOrder.rows[0].commission)).toBe(
        Number(inOrder.rows[0].commission),
      );
      expect(Number(outOfOrder.rows[0].swap)).toBe(
        Number(inOrder.rows[0].swap),
      );
      expect(Number(outOfOrder.rows[0].volume)).toBe(
        Number(inOrder.rows[0].volume),
      );
    });
  });

  describe('open_price on deal-first row creation (Phase 3K E2E fix)', () => {
    it('sets open_price from the opening deal price immediately — not left NULL until a snapshot arrives', async () => {
      const { tx, rows } = createFakeTx();

      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          price: 2350.55,
          profit: 0,
        }),
      });

      expect(Number(rows[0].open_price)).toBe(2350.55);
    });

    it('a position closed entirely via backlog deals before any snapshot ever sees it keeps a real open_price, not NULL/0', async () => {
      // Matches the real Phase 3K E2E bug: the initial bootstrap RECONCILE applies deals
      // before positions-snapshot (mt5-sync.service.ts §RECONCILE ordering) — a position
      // already closed within the lookback window never appears in any positionsSnapshot,
      // so upsertMt5Position() never runs for it and never gets a chance to fill open_price.
      const { tx, rows } = createFakeTx();

      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          price: 4493.11,
          profit: 0,
        }),
      });
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 1.0,
          price: 4500,
          profit: 6.89,
        }),
      });

      await service.closeMt5PositionsByAbsence(
        tx,
        CONNECTION_ID,
        new Set<string>(),
      );

      expect(rows[0].result_status).not.toBe('OPEN');
      expect(Number(rows[0].open_price)).toBe(4493.11);
    });

    it('a snapshot arriving afterwards still overwrites the deal-derived placeholder with the authoritative openPrice', async () => {
      const { tx, rows } = createFakeTx();

      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          price: 2350.55,
          profit: 0,
        }),
      });

      await service.upsertMt5Position(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        position: position({ openPrice: 2350.5 }), // ราคาจริงจาก broker อาจต่างจาก deal.price เล็กน้อย (rounding/slippage report)
      });

      expect(rows).toHaveLength(1);
      expect(Number(rows[0].open_price)).toBe(2350.5);
    });
  });

  describe('OUT_BY / INOUT — hedging-mode deal types (Phase 3 hardening review §4)', () => {
    it.each(['OUT', 'INOUT', 'OUT_BY'] as const)(
      '%s deals realize pnl into this position row using MT5-reported profit as-is, identically to OUT',
      async (entryType) => {
        const { tx, rows } = createFakeTx();

        await service.applyMt5Deal(tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: deal({
            externalDealId: 'D1',
            entryType: 'IN',
            volume: 1.0,
            commission: -5,
            swap: 0,
            profit: 0,
          }),
        });
        const { applied } = await service.applyMt5Deal(tx, {
          connectionId: CONNECTION_ID,
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          deal: deal({
            externalDealId: 'D2',
            entryType,
            volume: 1.0,
            commission: -1.5,
            swap: -0.5,
            profit: 42,
          }),
        });

        expect(applied).toBe(true);
        expect(rows).toHaveLength(1); // no cross-position netting attempted — same row
        expect(Number(rows[0].pnl)).toBe(42); // MT5's own reported profit, taken verbatim
        expect(Number(rows[0].volume)).toBeCloseTo(0);
        expect(rows[0].raw_data.deals[1].entryType).toBe(entryType); // preserved verbatim, not collapsed to a generic "OUT"
      },
    );

    it('an OUT_BY deal is scoped only to its own position_ticket — never touches a different position row', async () => {
      const { tx, rows } = createFakeTx();

      // Two independent hedged positions on the same symbol
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'A1',
          externalPositionId: 'PA',
          entryType: 'IN',
          volume: 1.0,
          profit: 0,
        }),
      });
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'B1',
          externalPositionId: 'PB',
          entryType: 'IN',
          volume: 1.0,
          profit: 0,
        }),
      });

      // MT5 reports the OUT_BY only against position PA (the leg it closed) — PB is
      // untouched by this deal; we do not infer/derive anything about PB from it
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'A2',
          externalPositionId: 'PA',
          entryType: 'OUT_BY',
          volume: 1.0,
          profit: 15,
        }),
      });

      expect(rows).toHaveLength(2);
      const rowA = rows.find((r) => r.ticket_id === 'PA')!;
      const rowB = rows.find((r) => r.ticket_id === 'PB')!;
      expect(Number(rowA.pnl)).toBe(15);
      expect(rowB.pnl).toBeNull(); // untouched — no invented netting against PA
      expect(rowB.raw_data.deals).toHaveLength(1); // only its own IN deal
    });
  });

  describe('open position modification (no deal involved)', () => {
    it('SL/TP/current price changes update metadata only — never touch pnl/commission/swap/result_status/records', async () => {
      const { tx, rows } = createFakeTx();

      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D1',
          entryType: 'IN',
          volume: 1.0,
          profit: 0,
        }),
      });
      await service.applyMt5Deal(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        deal: deal({
          externalDealId: 'D2',
          entryType: 'OUT',
          volume: 0.3,
          profit: 30,
        }),
      });
      recordsMock.replaceSystem.mockClear();

      await service.upsertMt5Position(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        position: position({
          stopLoss: 2320,
          takeProfit: 2420,
          currentPrice: 2370,
        }),
      });

      expect(rows).toHaveLength(1);
      expect(Number(rows[0].stop_loss)).toBe(2320);
      expect(Number(rows[0].take_profit)).toBe(2420);
      expect(Number(rows[0].close_price)).toBe(2370);
      expect(Number(rows[0].pnl)).toBe(30); // ไม่เปลี่ยนจากค่าที่ deal เคยตั้งไว้
      expect(rows[0].result_status).toBe('OPEN');
      expect(recordsMock.replaceSystem).not.toHaveBeenCalled();
    });

    it('duplicate/repeated snapshots are idempotent — no new row, no spurious close', async () => {
      const { tx, rows } = createFakeTx();

      await service.upsertMt5Position(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        position: position(),
      });
      await service.upsertMt5Position(tx, {
        connectionId: CONNECTION_ID,
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        position: position(),
      });

      expect(rows).toHaveLength(1);

      const closedFirst = await service.closeMt5PositionsByAbsence(
        tx,
        CONNECTION_ID,
        new Set(['P1']),
      );
      const closedSecond = await service.closeMt5PositionsByAbsence(
        tx,
        CONNECTION_ID,
        new Set(['P1']),
      );

      expect(closedFirst).toEqual([]);
      expect(closedSecond).toEqual([]);
      expect(rows[0].result_status).toBe('OPEN');
    });
  });
});

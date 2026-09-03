// Unlike the other specs in this module, this file never pulls in @nestjs/testing —
// which is what transitively loads the reflect-metadata polyfill everywhere else — but
// it still imports mt5-ingest.dto.ts (for realistic fixtures), whose class-validator
// decorators need Reflect.getMetadata to exist at import time.
import 'reflect-metadata';
import { Readable } from 'stream';
import { createMt5IngestBodyParser, MT5_INGEST_BODY_LIMIT } from './mt5-ingest-body-limit';
import { Mt5EventType, MT5_PROTOCOL_VERSION } from './dto/mt5-ingest.dto';

/**
 * Exercises the exact express.json() middleware instance main.ts mounts on
 * POST /brokers/mt/ingest — no HTTP server needed (this repo has no supertest/e2e
 * infra set up — the one file that used to depend on it, test/app.e2e-spec.ts, was
 * never wired into any npm script and didn't even compile, so it was deleted rather
 * than fixed). A fake `req` that is itself a Readable stream (with
 * .headers/.method/.url) is exactly what body-parser's read() expects; this is the
 * same technique body-parser's own test suite uses.
 */
function fakeJsonRequest(body: string) {
  const buf = Buffer.from(body, 'utf-8');
  const req = new Readable({
    read() {
      this.push(buf);
      this.push(null);
    },
  }) as Readable & { headers: Record<string, string>; method: string; url: string; body?: unknown };
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(buf.length),
  };
  req.method = 'POST';
  req.url = '/brokers/mt/ingest';
  return req;
}

function runParser(body: string): Promise<{ error: (Error & { status?: number }) | undefined; parsedBody: unknown }> {
  const parser = createMt5IngestBodyParser();
  const req = fakeJsonRequest(body);
  return new Promise((resolve) => {
    parser(req as any, {} as any, (error?: Error & { status?: number }) => {
      resolve({ error, parsedBody: req.body });
    });
  });
}

function buildReconcilePayload(positionCount: number, dealCount: number) {
  const position = (i: number) => ({
    positionTicket: `P${i}`,
    symbol: 'XAUUSD',
    direction: 'LONG',
    volume: 1.23,
    openPrice: 2350.55,
    currentPrice: 2360.12,
    sl: 2300.5,
    tp: 2400.5,
    swap: -0.5,
    profit: 123.45,
    openedAt: '2026-09-01T08:00:00.000Z',
  });
  const dealAt = (i: number) => ({
    dealTicket: `D${i}`,
    orderTicket: `O${i}`,
    positionTicket: `P${i}`,
    symbol: 'XAUUSD',
    entryType: 'OUT',
    volume: 1.23,
    price: 2350.55,
    commission: -5.5,
    swap: -0.5,
    profit: 123.45,
    executedAt: '2026-09-01T08:00:00.000Z',
  });

  return {
    protocolVersion: MT5_PROTOCOL_VERSION,
    platform: 'MT5',
    accountLogin: 12345678,
    accountServer: 'Broker-Server-Name',
    clientId: 'WisenancialMT5EA/1.0.0',
    sentAt: new Date().toISOString(),
    eventType: Mt5EventType.RECONCILE,
    payload: {
      accountSnapshot: {
        accountLogin: 12345678,
        balance: 10000.55,
        equity: 10100.55,
        margin: 200.5,
        marginFree: 9900.5,
        marginLevel: 5000.5,
        credit: 0,
        currency: 'USD',
        leverage: 100,
      },
      positionsSnapshot: {
        snapshotId: 'uuid-1',
        snapshotType: 'FULL',
        snapshotSequence: 1,
        positionCount,
        positions: Array.from({ length: positionCount }, (_, i) => position(i)),
      },
      deals: Array.from({ length: dealCount }, (_, i) => dealAt(i)),
    },
  };
}

describe('MT5 ingest route body limit', () => {
  it('is configured to a bounded, non-default value (not the raw express default)', () => {
    expect(MT5_INGEST_BODY_LIMIT).toBe('3mb');
  });

  it('accepts a valid large-ish payload at the DTO caps (2000 positions + 5000 deals, ~1.46MB)', async () => {
    const payload = buildReconcilePayload(2000, 5000);
    const body = JSON.stringify(payload);
    // sanity check the fixture actually represents a realistic worst case, not a toy
    expect(body.length).toBeGreaterThan(1_000_000);

    const { error, parsedBody } = await runParser(body);

    expect(error).toBeUndefined();
    expect((parsedBody as any).eventType).toBe('RECONCILE');
    expect((parsedBody as any).payload.deals).toHaveLength(5000);
  });

  it('rejects a payload larger than the configured route limit with a 413', async () => {
    // Comfortably over 3mb regardless of exact per-field JSON overhead.
    const oversizedPayload = buildReconcilePayload(2000, 5000);
    (oversizedPayload.payload as any).deals[0].symbol = 'X'.repeat(4 * 1024 * 1024);
    const body = JSON.stringify(oversizedPayload);
    expect(body.length).toBeGreaterThan(4 * 1024 * 1024);

    const { error, parsedBody } = await runParser(body);

    expect(error).toBeDefined();
    expect(error?.status).toBe(413);
    expect(parsedBody).toBeUndefined();
  });
});

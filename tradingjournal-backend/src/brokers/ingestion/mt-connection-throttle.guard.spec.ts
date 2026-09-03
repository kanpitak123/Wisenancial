import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { BrokerConnectionStatus, BrokerType } from '@prisma/client';
import { MtConnectionThrottleGuard } from './mt-connection-throttle.guard';

/**
 * Uses the real in-memory ThrottlerStorageService (no external deps in its
 * constructor — see @nestjs/throttler's own source) rather than a mock, so these
 * tests exercise the exact same increment/block semantics production runs on.
 */
function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    user_id: 1,
    portfolio_id: 3,
    broker_type: BrokerType.MT5,
    status: BrokerConnectionStatus.ACTIVE,
    ...overrides,
  } as any;
}

function contextWithConnection(brokerConnection: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ brokerConnection }),
    }),
  } as unknown as ExecutionContext;
}

function configServiceWith(ttlSeconds: number, limit: number) {
  return {
    get: (key: string) => {
      if (key === 'MT_INGEST_THROTTLE_TTL_SECONDS') return String(ttlSeconds);
      if (key === 'MT_INGEST_THROTTLE_LIMIT') return String(limit);
      return undefined;
    },
  } as any;
}

// ThrottlerStorageService schedules real setTimeout()s per increment() call (up to
// the configured TTL, e.g. 60s in these tests) to decrement hit counts later — track
// every instance created in a test and clear its timers in afterEach via the
// lifecycle hook @nestjs/throttler itself provides, or Jest leaks a real pending
// timer per test and warns "worker process failed to exit gracefully" at the end of
// the whole suite run.
const createdStorages: ThrottlerStorageService[] = [];
function newStorage(): ThrottlerStorageService {
  const storage = new ThrottlerStorageService();
  createdStorages.push(storage);
  return storage;
}

afterEach(() => {
  for (const storage of createdStorages) storage.onApplicationShutdown();
  createdStorages.length = 0;
});

describe('MtConnectionThrottleGuard', () => {
  it('allows requests up to the configured limit', async () => {
    const guard = new MtConnectionThrottleGuard(newStorage(), configServiceWith(60, 3));
    const context = contextWithConnection(connection());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects the request that exceeds the limit with a 429', async () => {
    const guard = new MtConnectionThrottleGuard(newStorage(), configServiceWith(60, 3));
    const context = contextWithConnection(connection());

    await guard.canActivate(context);
    await guard.canActivate(context);
    await guard.canActivate(context);

    await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
  });

  it('tracks each broker connection independently — one connection tripping the limit does not affect another', async () => {
    const storage = newStorage();
    const guard = new MtConnectionThrottleGuard(storage, configServiceWith(60, 2));

    const connA = contextWithConnection(connection({ id: 1 }));
    const connB = contextWithConnection(connection({ id: 2 }));

    await guard.canActivate(connA);
    await guard.canActivate(connA);
    await expect(guard.canActivate(connA)).rejects.toThrow(ThrottlerException); // A tripped

    // B has never been called — its own independent budget is untouched
    await expect(guard.canActivate(connB)).resolves.toBe(true);
  });

  it('rejects with UnauthorizedException (not a silent pass-through) if brokerConnection is missing — defensive guard-ordering safety net', async () => {
    const guard = new MtConnectionThrottleGuard(newStorage(), configServiceWith(60, 30));
    const context = contextWithConnection(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('defaults to a 30 req / 60s budget when no env override is configured', async () => {
    const configService = { get: () => undefined } as any;
    const guard = new MtConnectionThrottleGuard(newStorage(), configService);
    const context = contextWithConnection(connection());

    for (let i = 0; i < 30; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
  });
});

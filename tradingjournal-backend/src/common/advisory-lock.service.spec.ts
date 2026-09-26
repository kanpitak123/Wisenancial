import type { PrismaClient } from '@prisma/client';
import {
  AdvisoryLockService,
  JOB_LOCKS,
  lockDatabaseUrl,
  runLocked,
  withSingleConnection,
} from './advisory-lock.service';

/**
 * A fake "database" that behaves like Postgres advisory locks: a key can be held by one
 * session (client) at a time. Two AdvisoryLockService instances each get their own session,
 * like two backend instances.
 */
class FakeLockDatabase {
  readonly held = new Map<string, symbol>();

  session(overrides: Partial<{ failLock: boolean; failUnlock: boolean }> = {}) {
    const id = Symbol('session');
    const calls: string[] = [];

    const $queryRaw = jest.fn((strings: TemplateStringsArray, key: string) => {
      const sql = strings.join('?');

      if (sql.includes('pg_try_advisory_lock')) {
        calls.push(`lock:${key}`);
        if (overrides.failLock)
          return Promise.reject(new Error('connection refused'));
        const owner = this.held.get(key);
        if (owner && owner !== id) return Promise.resolve([{ locked: false }]);
        this.held.set(key, id);
        return Promise.resolve([{ locked: true }]);
      }

      calls.push(`unlock:${key}`);
      if (overrides.failUnlock)
        return Promise.reject(new Error('session gone'));
      if (this.held.get(key) === id) this.held.delete(key);
      return Promise.resolve([{ pg_advisory_unlock: true }]);
    });

    return {
      client: { $queryRaw, $disconnect: jest.fn() } as unknown as PrismaClient,
      calls,
    };
  }
}

class TestLockService extends AdvisoryLockService {
  constructor(private readonly fake: PrismaClient) {
    super();
  }

  protected override createClient(): PrismaClient {
    return this.fake;
  }
}

const ENV_KEYS = ['DIRECT_URL', 'DATABASE_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.DIRECT_URL = 'postgresql://u:p@direct.example.com/db';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const silence = (service: AdvisoryLockService) => {
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(service['logger'], level).mockImplementation(() => undefined);
  }
  return service;
};

describe('AdvisoryLockService.runExclusive', () => {
  it('runs the job, returns its result, and releases the lock', async () => {
    const db = new FakeLockDatabase();
    const { client, calls } = db.session();
    const service = silence(new TestLockService(client));

    const outcome = await service.runExclusive('job:a', () =>
      Promise.resolve(42),
    );

    expect(outcome).toEqual({ acquired: true, result: 42 });
    expect(calls).toEqual(['lock:job:a', 'unlock:job:a']);
    expect(db.held.size).toBe(0);
  });

  it('two instances: only one runs, the other skips; after it finishes the other can run', async () => {
    const db = new FakeLockDatabase();
    const first = silence(new TestLockService(db.session().client));
    const second = silence(new TestLockService(db.session().client));

    let release: () => void = () => undefined;
    const slowJob = jest.fn(
      () => new Promise<string>((resolve) => (release = () => resolve('done'))),
    );
    const secondJob = jest.fn(() => Promise.resolve('second'));

    const running = first.runExclusive('job:news', slowJob);
    await new Promise((resolve) => setImmediate(resolve));

    // the other instance ticks while the first is still working
    expect(await second.runExclusive('job:news', secondJob)).toEqual({
      acquired: false,
      reason: 'held-elsewhere',
    });
    expect(secondJob).not.toHaveBeenCalled();

    release();
    expect(await running).toEqual({ acquired: true, result: 'done' });

    expect(await second.runExclusive('job:news', secondJob)).toEqual({
      acquired: true,
      result: 'second',
    });
  });

  it('different keys do not block each other', async () => {
    const db = new FakeLockDatabase();
    const first = silence(new TestLockService(db.session().client));
    const second = silence(new TestLockService(db.session().client));

    let release: () => void = () => undefined;
    const running = first.runExclusive(
      'job:a',
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(
      await second.runExclusive('job:b', () => Promise.resolve(1)),
    ).toEqual({
      acquired: true,
      result: 1,
    });

    release();
    await running;
  });

  it('a job that throws still releases the lock, and the error reaches the caller', async () => {
    const db = new FakeLockDatabase();
    const service = silence(new TestLockService(db.session().client));

    await expect(
      service.runExclusive('job:a', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(db.held.size).toBe(0);
  });

  it('cannot reach the lock database: the tick is skipped, the job never runs unguarded', async () => {
    const db = new FakeLockDatabase();
    const service = silence(
      new TestLockService(db.session({ failLock: true }).client),
    );
    const job = jest.fn(() => Promise.resolve(1));

    expect(await service.runExclusive('job:a', job)).toEqual({
      acquired: false,
      reason: 'lock-unavailable',
    });
    expect(job).not.toHaveBeenCalled();
  });

  it('a failed unlock does not turn a finished job into an error', async () => {
    const db = new FakeLockDatabase();
    const service = silence(
      new TestLockService(db.session({ failUnlock: true }).client),
    );

    expect(
      await service.runExclusive('job:a', () => Promise.resolve('ok')),
    ).toEqual({
      acquired: true,
      result: 'ok',
    });
  });

  it('no database URL at all: skipped', async () => {
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL;
    const service = silence(new AdvisoryLockService());

    expect(
      await service.runExclusive('job:a', () => Promise.resolve(1)),
    ).toEqual({
      acquired: false,
      reason: 'lock-unavailable',
    });
  });

  it('closes its connection on shutdown', async () => {
    const { client } = new FakeLockDatabase().session();
    const service = silence(new TestLockService(client));
    await service.runExclusive('job:a', () => Promise.resolve(1));

    await service.onModuleDestroy();

    expect(
      (client as unknown as { $disconnect: jest.Mock }).$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});

describe('runLocked', () => {
  it('without a lock service (unit tests, hand-built services) it just runs the job', async () => {
    expect(
      await runLocked(undefined, 'job:a', () => Promise.resolve(7)),
    ).toEqual({
      acquired: true,
      result: 7,
    });
  });

  it('with a lock service it goes through it', async () => {
    const runExclusive = jest
      .fn()
      .mockResolvedValue({ acquired: false, reason: 'held-elsewhere' });

    const outcome = await runLocked(
      { runExclusive } as unknown as AdvisoryLockService,
      'job:a',
      () => Promise.resolve(1),
    );

    expect(outcome.acquired).toBe(false);
    expect(runExclusive).toHaveBeenCalledWith('job:a', expect.any(Function));
  });
});

describe('connection helpers', () => {
  it('limits the lock client to one connection (lock and unlock share a session)', () => {
    expect(
      withSingleConnection('postgresql://u:p@h/db?sslmode=require'),
    ).toContain('connection_limit=1');
    expect(
      withSingleConnection('postgresql://u:p@h/db?sslmode=require'),
    ).toContain('sslmode=require');
  });

  it('prefers the direct URL over the pooled one', () => {
    expect(
      lockDatabaseUrl({ DIRECT_URL: 'direct', DATABASE_URL: 'pooled' }),
    ).toBe('direct');
    expect(lockDatabaseUrl({ DATABASE_URL: 'pooled' })).toBe('pooled');
    expect(lockDatabaseUrl({})).toBeNull();
  });

  it('every job has its own key', () => {
    const keys = Object.values(JOB_LOCKS);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

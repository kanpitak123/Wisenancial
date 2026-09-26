import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cluster-wide "only one instance runs this job" lock, on Postgres advisory locks.
 *
 * Cron jobs (news sync, guardrails second pass, account purge, price sync) used to guard
 * against overlap with an in-memory flag, which only works inside one process. With two
 * instances both run every tick: double NewsAPI quota, double AI spend, and the guardrails
 * daily budget can be exceeded. `runExclusive` lets one instance win and the others skip
 * that tick.
 *
 * Why a dedicated connection: an advisory lock belongs to a database *session*. Through a
 * transaction pooler (Neon's pooled host / PgBouncer) consecutive statements can run on
 * different sessions, so the unlock would not reach the session that took the lock. This
 * service therefore opens its own client on the direct (non-pooled) URL, limited to ONE
 * connection, so lock and unlock always share a session. DIRECT_URL is already required in
 * production for `prisma migrate`.
 *
 * If the lock database cannot be reached the tick is skipped (and logged), never run
 * unguarded: the next tick tries again.
 */

export type LockOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false; reason: 'held-elsewhere' | 'lock-unavailable' };

/** Adds connection_limit=1 (one session for every lock) to a postgres URL. */
export function withSingleConnection(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('connection_limit', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Direct URL first; the pooled one only as a fallback (dev) since it cannot hold session locks reliably. */
export function lockDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return env.DIRECT_URL?.trim() || env.DATABASE_URL?.trim() || null;
}

@Injectable()
export class AdvisoryLockService implements OnModuleDestroy {
  private readonly logger = new Logger(AdvisoryLockService.name);
  private client: PrismaClient | null = null;

  /** Test seam: lets a spec supply a fake client. */
  protected createClient(url: string): PrismaClient {
    return new PrismaClient({
      datasourceUrl: withSingleConnection(url),
      log: [],
    });
  }

  private getClient(): PrismaClient | null {
    if (this.client) return this.client;

    const url = lockDatabaseUrl();
    if (!url) return null;

    if (!process.env.DIRECT_URL?.trim() && /pooler|pgbouncer/i.test(url)) {
      this.logger.warn(
        'DIRECT_URL is not set: advisory locks on a pooled connection are not reliable',
      );
    }

    this.client = this.createClient(url);
    return this.client;
  }

  /**
   * Runs `job` only if no other instance holds `key`. The lock is released when the job
   * finishes or throws; a job error is rethrown to the caller.
   */
  async runExclusive<T>(
    key: string,
    job: () => Promise<T>,
  ): Promise<LockOutcome<T>> {
    const client = this.getClient();
    if (!client) {
      this.logger.error(`No database URL for advisory lock "${key}"; skipping`);
      return { acquired: false, reason: 'lock-unavailable' };
    }

    let locked: boolean;
    try {
      const rows = await client.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_lock(hashtextextended(${key}, 0)) AS locked`;
      locked = rows[0]?.locked === true;
    } catch (error) {
      this.logger.error(
        `Could not take advisory lock "${key}": ${
          error instanceof Error ? error.message : String(error)
        }; skipping this run`,
      );
      return { acquired: false, reason: 'lock-unavailable' };
    }

    if (!locked) {
      this.logger.log(`"${key}" is running on another instance; skipping`);
      return { acquired: false, reason: 'held-elsewhere' };
    }

    try {
      return { acquired: true, result: await job() };
    } finally {
      try {
        await client.$queryRaw`
          SELECT pg_advisory_unlock(hashtextextended(${key}, 0))`;
      } catch (error) {
        // the session may have dropped, which also releases the lock
        this.logger.warn(
          `Could not release advisory lock "${key}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
    this.client = null;
  }
}

/**
 * Runs `job` under `key` when a lock service is available; without one (unit tests, a service
 * built by hand) it just runs the job, so single-process behaviour is unchanged.
 */
export async function runLocked<T>(
  locks: AdvisoryLockService | undefined,
  key: string,
  job: () => Promise<T>,
): Promise<LockOutcome<T>> {
  if (!locks) return { acquired: true, result: await job() };

  return locks.runExclusive(key, job);
}

/** Stable keys, one per job, shared by every instance. */
export const JOB_LOCKS = {
  forexSync: 'job:news:forex-sync',
  investorSync: 'job:news:investor-sync',
  guardrailsSecondPass: 'job:news:guardrails-second-pass',
  accountPurge: 'job:users:account-purge',
  holdingsPriceSync: 'job:market:finnhub-holdings-sync',
} as const;

import { FinnhubMarketDataService } from '../market-data/finnhub-market-data.service';
import { NewsGuardrailsSecondPassService } from '../news/news-guardrails-second-pass.service';
import { NewsSyncService } from '../news/news-sync.service';
import { AccountDeletionService } from '../users/account-deletion.service';
import { AdvisoryLockService, JOB_LOCKS } from './advisory-lock.service';

/**
 * Every cron job takes a cluster-wide lock, so a second instance skips the tick instead of
 * repeating the work (double NewsAPI quota and AI spend, guardrails budget overrun).
 * The classifier has no cron of its own: it runs inside the news sync, under its lock.
 */

/** A lock that is either free (runs the job) or held by another instance. */
function fakeLocks(held: boolean) {
  const runExclusive = jest.fn(
    async (key: string, job: () => Promise<unknown>) => {
      void key;
      if (held) return { acquired: false, reason: 'held-elsewhere' };
      return { acquired: true, result: await job() };
    },
  );

  return {
    locks: { runExclusive } as unknown as AdvisoryLockService,
    runExclusive,
  };
}

const silence = (service: object) => {
  for (const level of ['log', 'warn', 'error']) {
    jest
      .spyOn(
        (service as { logger: Record<string, () => void> }).logger,
        level as 'log',
      )
      .mockImplementation(() => undefined);
  }
};

describe('news sync (forex calendar, investor news, and the classifier inside them)', () => {
  const make = (held: boolean) => {
    const { locks, runExclusive } = fakeLocks(held);
    const service = new NewsSyncService(
      {} as never,
      {} as never,
      {} as never,
      locks,
    );
    silence(service);
    const forex = jest
      .spyOn(service as never, 'runForexCalendarSync')
      .mockResolvedValue({ created: 1, updated: 0, enriched: 0 } as never);
    const investor = jest
      .spyOn(service as never, 'syncInvestorMarketNews')
      .mockResolvedValue({ fetched: 5, persisted: 5 } as never);

    return { service, runExclusive, forex, investor };
  };

  it('forex sync runs when the lock is free', async () => {
    const { service, runExclusive, forex } = make(false);

    await service.syncForexCalendar('th');

    expect(runExclusive).toHaveBeenCalledWith(
      JOB_LOCKS.forexSync,
      expect.any(Function),
    );
    expect(forex).toHaveBeenCalledTimes(1);
  });

  it('forex sync is skipped when another instance holds the lock', async () => {
    const { service, forex } = make(true);

    expect(await service.syncForexCalendar('th')).toMatchObject({
      skipped: true,
    });
    expect(forex).not.toHaveBeenCalled();
  });

  it('investor sync (cron and POST /news/sync/INVESTOR) is skipped when another instance holds the lock', async () => {
    const { service, investor } = make(true);

    const result = await service.sync('INVESTOR' as never, 'th');

    expect((result as Record<string, unknown>).investor).toMatchObject({
      skipped: true,
    });
    expect(investor).not.toHaveBeenCalled();
  });

  it('investor sync runs under its own key when free', async () => {
    const { service, runExclusive, investor } = make(false);

    await service.sync('INVESTOR' as never, 'th');

    expect(runExclusive).toHaveBeenCalledWith(
      JOB_LOCKS.investorSync,
      expect.any(Function),
    );
    expect(investor).toHaveBeenCalledTimes(1);
  });

  it('the in-process flag is released even when the lock was not acquired (next tick can try again)', async () => {
    const { service, forex } = make(true);
    await service.syncForexCalendar('th');

    const free = fakeLocks(false);
    (service as unknown as { locks: AdvisoryLockService }).locks = free.locks;
    await service.syncForexCalendar('th');

    expect(forex).toHaveBeenCalledTimes(1);
  });
});

describe('guardrails second pass', () => {
  const ORIGINAL = process.env.NEWS_GUARDRAILS_ENABLED;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEWS_GUARDRAILS_ENABLED;
    else process.env.NEWS_GUARDRAILS_ENABLED = ORIGINAL;
  });

  const make = (held: boolean) => {
    const { locks, runExclusive } = fakeLocks(held);
    const service = new NewsGuardrailsSecondPassService(
      {} as never,
      {} as never,
      locks,
    );
    silence(service);
    const runOnce = jest.spyOn(service, 'runOnce').mockResolvedValue({
      selected: 0,
      analysed: 0,
      providerFailure: false,
    });

    return { service, runExclusive, runOnce };
  };

  it('a tick takes the lock, then runs', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const { service, runExclusive, runOnce } = make(false);

    await service.scheduledRun();

    expect(runExclusive).toHaveBeenCalledWith(
      JOB_LOCKS.guardrailsSecondPass,
      expect.any(Function),
    );
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('a tick is skipped while another instance runs it (budget cannot be raced)', async () => {
    process.env.NEWS_GUARDRAILS_ENABLED = 'true';
    const { service, runOnce } = make(true);

    await service.scheduledRun();

    expect(runOnce).not.toHaveBeenCalled();
  });

  it('while the feature is off no lock is taken at all', async () => {
    delete process.env.NEWS_GUARDRAILS_ENABLED;
    const { service, runExclusive } = make(false);

    await service.scheduledRun();

    expect(runExclusive).not.toHaveBeenCalled();
  });
});

describe('account purge', () => {
  const make = (held: boolean) => {
    const { locks, runExclusive } = fakeLocks(held);
    const service = new AccountDeletionService({} as never, locks);
    silence(service);
    const purge = jest
      .spyOn(service, 'purgeExpiredAccounts')
      .mockResolvedValue({
        purged: 1,
        skippedActiveSubscription: 0,
        failed: 0,
      });

    return { service, runExclusive, purge };
  };

  it('the 03:00 job runs under the lock', async () => {
    const { service, runExclusive, purge } = make(false);

    await service.scheduledPurge();

    expect(runExclusive).toHaveBeenCalledWith(
      JOB_LOCKS.accountPurge,
      expect.any(Function),
    );
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('is skipped on the instance that does not hold the lock', async () => {
    const { service, purge } = make(true);

    await service.scheduledPurge();

    expect(purge).not.toHaveBeenCalled();
  });

  it('an error in the purge is logged, not thrown out of the cron', async () => {
    const { service, purge } = make(false);
    purge.mockRejectedValue(new Error('db down'));

    await expect(service.scheduledPurge()).resolves.toBeUndefined();
  });
});

describe('holdings price sync', () => {
  const ORIGINAL = process.env.FINNHUB_API_KEY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = ORIGINAL;
  });

  const make = (held: boolean) => {
    const { locks, runExclusive } = fakeLocks(held);
    const service = new FinnhubMarketDataService({} as never, locks);
    const sync = jest
      .spyOn(service, 'syncAllOpenHoldings')
      .mockResolvedValue(undefined);

    return { service, runExclusive, sync };
  };

  it('runs under the lock when a key is configured', async () => {
    process.env.FINNHUB_API_KEY = 'k';
    const { service, runExclusive, sync } = make(false);

    await service.scheduledHoldingsSync();

    expect(runExclusive).toHaveBeenCalledWith(
      JOB_LOCKS.holdingsPriceSync,
      expect.any(Function),
    );
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('skipped when another instance holds it; not even attempted without a key', async () => {
    process.env.FINNHUB_API_KEY = 'k';
    const held = make(true);
    await held.service.scheduledHoldingsSync();
    expect(held.sync).not.toHaveBeenCalled();

    delete process.env.FINNHUB_API_KEY;
    const noKey = make(false);
    await noKey.service.scheduledHoldingsSync();
    expect(noKey.runExclusive).not.toHaveBeenCalled();
  });
});

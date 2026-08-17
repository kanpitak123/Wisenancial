import { NewsSyncService } from './news-sync.service';
import { NewsScope } from './dto/news-query.dto';

/**
 * ข่าวฝั่ง INVESTOR เพิ่งมี cron (EVERY_HOUR) — รอบหนึ่งใช้เวลา ~50 วินาที
 * เพราะ enrich ทีละบทความ ถ้ารอบยาวเกินจนชนรอบถัดไป หรือมีคนกด
 * POST /news/sync/INVESTOR ระหว่างที่ cron ทำงานอยู่ จะยิง NewsAPI และ AI ซ้ำสองเท่า
 */

type SyncResult = { fetched: number; persisted: number; skipped?: boolean };

function makeService(investorSync: jest.Mock) {
  const service = new NewsSyncService(
    {} as never,
    {} as never,
    {} as never,
  );

  // syncInvestorMarketNews เป็น private และยิง HTTP จริง — แทนที่ด้วยตัวคุมเวลาได้
  Object.defineProperty(service, 'syncInvestorMarketNews', {
    value: investorSync,
    writable: true,
  });

  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  return service;
}

describe('NewsSyncService — investor sync overlap guard', () => {
  it('รอบก่อนยังไม่จบ -> รอบใหม่ถูกข้าม ไม่ยิงซ้ำ', async () => {
    let release: (value: SyncResult) => void = () => {};
    const investorSync = jest.fn(
      () => new Promise<SyncResult>((resolve) => (release = resolve)),
    );

    const service = makeService(investorSync);

    const first = service.scheduledInvestorSync();
    await Promise.resolve();

    // รอบที่สองเข้ามาระหว่างรอบแรกยังค้าง
    const second = (await service.sync(NewsScope.INVESTOR, 'th')) as unknown as {
      investor: SyncResult & { reason?: string };
    };

    expect(second.investor.skipped).toBe(true);
    expect(second.investor.reason).toBe('sync already running');
    expect(investorSync).toHaveBeenCalledTimes(1);

    release({ fetched: 20, persisted: 20 });
    await first;
  });

  it('รอบก่อนจบแล้ว -> รอบถัดไปเริ่มได้ตามปกติ', async () => {
    const investorSync = jest.fn().mockResolvedValue({ fetched: 20, persisted: 20 });
    const service = makeService(investorSync);

    await service.scheduledInvestorSync();
    await service.scheduledInvestorSync();

    expect(investorSync).toHaveBeenCalledTimes(2);
  });

  it('รอบก่อนล้ม -> ธงต้องถูกปลด ไม่ค้างจนบล็อกตลอดไป', async () => {
    const investorSync = jest
      .fn()
      .mockRejectedValueOnce(new Error('newsapi down'))
      .mockResolvedValue({ fetched: 5, persisted: 5 });

    const service = makeService(investorSync);

    // cron จับ error เองไม่ให้หลุดออกไป
    await expect(service.scheduledInvestorSync()).resolves.toBeUndefined();

    const next = (await service.sync(NewsScope.INVESTOR, 'th')) as unknown as {
      investor: SyncResult;
    };

    expect(next.investor.skipped).toBeUndefined();
    expect(next.investor.persisted).toBe(5);
    expect(investorSync).toHaveBeenCalledTimes(2);
  });

  it('scope TRADER ไม่แตะ investor sync', async () => {
    const investorSync = jest.fn().mockResolvedValue({ fetched: 0, persisted: 0 });
    const service = makeService(investorSync);

    Object.defineProperty(service, 'syncForexCalendar', {
      value: jest.fn().mockResolvedValue({ created: 1, updated: 0 }),
      writable: true,
    });

    await service.sync(NewsScope.TRADER, 'th');

    expect(investorSync).not.toHaveBeenCalled();
  });
});

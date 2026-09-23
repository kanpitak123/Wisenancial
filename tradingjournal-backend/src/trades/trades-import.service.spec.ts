import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TraderAnalyticsService } from '../analytics/trader-analytics.service';
import { TradesImportService } from './trades-import.service';
import { TradesService } from './trades.service';

const txMock = {
  trade_imports: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

const prismaMock = {
  $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
};

const tradesServiceMock = {
  assertTraderPortfolio: jest.fn(),
  upsertImportedClosedTrade: jest.fn(),
};

// 2026-09-24: closes the QA-round latency fix's cache-invalidation gap — the CSV-import
// path used to rely on the Analytics TTL cache expiring naturally (up to 15s of stale
// numbers after an import) instead of busting it immediately like every other trade
// write path does.
describe('TradesImportService — Analytics cache invalidation', () => {
  let service: TradesImportService;
  let invalidateSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    invalidateSpy = jest
      .spyOn(TraderAnalyticsService, 'invalidate')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradesImportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TradesService, useValue: tradesServiceMock },
      ],
    }).compile();

    service = module.get<TradesImportService>(TradesImportService);
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
  });

  const csv = [
    'ticket,symbol,type,lots,opening_price,closing_price,profit,opening_time_utc,closing_time_utc',
    '1001,EURUSD,BUY,1.0,1.1000,1.1050,50,2026-09-20T10:00:00Z,2026-09-20T12:00:00Z',
  ].join('\n');

  it('invalidates the Analytics cache once after a successful import commits', async () => {
    txMock.trade_imports.create.mockResolvedValue({ id: 77 });
    txMock.trade_imports.update.mockResolvedValue({ id: 77 });
    tradesServiceMock.assertTraderPortfolio.mockResolvedValue(undefined);
    tradesServiceMock.upsertImportedClosedTrade.mockResolvedValue({
      id: 1,
      pair: 'EURUSD',
    });

    const result = await service.importBrokerData(
      15,
      14,
      Buffer.from(csv, 'utf-8'),
      'MT5',
      'ACC-1',
      'history.csv',
    );

    expect(result.imported_count).toBe(1);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith(15, 14);
  });

  it('does not invalidate the cache if the import is rejected before any write (empty file)', async () => {
    tradesServiceMock.assertTraderPortfolio.mockResolvedValue(undefined);

    await expect(
      service.importBrokerData(
        15,
        14,
        Buffer.from('ticket,symbol\n', 'utf-8'),
        'MT5',
        'ACC-1',
        'empty.csv',
      ),
    ).rejects.toThrow('ไม่พบข้อมูลประวัติการเทรดในไฟล์นี้');

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

/**
 * แคชราคาล่าสุดของ MarketService
 *
 * หน้ากราฟ poll ทุก 15 วิ ถ้าปล่อยให้ทุก request วิ่งไป Yahoo ตรง ๆ ผู้ใช้ไม่กี่สิบคน
 * ที่เปิดหุ้นตัวเดียวกันก็พอทำให้โดน rate limit (Yahoo Finance ฟรีไม่ประกาศ limit ไว้)
 * เทสล็อกสามเรื่องที่ทำให้แคชกลายเป็นของไร้ผลโดยไม่มีใครรู้:
 *   1. อยู่ใน TTL ต้องไม่ยิง Yahoo ซ้ำ และทุก client ได้ก้อนเดียวกัน
 *   2. คำขอที่ซ้อนกันตอนแคชหมดอายุ ต้องยุบเหลือ Yahoo call เดียว
 *   3. Yahoo ล่ม ต้องคืนค่าล่าสุดที่มี ไม่ใช่ทำให้กราฟกระพริบเป็นศูนย์
 */
import { BadRequestException } from '@nestjs/common';
import { MarketService } from './market.service';

type YahooQuoteStub = jest.Mock<Promise<unknown>, [unknown]>;

function quotePayload(symbol: string, price: number) {
  return {
    symbol,
    regularMarketPrice: price,
    regularMarketChange: 1.5,
    regularMarketChangePercent: 0.83,
    regularMarketOpen: price - 2,
    regularMarketDayHigh: price + 1,
    regularMarketDayLow: price - 3,
    regularMarketPreviousClose: price - 1.5,
    regularMarketVolume: 1_000_000,
    marketState: 'REGULAR',
  };
}

/** ยัด stub เข้าไปแทน yahoo-finance2 instance ที่ service สร้างเอง */
function stubYahoo(service: MarketService, impl: YahooQuoteStub) {
  (service as unknown as { yahooFinance: { quote: YahooQuoteStub } }).yahooFinance = {
    quote: impl,
  };
}

describe('MarketService — แคชราคาล่าสุด', () => {
  let service: MarketService;

  beforeEach(() => {
    service = new MarketService();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('อยู่ใน TTL แล้วต้องไม่ยิง Yahoo ซ้ำ', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValue(quotePayload('AAPL', 180));

    stubYahoo(service, quote);

    const first = await service.getRealtimeQuote('AAPL');
    const second = await service.getRealtimeQuote('aapl');

    expect(quote).toHaveBeenCalledTimes(1);
    expect(first?.price).toBe(180);
    expect(second).toEqual(first);
  });

  it('หมดอายุแล้วถึงจะยิงใหม่', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValueOnce(quotePayload('AAPL', 180))
      .mockResolvedValueOnce(quotePayload('AAPL', 181));

    stubYahoo(service, quote);

    const first = await service.getRealtimeQuote('AAPL');

    // ย้อนเวลาให้ entry เก่าเกิน TTL แทนการ sleep จริง
    const cache = service['realtimeCache'];
    const entry = cache.get('AAPL')!;
    entry.timestamp -= service['realtimeTtlMs'] + 1;

    const second = await service.getRealtimeQuote('AAPL');

    expect(quote).toHaveBeenCalledTimes(2);
    expect(first?.price).toBe(180);
    expect(second?.price).toBe(181);
  });

  it('คำขอที่ซ้อนกันตอนแคชว่าง ยุบเหลือ Yahoo call เดียว', async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });

    const quote: YahooQuoteStub = jest.fn().mockReturnValue(pending);

    stubYahoo(service, quote);

    const all = Promise.all([
      service.getRealtimeQuote('AAPL'),
      service.getRealtimeQuote('AAPL'),
      service.getRealtimeQuote('AAPL'),
    ]);

    release(quotePayload('AAPL', 180));

    const [a, b, c] = await all;

    expect(quote).toHaveBeenCalledTimes(1);
    expect(a?.price).toBe(180);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('Yahoo พังหลังเคยได้ค่ามาแล้ว -> คืนค่าล่าสุดแทนการคืน null', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValueOnce(quotePayload('AAPL', 180))
      .mockRejectedValueOnce(new Error('429 Too Many Requests'));

    stubYahoo(service, quote);

    const fresh = await service.getRealtimeQuote('AAPL');

    service['realtimeCache'].get('AAPL')!.timestamp -=
      service['realtimeTtlMs'] + 1;

    const fallback = await service.getRealtimeQuote('AAPL');

    expect(fallback?.price).toBe(180);
    // asOf ต้องยังเป็นเวลาที่ดึงได้จริง ไม่ถูกปลอมให้ดูใหม่
    expect(fallback?.asOf).toBe(fresh?.asOf);
  });

  it('Yahoo พังตั้งแต่ครั้งแรก (ไม่มีค่าเก่า) -> null และตกจากผลลัพธ์ชุด', async () => {
    stubYahoo(service, jest.fn().mockRejectedValue(new Error('network down')));

    await expect(service.getRealtimeQuote('AAPL')).resolves.toBeNull();
    await expect(service.getRealtimeQuotes(['AAPL'])).resolves.toEqual([]);
  });

  it('ราคาที่ Yahoo ตอบไม่เป็นตัวเลขบวก ถือว่าใช้ไม่ได้', async () => {
    stubYahoo(
      service,
      jest.fn().mockResolvedValue({ symbol: 'AAPL', regularMarketPrice: 0 }),
    );

    await expect(service.getRealtimeQuote('AAPL')).resolves.toBeNull();
  });

  it('ขอหลายสัญลักษณ์พร้อมกันได้ และตัดตัวซ้ำทิ้ง', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockImplementation((symbol: unknown) =>
        Promise.resolve(quotePayload(String(symbol), 100)),
      );

    stubYahoo(service, quote);

    const quotes = await service.getRealtimeQuotes(['AAPL', 'MSFT', 'aapl']);

    expect(quotes.map((item) => item.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(quote).toHaveBeenCalledTimes(2);
  });

  it('ขอเกินเพดานต่อครั้ง -> 400 ไม่ใช่ยิง Yahoo รัว', async () => {
    const quote: YahooQuoteStub = jest.fn();

    stubYahoo(service, quote);

    const symbols = Array.from({ length: 21 }, (_, index) => `SYM${index}`);

    await expect(service.getRealtimeQuotes(symbols)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(quote).not.toHaveBeenCalled();
  });

  it('ราคาที่ดึงสด เขียนทับแคช 5 นาทีของ getQuotes ให้ใช้ต่อได้', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValue(quotePayload('AAPL', 180));

    stubYahoo(service, quote);

    await service.getRealtimeQuote('AAPL');

    await expect(service.getQuotes(['AAPL'])).resolves.toEqual({ AAPL: 180 });
    // getQuotes ต้องอ่านจากแคช ไม่ยิง Yahoo เพิ่ม
    expect(quote).toHaveBeenCalledTimes(1);
  });
});

/**
 * MarketDataService.getRiskFundamentals — debtToEquity ของการ์ด AI Risk Analysis
 *
 * คอลัมน์ D/E ว่างสำหรับ AAPL/MSFT/NVDA เพราะ Yahoo ให้ D/E เฉพาะทาง quoteSummary()
 * (ทีละ symbol) และหน้าบ้านส่ง null ไว้ตลอด — ตอนนี้ backend ดึงเองพร้อมแปลงหน่วย
 * (Yahoo คืนเป็นเปอร์เซ็นต์: AAPL 78.445 = D/E 0.78)
 *
 * ใช้ symbol ที่ไม่ซ้ำกันในแต่ละเทสเพราะแคชอยู่ระดับ module
 */
const quote = jest.fn();
const quoteSummary = jest.fn();

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    quote: (...args: unknown[]) => quote(...args),
    quoteSummary: (...args: unknown[]) => quoteSummary(...args),
  })),
}));

import { Logger } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

const summaryOf = (percent: number | undefined) => ({
  financialData: percent === undefined ? {} : { debtToEquity: percent },
});

describe('MarketDataService.getRiskFundamentals — debtToEquity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('converts Yahoo percent to a plain ratio and merges it with P/E and beta', async () => {
    quote.mockResolvedValue([{ symbol: 'DE1', trailingPE: 36.1, beta: 1.09 }]);
    quoteSummary.mockResolvedValue(summaryOf(78.445));

    const result = await new MarketDataService().getRiskFundamentals(['DE1']);

    expect(result.get('DE1')).toEqual({
      peRatio: 36.1,
      beta: 1.09,
      // 78.445% -> 0.784, so it is comparable to the prompt's '>1.0' rule
      debtToEquity: 0.784,
    });
    expect(quoteSummary).toHaveBeenCalledWith('DE1', {
      modules: ['financialData'],
    });
  });

  it('returns null (not a made-up number) when Yahoo has no D/E for a symbol', async () => {
    quote.mockResolvedValue([{ symbol: 'DE2', trailingPE: 10, beta: 0.5 }]);
    quoteSummary.mockResolvedValue(summaryOf(undefined));

    const result = await new MarketDataService().getRiskFundamentals(['DE2']);

    expect(result.get('DE2')?.debtToEquity).toBeNull();
  });

  it('a failing D/E lookup does not take P/E and beta down with it', async () => {
    quote.mockResolvedValue([{ symbol: 'DE3', trailingPE: 20, beta: 1 }]);
    quoteSummary.mockRejectedValue(new Error('yahoo 429'));

    const result = await new MarketDataService().getRiskFundamentals(['DE3']);

    expect(result.get('DE3')).toEqual({
      peRatio: 20,
      beta: 1,
      debtToEquity: null,
    });
  });

  it('caches D/E for hours: a second call does not hit quoteSummary again', async () => {
    quote.mockResolvedValue([{ symbol: 'DE4', trailingPE: 20, beta: 1 }]);
    quoteSummary.mockResolvedValue(summaryOf(16.971));
    const service = new MarketDataService();

    await service.getRiskFundamentals(['DE4']);
    const second = await service.getRiskFundamentals(['DE4']);

    expect(quoteSummary).toHaveBeenCalledTimes(1);
    expect(second.get('DE4')?.debtToEquity).toBe(0.17);
  });

  it('does not cache a failed lookup, so the next request retries', async () => {
    quote.mockResolvedValue([{ symbol: 'DE5', trailingPE: 20, beta: 1 }]);
    quoteSummary.mockRejectedValueOnce(new Error('boom'));
    quoteSummary.mockResolvedValue(summaryOf(29.118));
    const service = new MarketDataService();

    await service.getRiskFundamentals(['DE5']);
    const second = await service.getRiskFundamentals(['DE5']);

    expect(second.get('DE5')?.debtToEquity).toBe(0.291);
  });

  it('never runs more than 5 quoteSummary calls at once', async () => {
    const symbols = Array.from({ length: 12 }, (_, i) => `CC${i}`);
    quote.mockResolvedValue(
      symbols.map((symbol) => ({ symbol, trailingPE: 1, beta: 1 })),
    );

    let inFlight = 0;
    let peak = 0;
    quoteSummary.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return summaryOf(50);
    });

    await new MarketDataService().getRiskFundamentals(symbols);

    expect(quoteSummary).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(5);
  });
});

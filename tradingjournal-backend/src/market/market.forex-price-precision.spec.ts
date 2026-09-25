/**
 * MarketService.fetchRealtimeQuote — price precision for Trader (forex/crypto/indices)
 * symbols. The pre-existing round() hardcodes .toFixed(2), correct for stock USD prices
 * but destructive for forex: a real tick like 1.138567 would round to 1.14, making
 * consecutive polls look identical even when the underlying price genuinely moved.
 * roundTraderPrice() applies pip-appropriate precision instead, scoped ONLY to
 * confirmed Trader-symbol prices — round() itself is untouched, so stock precision is
 * unaffected (see forex-chart-parity-investigation.md Phase B).
 */
import { MarketService } from './market.service';

type YahooQuoteStub = jest.Mock<Promise<unknown>, [unknown]>;

function quotePayload(price: number) {
  return {
    regularMarketPrice: price,
    regularMarketChange: 0.001,
    regularMarketChangePercent: 0.09,
    marketState: 'REGULAR',
  };
}

function stubYahoo(service: MarketService, impl: YahooQuoteStub) {
  (service as unknown as { yahooFinance: { quote: YahooQuoteStub } }).yahooFinance = {
    quote: impl,
  };
}

describe('MarketService — Trader-symbol realtime price precision', () => {
  let service: MarketService;

  beforeEach(() => {
    service = new MarketService();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('EUR/USD ราคาสดปัดทศนิยม 5 ตำแหน่ง ไม่ใช่ 2 ตำแหน่งแบบหุ้น (ไม่งั้นราคาดูเหมือนไม่ขยับ)', async () => {
    const quote: YahooQuoteStub = jest.fn().mockResolvedValue(quotePayload(1.138567));

    stubYahoo(service, quote);

    const result = await service.getRealtimeQuote('EUR/USD');

    expect(result?.price).toBe(1.13857);
  });

  it('หุ้นปกติ (AAPL) ยังปัด 2 ตำแหน่งเหมือนเดิม — roundTraderPrice ไม่แตะ round() เดิม', async () => {
    const quote: YahooQuoteStub = jest.fn().mockResolvedValue(quotePayload(230.126));

    stubYahoo(service, quote);

    const result = await service.getRealtimeQuote('AAPL');

    expect(result?.price).toBe(230.13);
  });
});

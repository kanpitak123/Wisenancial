/**
 * MarketService.getRealtimeQuote — Trader-symbol (forex/crypto/indices) mapping on the
 * realtime path, mirroring what AssetsService.getChartData already does for chart
 * history (see forex-chart-parity-investigation.md §5, "extract toYahooTraderSymbol").
 *
 * The response must still echo the caller's ORIGINAL symbol (not the Yahoo ticker),
 * so existing callers matching by requested symbol are unaffected.
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
  (
    service as unknown as { yahooFinance: { quote: YahooQuoteStub } }
  ).yahooFinance = {
    quote: impl,
  };
}

describe('MarketService — Trader symbol mapping on realtime quotes', () => {
  let service: MarketService;

  beforeEach(() => {
    service = new MarketService();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('EUR/USD -> ยิง Yahoo ด้วย ticker จริง EURUSD=X แต่ response.symbol ยังเป็น EUR/USD เดิม', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValue(quotePayload(1.1385));

    stubYahoo(service, quote);

    const result = await service.getRealtimeQuote('EUR/USD');

    expect(quote).toHaveBeenCalledWith('EURUSD=X');
    expect(result?.symbol).toBe('EUR/USD');
  });

  it('XAU/USD -> ยิง Yahoo ด้วย GC=F', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValue(quotePayload(2650.5));

    stubYahoo(service, quote);

    await service.getRealtimeQuote('XAU/USD');

    expect(quote).toHaveBeenCalledWith('GC=F');
  });

  it('ticker หุ้นปกติ (AAPL) -> ไม่ถูกแปลง ยิง Yahoo ด้วย symbol เดิม (no-op สำหรับ stock)', async () => {
    const quote: YahooQuoteStub = jest
      .fn()
      .mockResolvedValue(quotePayload(230.12));

    stubYahoo(service, quote);

    await service.getRealtimeQuote('AAPL');

    expect(quote).toHaveBeenCalledWith('AAPL');
  });
});

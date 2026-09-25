/**
 * Maps the app's internal Trader-portfolio symbols (forex/crypto/indices) to real
 * Yahoo Finance tickers.
 *
 * Extracted from AssetsService (was a private method there, used only for chart
 * history) so MarketService's realtime-quote path can map the same symbols the same
 * way — see forex-chart-parity-investigation.md, "toYahooTraderSymbol() needs
 * extraction to be reusable by MarketService for a forex realtime endpoint."
 */
export function toYahooTraderSymbol(symbol: string): string {
  const symbolMap: Record<string, string> = {
    'BTC/USD': 'BTC-USD',
    'ETH/USD': 'ETH-USD',
    'BNB/USD': 'BNB-USD',
    'SOL/USD': 'SOL-USD',
    'XRP/USD': 'XRP-USD',
    'DOGE/USD': 'DOGE-USD',
    'XAU/USD': 'GC=F',
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X',
    'USD/JPY': 'JPY=X',
    'USD/CHF': 'CHF=X',
    US30: '^DJI',
    NAS100: '^IXIC',
    SPX500: '^GSPC',
  };
  return symbolMap[symbol] ?? symbol;
}

/** Every symbol toYahooTraderSymbol() maps — used to detect a Trader-style input. */
export const TRADER_SYMBOL_SET = new Set([
  'BTC/USD',
  'ETH/USD',
  'BNB/USD',
  'SOL/USD',
  'XRP/USD',
  'DOGE/USD',
  'XAU/USD',
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'USD/CHF',
  'US30',
  'NAS100',
  'SPX500',
]);

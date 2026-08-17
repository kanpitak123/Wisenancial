import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

interface CacheEntry {
  price: number;
  timestamp: number;
}

/**
 * ราคาล่าสุดพร้อม OHLC ของวัน — พอสำหรับให้กราฟอัปเดตแท่งล่าสุดโดยไม่ต้องโหลดกราฟใหม่ทั้งชุด
 */
export interface RealtimeQuote {
  symbol: string;
  price: number;
  changePercent: number | null;
  change: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  volume: number | null;
  /** 'REGULAR' | 'PRE' | 'POST' | 'CLOSED' ... ตามที่ Yahoo ส่งมา */
  marketState: string | null;
  /** เวลาที่ค่านี้ถูกดึงจริงจาก Yahoo (ไม่ใช่เวลาที่ตอบ request) */
  asOf: string;
}

interface RealtimeCacheEntry {
  quote: RealtimeQuote;
  timestamp: number;
}

export interface HistoricalPricePoint {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export type HistoricalInterval = '1d' | '1wk' | '1mo';

/** กันคำขอที่ลากสัญลักษณ์มาเป็นร้อยตัวจนกลายเป็นช่องทางถล่ม Yahoo ผ่านเซิร์ฟเวอร์เรา */
const MAX_REALTIME_SYMBOLS = 20;

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly yahooFinance = new YahooFinance();

  /**
   * แคชราคาล่าสุดสำหรับหน้าที่เปิดกราฟค้างไว้แล้ว poll ถี่ ๆ
   *
   * TTL สั้นกว่ารอบ poll ของ client (client ยิงทุก 15 วิ / TTL 12 วิ) — แคชเป็นของกลาง
   * ระดับโปรเซส ทุก client ที่ดูหุ้นตัวเดียวกันใช้ผลก้อนเดียวกัน ต่อให้มีผู้ใช้ 100 คน
   * เปิด AAPL พร้อมกัน Yahoo ก็โดนยิงไม่เกิน ~5 ครั้ง/นาทีต่อ 1 สัญลักษณ์
   * (Yahoo Finance ฟรีมี rate limit ที่ไม่ประกาศ ถ้าปล่อยให้แต่ละ client ยิงเองจะโดนบล็อกเร็ว)
   */
  private readonly realtimeCache = new Map<string, RealtimeCacheEntry>();
  private readonly realtimeTtlMs = 12 * 1000;

  /**
   * ดีดักคำขอที่ซ้อนกัน — ถ้าแคชหมดอายุพร้อมกันแล้วมี 50 request เข้ามาในวินาทีเดียว
   * ต้องยิง Yahoo แค่ครั้งเดียวแล้วให้ทุกคนรอ promise ก้อนเดียวกัน ไม่ใช่ยิง 50 ครั้ง
   */
  private readonly realtimeInFlight = new Map<
    string,
    Promise<RealtimeQuote | null>
  >();

  async getQuotes(symbols: string[]): Promise<Record<string, number | null>> {
    const normalizedSymbols = this.normalizeSymbols(symbols);
    const results: Record<string, number | null> = {};

    if (normalizedSymbols.length === 0) {
      return results;
    }

    const now = Date.now();
    const symbolsToFetch: string[] = [];

    for (const symbol of normalizedSymbols) {
      const cached = this.cache.get(symbol);

      if (cached && now - cached.timestamp < this.cacheTtlMs) {
        results[symbol] = cached.price;
      } else {
        symbolsToFetch.push(symbol);
      }
    }

    if (symbolsToFetch.length === 0) {
      return results;
    }

    try {
      this.logger.log(`Fetching Yahoo quotes: ${symbolsToFetch.join(', ')}`);

      const quotes = await this.yahooFinance.quote(symbolsToFetch);
      const quoteRows = Array.isArray(quotes) ? quotes : [quotes];

      for (const quote of quoteRows as any[]) {
        const symbol = String(quote?.symbol ?? '')
          .trim()
          .toUpperCase();

        if (!symbol) continue;

        const rawPrice = quote?.regularMarketPrice;
        const price =
          typeof rawPrice === 'number' &&
          Number.isFinite(rawPrice) &&
          rawPrice > 0
            ? rawPrice
            : null;

        results[symbol] = price;

        if (price !== null) {
          this.cache.set(symbol, {
            price,
            timestamp: now,
          });
        }
      }

      for (const symbol of symbolsToFetch) {
        if (!(symbol in results)) {
          results[symbol] = null;
        }
      }

      return results;
    } catch (error) {
      this.logger.error(
        'Unable to fetch Yahoo quotes',
        error instanceof Error ? error.stack : String(error),
      );

      for (const symbol of symbolsToFetch) {
        results[symbol] = null;
      }

      return results;
    }
  }

  async getQuote(symbolInput: string): Promise<number | null> {
    const symbol = this.normalizeSymbol(symbolInput);
    const result = await this.getQuotes([symbol]);
    return result[symbol] ?? null;
  }

  /**
   * ราคาล่าสุดของหลายสัญลักษณ์ สำหรับหน้าที่เปิดกราฟค้างแล้ว poll เป็นช่วง ๆ
   *
   * สัญลักษณ์ที่ Yahoo ตอบไม่ได้จะหายไปจากผลลัพธ์เฉย ๆ (ฝั่งหน้าเว็บคงราคาเดิมไว้
   * ดีกว่าโชว์ 0 หรือทำให้กราฟกระพริบ)
   */
  async getRealtimeQuotes(symbolInputs: string[]): Promise<RealtimeQuote[]> {
    const symbols = this.normalizeSymbols(symbolInputs);

    if (symbols.length === 0) {
      return [];
    }

    if (symbols.length > MAX_REALTIME_SYMBOLS) {
      throw new BadRequestException(
        `ขอราคาได้ไม่เกิน ${MAX_REALTIME_SYMBOLS} สัญลักษณ์ต่อครั้ง`,
      );
    }

    const quotes = await Promise.all(
      symbols.map((symbol) => this.getRealtimeQuote(symbol)),
    );

    return quotes.filter((quote): quote is RealtimeQuote => quote !== null);
  }

  /** ราคาล่าสุดของสัญลักษณ์เดียว — ผ่านแคช TTL สั้นและตัวดีดักคำขอซ้อน */
  async getRealtimeQuote(symbolInput: string): Promise<RealtimeQuote | null> {
    const symbol = this.normalizeSymbol(symbolInput);
    const cached = this.realtimeCache.get(symbol);

    if (cached && Date.now() - cached.timestamp < this.realtimeTtlMs) {
      return cached.quote;
    }

    const inFlight = this.realtimeInFlight.get(symbol);

    if (inFlight) {
      return inFlight;
    }

    const request = this.fetchRealtimeQuote(symbol).finally(() => {
      this.realtimeInFlight.delete(symbol);
    });

    this.realtimeInFlight.set(symbol, request);

    return request;
  }

  private async fetchRealtimeQuote(
    symbol: string,
  ): Promise<RealtimeQuote | null> {
    try {
      const raw = await this.yahooFinance.quote(symbol);
      const quote = (Array.isArray(raw) ? raw[0] : raw) as any;
      const price = this.positiveNumber(quote?.regularMarketPrice);

      if (price === null) {
        return this.realtimeCache.get(symbol)?.quote ?? null;
      }

      const now = Date.now();
      const mapped: RealtimeQuote = {
        symbol,
        price: this.round(price),
        change: this.roundOptional(
          this.optionalNumber(quote?.regularMarketChange),
        ),
        changePercent: this.roundOptional(
          this.optionalNumber(quote?.regularMarketChangePercent),
        ),
        open: this.roundOptional(this.optionalNumber(quote?.regularMarketOpen)),
        dayHigh: this.roundOptional(
          this.optionalNumber(quote?.regularMarketDayHigh),
        ),
        dayLow: this.roundOptional(
          this.optionalNumber(quote?.regularMarketDayLow),
        ),
        previousClose: this.roundOptional(
          this.optionalNumber(quote?.regularMarketPreviousClose),
        ),
        volume: this.optionalNumber(quote?.regularMarketVolume),
        marketState:
          typeof quote?.marketState === 'string' ? quote.marketState : null,
        asOf: new Date(now).toISOString(),
      };

      this.realtimeCache.set(symbol, { quote: mapped, timestamp: now });
      // ข้อมูลชุดนี้สดกว่าแคช 5 นาทีของ getQuotes เสมอ เขียนให้ใช้ต่อได้เลย
      this.cache.set(symbol, { price, timestamp: now });

      return mapped;
    } catch (error) {
      this.logger.warn(
        `Unable to fetch realtime quote for ${symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      const stale = this.realtimeCache.get(symbol);

      if (!stale) {
        return null;
      }

      // Yahoo ล่ม/ throttle อยู่ — ต่ออายุค่าเดิมอีก 1 ช่วง TTL เพื่อไม่ให้ทุกรอบ poll
      // วิ่งไปกระแทกซ้ำ ส่วน asOf ยังเป็นเวลาที่ดึงได้จริงครั้งล่าสุด ไม่ถูกปลอมให้ใหม่
      stale.timestamp = Date.now();

      return stale.quote;
    }
  }

  async getHistoricalPrices(
    symbolInput: string,
    from: Date,
    to: Date,
    interval: HistoricalInterval = '1d',
  ): Promise<HistoricalPricePoint[]> {
    const symbol = this.normalizeSymbol(symbolInput);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Historical date range is invalid');
    }

    if (from >= to) {
      throw new BadRequestException('`from` must be earlier than `to`');
    }

    try {
      const chart = await this.yahooFinance.chart(symbol, {
        period1: from,
        period2: to,
        interval,
      });

      return (chart?.quotes ?? [])
        .filter(
          (quote: any) =>
            quote?.date &&
            typeof quote.close === 'number' &&
            Number.isFinite(quote.close) &&
            quote.close > 0,
        )
        .map((quote: any) => ({
          date: new Date(quote.date),
          open: this.optionalNumber(quote.open),
          high: this.optionalNumber(quote.high),
          low: this.optionalNumber(quote.low),
          close: Number(quote.close),
          volume: this.optionalNumber(quote.volume),
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      this.logger.error(
        `Unable to fetch historical prices for ${symbol}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        `Historical prices are unavailable for ${symbol}`,
      );
    }
  }

  async getTechnicalAnalysis(symbolInput: string) {
    const symbol = this.normalizeSymbol(symbolInput);

    try {
      const period2 = new Date();
      const period1 = new Date();
      period1.setDate(period2.getDate() - 90);

      const chart = await this.yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: '1d',
      });

      const closes = (chart?.quotes ?? [])
        .map((quote: any) => quote?.close)
        .filter(
          (close: unknown): close is number =>
            typeof close === 'number' && Number.isFinite(close) && close > 0,
        );

      if (closes.length < 15) {
        throw new ServiceUnavailableException(
          `Insufficient historical data for ${symbol}`,
        );
      }

      const currentPrice = closes[closes.length - 1];
      const previousClose = closes[closes.length - 2];
      const priceChange = currentPrice - previousClose;

      const rsi = this.calculateWilderRsi(closes, 14);

      const recentCloses = closes.slice(-20);
      const support1 = Math.min(...recentCloses);
      const resistance1 = Math.max(...recentCloses);
      const support2 = Math.min(...closes);
      const resistance2 = Math.max(...closes);

      let trend: 'bullish' | 'bearish' | 'neutral';

      if (rsi > 60 && priceChange > 0) {
        trend = 'bullish';
      } else if (rsi < 40 && priceChange < 0) {
        trend = 'bearish';
      } else {
        trend = 'neutral';
      }

      const confidence = Math.min(100, Math.round(50 + Math.abs(rsi - 50)));

      return {
        symbol,
        rsi: this.round(rsi),
        resistance1: this.round(resistance1),
        resistance2: this.round(resistance2),
        support1: this.round(support1),
        support2: this.round(support2),
        aiSummary: {
          th: this.generateSummaryTh(
            currentPrice,
            rsi,
            support1,
            resistance1,
            trend,
          ),
          en: this.generateSummaryEn(
            currentPrice,
            rsi,
            support1,
            resistance1,
            trend,
          ),
        },
        trend,
        confidence,
        currentPrice: this.round(currentPrice),
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `Unable to calculate technical analysis for ${symbol}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        `Technical analysis is unavailable for ${symbol}`,
      );
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.realtimeCache.clear();
  }

  getCacheStats(): {
    size: number;
    symbols: string[];
    ttlMs: number;
    realtime: { size: number; symbols: string[]; ttlMs: number };
  } {
    return {
      size: this.cache.size,
      symbols: [...this.cache.keys()],
      ttlMs: this.cacheTtlMs,
      realtime: {
        size: this.realtimeCache.size,
        symbols: [...this.realtimeCache.keys()],
        ttlMs: this.realtimeTtlMs,
      },
    };
  }

  private normalizeSymbols(symbols: string[]): string[] {
    return [
      ...new Set(
        symbols
          .map((symbol) =>
            String(symbol ?? '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
  }

  private normalizeSymbol(symbolInput: string): string {
    const symbol = String(symbolInput ?? '')
      .trim()
      .toUpperCase();

    if (!symbol) {
      throw new BadRequestException('symbol is required');
    }

    if (symbol.length > 30) {
      throw new BadRequestException('symbol is too long');
    }

    return symbol;
  }

  private optionalNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private positiveNumber(value: unknown): number | null {
    const numeric = this.optionalNumber(value);
    return numeric !== null && numeric > 0 ? numeric : null;
  }

  private roundOptional(value: number | null): number | null {
    return value === null ? null : this.round(value);
  }

  private calculateWilderRsi(closes: number[], period = 14): number {
    let avgGain = 0;
    let avgLoss = 0;

    for (let index = 1; index <= period; index++) {
      const delta = closes[index] - closes[index - 1];

      if (delta > 0) {
        avgGain += delta;
      } else {
        avgLoss += -delta;
      }
    }

    avgGain /= period;
    avgLoss /= period;

    for (let index = period + 1; index < closes.length; index++) {
      const delta = closes[index] - closes[index - 1];
      const gain = delta > 0 ? delta : 0;
      const loss = delta < 0 ? -delta : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    const relativeStrength = avgGain / avgLoss;

    return Math.max(0, Math.min(100, 100 - 100 / (1 + relativeStrength)));
  }

  private generateSummaryTh(
    currentPrice: number,
    rsi: number,
    support: number,
    resistance: number,
    trend: string,
  ): string {
    if (rsi < 30) {
      return `RSI ${rsi.toFixed(
        2,
      )} อยู่ในเขต Oversold ราคาอาจผันผวนบริเวณแนวรับ ${support.toFixed(2)}`;
    }

    if (rsi > 70) {
      return `RSI ${rsi.toFixed(
        2,
      )} อยู่ในเขต Overbought ควรระวังแรงขายบริเวณแนวต้าน ${resistance.toFixed(
        2,
      )}`;
    }

    if (trend === 'bullish') {
      return `ราคาปัจจุบัน ${currentPrice.toFixed(
        2,
      )} มีแรงซื้อสนับสนุน แนวต้านถัดไป ${resistance.toFixed(2)}`;
    }

    if (trend === 'bearish') {
      return `ราคาปัจจุบัน ${currentPrice.toFixed(
        2,
      )} อยู่ภายใต้แรงขาย แนวรับถัดไป ${support.toFixed(2)}`;
    }

    return `ราคาปัจจุบัน ${currentPrice.toFixed(
      2,
    )} เคลื่อนไหวเป็นกลางระหว่างแนวรับ ${support.toFixed(
      2,
    )} และแนวต้าน ${resistance.toFixed(2)}`;
  }

  private generateSummaryEn(
    currentPrice: number,
    rsi: number,
    support: number,
    resistance: number,
    trend: string,
  ): string {
    if (rsi < 30) {
      return `RSI ${rsi.toFixed(
        2,
      )} is oversold. Price may remain volatile near support ${support.toFixed(
        2,
      )}.`;
    }

    if (rsi > 70) {
      return `RSI ${rsi.toFixed(
        2,
      )} is overbought. Watch for selling pressure near resistance ${resistance.toFixed(
        2,
      )}.`;
    }

    if (trend === 'bullish') {
      return `Current price ${currentPrice.toFixed(
        2,
      )} has positive momentum. Next resistance is ${resistance.toFixed(2)}.`;
    }

    if (trend === 'bearish') {
      return `Current price ${currentPrice.toFixed(
        2,
      )} remains under selling pressure. Next support is ${support.toFixed(
        2,
      )}.`;
    }

    return `Current price ${currentPrice.toFixed(
      2,
    )} is neutral between support ${support.toFixed(
      2,
    )} and resistance ${resistance.toFixed(2)}.`;
  }

  private round(value: number): number {
    return Number(value.toFixed(2));
  }
}

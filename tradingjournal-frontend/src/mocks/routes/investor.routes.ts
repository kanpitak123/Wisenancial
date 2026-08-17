import { defineMockRoutes } from '../mock.types';
import {
  STOCK_UNIVERSE,
  createRng,
  dateKeyDaysAgo,
  isoDaysAgo,
  round,
  stockPrice,
} from '../data/seed';
import {
  DIVIDENDS,
  DIVIDEND_INCOME,
  INVESTOR_DASHBOARD,
  INVESTOR_ACTIVITY,
  INVESTOR_SALES,
  investorPerformance,
} from '../data/investor.data';
import { MOCK_PURCHASES, addMockPurchase, applyMockSale } from '../data/stock-purchases.data';
import { buildCandles } from './trader.routes';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function seedFor(symbol: string): number {
  return [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0) * 104729;
}

function profileOf(symbol: string) {
  const stock = STOCK_UNIVERSE.find((s) => s.symbol === symbol);
  const price = stock?.price ?? 100;

  return {
    symbol,
    name: stock?.name ?? symbol,
    description:
      'บริษัทชั้นนำในกลุ่มอุตสาหกรรมของตน มีรายได้ประจำที่แข็งแรงและกระแสเงินสดเป็นบวกต่อเนื่อง (ข้อมูลตัวอย่างสำหรับ mock mode)',
    ceo: 'Jane Cooper',
    website: `https://example.com/${symbol.toLowerCase()}`,
    industry: stock?.sector ?? 'Technology',
    marketCap: stock?.marketCap ?? 100_000_000_000,
    sector: stock?.sector ?? 'Technology',
    headquarters: stock?.exchange === 'SET' ? 'Bangkok, Thailand' : 'California, USA',
    currentPrice: price,
    priceChange: stock?.changePercent ?? 0,
    dividendYield: stock?.dividendYield ?? null,
  };
}

function financialsOf(symbol: string) {
  const rng = createRng(seedFor(symbol));
  const stock = STOCK_UNIVERSE.find((s) => s.symbol === symbol);

  return Array.from({ length: 8 }, (_, index) => {
    const year = new Date().getFullYear() - Math.floor((7 - index) / 4);
    const quarter = ((index % 4) + 1) as 1 | 2 | 3 | 4;
    const revenue = round(20_000_000_000 * (0.85 + rng() * 0.4));

    return {
      symbol,
      revenue,
      netIncome: round(revenue * (0.14 + rng() * 0.12)),
      eps: round(1.2 + rng() * 3.4),
      peRatio: stock?.peRatio ?? round(18 + rng() * 20),
      quarter: `Q${quarter}`,
      year,
    };
  });
}

function historicalOf(symbol: string) {
  return buildCandles(symbol, 260).map((point) => ({
    date: point.time,
    open: point.open ?? point.close,
    high: point.high ?? point.close,
    low: point.low ?? point.close,
    close: point.close,
    volume: 3_400_000,
  }));
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;

  values.forEach((value, index) => {
    if (index < period - 1) {
      out.push(null);
      return;
    }
    prev = prev === null ? value : round(value * k + prev * (1 - k), 4);
    out.push(prev);
  });

  return out;
}

function technicalOf(symbol: string) {
  const history = historicalOf(symbol);
  const closes = history.map((h) => h.close);
  const price = stockPrice(symbol);
  const rng = createRng(seedFor(symbol) + 13);

  const rsi = round(38 + rng() * 34, 1);
  const k = round(30 + rng() * 50, 1);
  const d = round(k - 4 + rng() * 8, 1);

  const status =
    rsi > 70 ? 'Sell Signal' : rsi < 30 ? 'Buy Signal' : rsi > 60 ? 'Neutral' : 'Neutral';

  return {
    rsi,
    stochastic: { k, d },
    overboughtOversold: {
      status,
      rsi,
      stochasticK: k,
      stochasticD: d,
      isStrongReversal: rsi > 72 || rsi < 28,
      description:
        rsi > 70
          ? 'RSI เข้าเขตซื้อมากเกินไป ระวังแรงขายทำกำไรระยะสั้น'
          : rsi < 30
            ? 'RSI เข้าเขตขายมากเกินไป มีโอกาสเด้งกลับทางเทคนิค'
            : 'สัญญาณอยู่ในโซนกลาง ยังไม่มีสัญญาณกลับตัวชัดเจน',
    },
    supportLevels: [round(price * 0.965, 2), round(price * 0.932, 2)],
    resistanceLevels: [round(price * 1.038, 2), round(price * 1.072, 2)],
    currentPrice: price,
    detectedPattern: {
      name: 'Ascending Triangle',
      detectedAt: dateKeyDaysAgo(9),
      coordinates: [
        { date: dateKeyDaysAgo(45), price: round(price * 0.94, 2) },
        { date: dateKeyDaysAgo(30), price: round(price * 0.98, 2) },
        { date: dateKeyDaysAgo(15), price: round(price * 0.96, 2) },
        { date: dateKeyDaysAgo(2), price: round(price * 1.01, 2) },
      ],
    },
    emas: {
      ema20: emaSeries(closes, 20),
      ema50: emaSeries(closes, 50),
      ema100: emaSeries(closes, 100),
    },
  };
}

function popularStocks(market: 'GLOBAL' | 'TH') {
  return STOCK_UNIVERSE.filter((s) =>
    market === 'TH' ? s.exchange === 'SET' : s.exchange !== 'SET',
  )
    .slice(0, 8)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      changePercent: stock.changePercent,
      preMarketPrice: round(stock.price * 1.002, 2),
      preMarketChangePercent: round(stock.changePercent * 0.35, 2),
      support1: round(stock.price * 0.965, 2),
      support2: round(stock.price * 0.932, 2),
      resistance1: round(stock.price * 1.038, 2),
      resistance2: round(stock.price * 1.072, 2),
      dividendYield: stock.dividendYield,
      marketCap: stock.marketCap,
    }));
}

export const investorRoutes = defineMockRoutes([
  // ---------- Stock catalog / listing ----------
  {
    method: 'GET',
    path: '/stocks',
    handler: () =>
      STOCK_UNIVERSE.map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector })),
  },
  {
    method: 'GET',
    path: '/stocks/listing',
    handler: (ctx) => {
      const search = (ctx.query.search ?? '').toLowerCase();
      const exchange = ctx.query.exchange;
      const sector = ctx.query.sector;
      const market = ctx.query.market;
      const page = Number(ctx.query.page ?? 1);
      const pageSize = Number(ctx.query.pageSize ?? 20);
      const sortBy = ctx.query.sortBy ?? 'marketCap';
      const sortDir = ctx.query.sortDir ?? 'desc';

      let rows = STOCK_UNIVERSE.filter((stock) => {
        if (search && !`${stock.symbol} ${stock.name}`.toLowerCase().includes(search)) return false;
        if (exchange && exchange !== 'ALL' && stock.exchange !== exchange) return false;
        if (sector && sector !== 'ALL' && stock.sector !== sector) return false;
        if (market === 'TH' && stock.exchange !== 'SET') return false;
        if (market === 'GLOBAL' && stock.exchange === 'SET') return false;
        return true;
      });

      rows = [...rows].sort((a, b) => {
        const left = a[sortBy as keyof typeof a];
        const right = b[sortBy as keyof typeof b];
        const compare =
          typeof left === 'string' && typeof right === 'string'
            ? left.localeCompare(right)
            : Number(left ?? 0) - Number(right ?? 0);
        return sortDir === 'desc' ? -compare : compare;
      });

      const start = (page - 1) * pageSize;

      return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
    },
  },
  {
    method: 'GET',
    path: '/stocks/radar',
    handler: () => {
      const buckets = ['TODAY', 'THIS_WEEK', 'THIS_MONTH'] as const;

      // ราคาเริ่มต้นคุมให้ผลตอบแทนกระจายครบทั้ง 4 หมวด และหมวด Near/Not มีเกิน 4 ตัว
      // เพื่อให้ปุ่ม "ดูทั้งหมด" โผล่จริงตอนเปิด mock mode ดูด้วยตา
      const INITIAL_RATIOS = [0.8, 0.93, 0.97, 0.99, 1.05, 1.13];

      // เกณฑ์เดียวกับ StocksService.categorizeReturn() ฝั่ง backend
      const categorize = (returnPercent: number) => {
        if (returnPercent >= 10) return 'Upside';
        if (returnPercent >= 3) return 'Near-recommended';
        if (returnPercent <= -10) return 'Downside';
        return 'Not-recommended';
      };

      return STOCK_UNIVERSE.map((stock, index) => {
        const initialPrice = round(stock.price * INITIAL_RATIOS[index % INITIAL_RATIOS.length]!, 2);
        const returnPercent = round(((stock.price - initialPrice) / initialPrice) * 100);

        return {
          symbol: stock.symbol,
          name: stock.name,
          category: categorize(returnPercent),
          sector: stock.sector,
          dateBucket: buckets[index % buckets.length],
          initialPrice,
          currentPrice: stock.price,
          startDate: dateKeyDaysAgo(7 + index * 3),
          returnPercent,
        };
      });
    },
  },
  { method: 'GET', path: '/stocks/popular', handler: () => popularStocks('GLOBAL') },
  { method: 'GET', path: '/stocks/popular-th', handler: () => popularStocks('TH') },

  // ---------- Stock analysis ----------
  {
    method: 'GET',
    path: '/stocks/analysis/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');

      return {
        profile: profileOf(symbol),
        financials: financialsOf(symbol),
        historicalData: historicalOf(symbol),
        technicalIndicators: technicalOf(symbol),
      };
    },
  },
  {
    method: 'GET',
    path: '/stocks/intrinsic-value/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');
      const price = stockPrice(symbol);
      const rng = createRng(seedFor(symbol) + 5);
      const intrinsic = round(price * (0.82 + rng() * 0.45), 2);
      const discount = round(((intrinsic - price) / price) * 100);

      return {
        symbol,
        currentPrice: price,
        intrinsicValue: intrinsic,
        status: discount > 8 ? 'Undervalued' : discount < -8 ? 'Overvalued' : 'Fair Value',
        discountPremium: discount,
        analysis: {
          peAnalysis: 'P/E สูงกว่าค่าเฉลี่ยกลุ่มเล็กน้อย สะท้อนความคาดหวังการเติบโตที่สูง',
          epsGrowth: 'EPS เติบโตเฉลี่ย 12% ต่อปีในช่วง 3 ปีที่ผ่านมา',
          revenueQuality: 'รายได้ส่วนใหญ่เป็นแบบ recurring ทำให้คาดการณ์ได้ง่าย',
          overall:
            discount > 0
              ? 'ราคาปัจจุบันยังต่ำกว่ามูลค่าที่ประเมินได้ น่าสนใจสำหรับการทยอยสะสม'
              : 'ราคาปัจจุบันสูงกว่ามูลค่าพื้นฐาน ควรรอจังหวะย่อ',
        },
        confidence: Math.round(62 + rng() * 25),
      };
    },
  },
  {
    method: 'GET',
    path: '/stocks/seasonality/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');
      const rng = createRng(seedFor(symbol) + 21);
      const totalYears = 10;

      const analysis = MONTH_NAMES.map((month, index) => {
        const positiveYears = Math.round(3 + rng() * 6);
        const avgPercent = round((positiveYears / totalYears - 0.5) * 9, 2);

        return {
          month,
          monthNumber: index + 1,
          winRate: round((positiveYears / totalYears) * 100),
          averageChangePercent: avgPercent,
          averageChangePrice: round((stockPrice(symbol) * avgPercent) / 100, 2),
          positiveYears,
          totalYears,
        };
      });

      const sorted = [...analysis].sort((a, b) => b.winRate - a.winRate);

      return {
        symbol,
        analysis,
        overallWinRate: round(analysis.reduce((sum, m) => sum + m.winRate, 0) / analysis.length),
        bestMonth: sorted[0],
        worstMonth: sorted[sorted.length - 1],
        totalYearsAnalyzed: totalYears,
      };
    },
  },
  {
    method: 'GET',
    path: '/stocks/analyst/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');
      const price = stockPrice(symbol);
      const rng = createRng(seedFor(symbol) + 33);
      const mean = round(1.6 + rng() * 1.6, 2);

      return {
        symbol,
        recommendationKey: mean < 2 ? 'buy' : mean < 2.6 ? 'hold' : 'underperform',
        recommendationMean: mean,
        numberOfAnalysts: Math.round(18 + rng() * 24),
        targetMeanPrice: round(price * 1.12, 2),
        targetHighPrice: round(price * 1.34, 2),
        targetLowPrice: round(price * 0.86, 2),
        updatedAt: isoDaysAgo(4),
      };
    },
  },
  {
    method: 'GET',
    path: '/assets/valuation/:symbol',
    handler: (ctx) => {
      const symbol = decodeURIComponent(ctx.params.symbol ?? 'AAPL');
      const price = stockPrice(symbol);
      const intrinsic = round(price * 1.08, 2);

      return {
        currentPrice: price,
        intrinsicValue: intrinsic,
        valuationPercentage: round(((intrinsic - price) / price) * 100),
        isOvervalued: intrinsic < price,
        scenarios: {
          bear: {
            price: round(price * 0.78, 2),
            growthRate: 3,
            reasoning: 'เศรษฐกิจชะลอตัว รายได้โตต่ำกว่าคาด',
          },
          base: { price: intrinsic, growthRate: 8, reasoning: 'เติบโตตามค่าเฉลี่ยอุตสาหกรรม' },
          bull: {
            price: round(price * 1.42, 2),
            growthRate: 14,
            reasoning: 'ขยายส่วนแบ่งตลาดและอัตรากำไรดีขึ้น',
          },
        },
        wallStreetTargets: {
          low: round(price * 0.86, 2),
          mean: round(price * 1.12, 2),
          high: round(price * 1.34, 2),
        },
        dcfInputs: {
          freeCashFlow: 24_500_000_000,
          growthRate: 8,
          discountRate: 9.5,
          terminalGrowthRate: 2.5,
          sharesOutstanding: 15_400_000_000,
          isEstimated: true,
        },
      };
    },
  },

  // ---------- Investor portfolio ----------
  {
    method: 'GET',
    path: '/investor/portfolios/:portfolioId/dashboard',
    handler: () => INVESTOR_DASHBOARD,
  },
  {
    method: 'GET',
    path: '/investor/portfolios/:portfolioId/timeline',
    handler: () => INVESTOR_ACTIVITY,
  },
  {
    method: 'GET',
    path: '/investor/portfolios/:portfolioId/performance',
    handler: () => investorPerformance(),
  },
  {
    method: 'GET',
    path: '/investor/portfolios/:portfolioId/stocks/sales',
    handler: () => INVESTOR_SALES,
  },
  {
    method: 'POST',
    path: '/investor/portfolios/:portfolioId/stocks/buy',
    // เขียนลงทะเบียน lot จริง เพื่อให้หน้า StockRecord เห็นรายการใหม่หลังบันทึก
    handler: (ctx) => ({ success: true, purchase: addMockPurchase(ctx.body) }),
  },
  {
    method: 'POST',
    path: '/investor/portfolios/:portfolioId/stocks/sell',
    handler: (ctx) => ({ success: true, ...applyMockSale(ctx.body) }),
  },

  // ---------- Stock purchases (lot ดิบ) ----------
  {
    method: 'GET',
    path: '/stock-purchases/portfolio/:portfolioId',
    handler: (ctx) => {
      const status = ctx.query.status;

      return status
        ? MOCK_PURCHASES.filter((purchase) => purchase.status === status)
        : [...MOCK_PURCHASES];
    },
  },
  {
    method: 'GET',
    path: '/stock-purchases/:id',
    handler: (ctx) =>
      MOCK_PURCHASES.find((purchase) => purchase.id === Number(ctx.params.id)) ??
      MOCK_PURCHASES[0],
  },

  // ---------- Dividends ----------
  {
    method: 'GET',
    path: '/dividends/portfolio/:portfolioId',
    handler: () => DIVIDENDS,
  },
  {
    method: 'GET',
    path: '/dividends/portfolio/:portfolioId/summary',
    handler: (ctx) => ({
      portfolio_id: Number(ctx.params.portfolioId),
      year: new Date().getFullYear(),
      count: DIVIDENDS.length,
      gross_amount: round(DIVIDENDS.reduce((s, d) => s + Number(d.gross_amount), 0)),
      tax_withheld: round(DIVIDENDS.reduce((s, d) => s + Number(d.tax_withheld), 0)),
      net_amount: DIVIDEND_INCOME,
    }),
  },
  {
    method: 'GET',
    path: '/dividends/portfolio/:portfolioId/tax-summary',
    handler: (ctx) => {
      const year = Number(ctx.query.year ?? new Date().getFullYear());

      const records = DIVIDENDS.filter(
        (item) => new Date(item.payment_date).getFullYear() === year,
      ).map((item) => ({
        id: item.id,
        symbol: item.symbol,
        name: item.name ?? item.symbol,
        paymentDate: String(item.payment_date).slice(0, 10),
        shares: Number(item.shares),
        dividendPerShare: Number(item.dividend_per_share),
        grossAmount: Number(item.gross_amount),
        whtRate: Number(item.wht_rate),
        taxWithheld: Number(item.tax_withheld),
        netAmount: Number(item.net_amount),
      }));

      const total = (pick: (item: (typeof records)[number]) => number) =>
        round(records.reduce((sum, item) => sum + pick(item), 0));

      return {
        portfolio_id: Number(ctx.params.portfolioId),
        year,
        records,
        totalGross: total((item) => item.grossAmount),
        totalTaxWithheld: total((item) => item.taxWithheld),
        totalNet: total((item) => item.netAmount),
        byWhtRate: records.length
          ? [
              {
                whtRate: 0.1,
                count: records.length,
                grossAmount: total((item) => item.grossAmount),
                taxWithheld: total((item) => item.taxWithheld),
              },
            ]
          : [],
      };
    },
  },
  {
    method: 'POST',
    path: '/dividends/portfolio/:portfolioId',
    handler: (ctx) => ({
      dividend: { ...DIVIDENDS[0], id: Date.now() % 100000, ...ctx.body },
      record: {
        id: Date.now() % 100000,
        portfolio_id: Number(ctx.params.portfolioId),
        type: 'DIVIDEND',
        amount: Number(ctx.body.shares ?? 0) * Number(ctx.body.dividend_per_share ?? 0),
        currency: 'THB',
        description: 'ปันผล (mock)',
        source: 'DIVIDEND',
        source_id: null,
        occurred_at: isoDaysAgo(0),
        status: 'ACTIVE',
      },
      current_balance: INVESTOR_DASHBOARD.summary.cash,
    }),
  },
  {
    method: 'DELETE',
    path: '/dividends/:id',
    handler: (ctx) => ({
      message: 'ยกเลิกรายการปันผลแล้ว (mock)',
      reversed_id: Number(ctx.params.id),
      dividend: DIVIDENDS[0],
      reversal: {
        id: Date.now() % 100000,
        portfolio_id: 2,
        type: 'REVERSAL',
        amount: 0,
        currency: 'THB',
        source: 'SYSTEM',
        source_id: null,
        reversal_of_id: Number(ctx.params.id),
      },
      current_balance: INVESTOR_DASHBOARD.summary.cash,
    }),
  },
]);

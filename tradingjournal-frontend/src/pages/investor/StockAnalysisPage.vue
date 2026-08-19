<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { api } from 'boot/axios';
import StockValuationWidget from 'components/StockValuationWidget.vue';
import MarketOverviewSection from 'components/MarketOverviewSection.vue';
import PriceChart from 'components/charts/PriceChart.vue';
import { useLivePrice } from 'src/composables/useLivePrice';
import { useStockCatalog } from 'src/composables/useStockCatalog';
import StockSymbolPicker from 'components/stocks/StockSymbolPicker.vue';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';
import {
  isNewerTradingDay,
  mergeLivePrice,
  toCandlestickData,
  toOverlayData,
  toPatternData,
  toTradingDay,
  type OverlaySpec,
  type PriceLineSpec,
} from 'src/utils/price-chart';

// TypeScript interfaces
interface StockProfile {
  symbol: string;
  name: string;
  description: string;
  ceo: string;
  website: string;
  industry: string;
  marketCap: number;
  sector: string;
  headquarters: string;
  currentPrice: number;
  priceChange: number;
  /** Trailing annual dividend yield as a percentage (e.g. 0.53 = 0.53%). */
  dividendYield?: number | null;
}

interface FinancialData {
  symbol: string;
  revenue: number;
  netIncome: number;
  eps: number;
  peRatio: number;
  quarter: string;
  year: number;
}

interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PatternCoordinate {
  date: string;
  price: number;
}

interface DetectedPattern {
  name: string | null;
  detectedAt: string | null;
  coordinates: PatternCoordinate[];
}

interface EmaSeries {
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema100: (number | null)[];
}

interface StochasticResult {
  k: number;
  d: number;
}

type OverboughtOversoldStatus =
  | 'Strong Buy'
  | 'Buy Signal'
  | 'Strong Sell'
  | 'Sell Signal'
  | 'Neutral';

interface OverboughtOversoldSignal {
  status: OverboughtOversoldStatus;
  rsi: number;
  stochasticK: number;
  stochasticD: number;
  isStrongReversal: boolean;
  description: string;
}

interface IntrinsicValueAnalysis {
  symbol: string;
  currentPrice: number;
  intrinsicValue: number;
  status: 'Undervalued' | 'Fair Value' | 'Overvalued';
  discountPremium: number;
  analysis: {
    peAnalysis: string;
    epsGrowth: string;
    revenueQuality: string;
    overall: string;
  };
  confidence: number;
}

interface MonthlySeasonality {
  month: string;
  monthNumber: number;
  winRate: number;
  averageChangePercent: number;
  averageChangePrice: number;
  positiveYears: number;
  totalYears: number;
}

interface SeasonalityAnalysis {
  symbol: string;
  analysis: MonthlySeasonality[];
  overallWinRate: number;
  bestMonth: MonthlySeasonality;
  worstMonth: MonthlySeasonality;
  totalYearsAnalyzed: number;
}

interface TechnicalIndicators {
  rsi: number;
  stochastic: StochasticResult;
  overboughtOversold: OverboughtOversoldSignal;
  supportLevels: number[];
  resistanceLevels: number[];
  currentPrice: number;
  detectedPattern: DetectedPattern;
  emas: EmaSeries;
}

interface StockAnalysisResponse {
  profile: StockProfile;
  financials: FinancialData[];
  historicalData: HistoricalDataPoint[];
  technicalIndicators: TechnicalIndicators;
}

/**
 * แจ้งหน้าแม่ (StockTerminalPage) ให้กางแถบสำรวจหุ้นด้านซ้าย — ใช้แทนการเปลี่ยนหน้า
 * ไป /StockExplorer แบบเดิมที่ตอนนี้ถูกยุบรวมเข้ามาในหน้าเดียวกันแล้ว
 */
const emit = defineEmits<{ (event: 'browse-all'): void }>();

const $q = useQuasar();
const languageStore = useLanguageStore();
const route = useRoute();
const router = useRouter();
const activeTab = ref('graph');

// State
/**
 * แยก "โหลดครั้งแรก" ออกจาก "โหลดทับของเดิม" โดยตั้งใจ
 *
 * ของเดิมใช้ loading ตัวเดียวคุม v-if ที่ครอบทั้ง terminal-main ทำให้ทุกครั้งที่เปลี่ยน
 * timeframe/หุ้น ทั้งก้อน (q-tab-panels ที่มี transition ค้างอยู่ + PriceChart ที่ถือ
 * canvas กับ ResizeObserver) ถูกถอดทิ้งแล้วสร้างใหม่ ผลคือ:
 *   - Vue ไล่ patch vnode ที่ transition เพิ่งถอด element ทิ้งไป -> n1.el เป็น null
 *     -> "Cannot set properties of null (setting '__vnode')"
 *   - กราฟถูกสร้างใหม่ตอน container ยังไม่มีขนาด -> ได้กราฟเปล่าที่ไม่ฟื้นเอง
 *
 * ตอนนี้มีข้อมูลอยู่แล้วจะไม่ถอดอะไรทิ้ง แค่ขึ้นตัวบอกสถานะทับไว้
 */
const loading = ref(false);
const refreshing = ref(false);
const error = ref('');
/** โหลดทับของเดิมแล้วพัง — ต้องมีให้เห็น ไม่ใช่เงียบแล้วปล่อยกราฟค้างข้อมูลเก่า */
const refreshError = ref('');
const stockData = ref<StockAnalysisResponse | null>(null);
const selectedTimeframe = ref('1D');
const selectedInterval = ref('1d');
const selectedRange = ref('1mo');
const chartDisplayType = ref<'candlestick' | 'line'>('candlestick');
const openSearchDialog = ref(false);
const searchQuery = ref('');
const selectedCategory = ref<string | null>(null);

// รายชื่อหุ้นย้ายไปเป็นแคชกลางที่ useStockCatalog (โหลดครั้งเดียวใช้ร่วมกันทุกหน้า)
const { catalog: stockCatalog, load: loadStockCatalog, search: searchCatalog } = useStockCatalog();

/** ใช้เฉพาะกล่องค้นหาขั้นสูงที่มีตัวกรองหมวดหมู่ — แถบค้นหาหลักใช้ StockSymbolPicker แล้ว */
const filteredSearchResults = computed(() => {
  const results = searchCatalog(stockCatalog.value, searchQuery.value, 20);

  if (!selectedCategory.value) return results;

  return results.filter((item) => item.sector === selectedCategory.value);
});

const onSearchQueryUpdate = (val: string | number | null) => {
  searchQuery.value = String(val ?? '');
};

const selectSearchResult = (symbol: string) => {
  searchQuery.value = symbol;
  openSearchDialog.value = false;
  selectedSymbol.value = symbol;
  void router.push(`/stock/${symbol}`);
};

const categoryOptions = [
  {
    label: languageStore.isThai ? 'เทคโนโลยี' : 'Technology',
    value: 'Technology',
    icon: 'devices',
  },
  {
    label: languageStore.isThai ? 'สุขภาพ' : 'Healthcare',
    value: 'Healthcare',
    icon: 'health_and_safety',
  },
  {
    label: languageStore.isThai ? 'พลังงาน' : 'Energy',
    value: 'Energy',
    icon: 'local_fire_department',
  },
  {
    label: languageStore.isThai ? 'การเงิน' : 'Finance',
    value: 'Finance',
    icon: 'account_balance',
  },
  {
    label: languageStore.isThai ? 'ผู้บริโภค' : 'Consumer',
    value: 'Consumer',
    icon: 'shopping_cart',
  },
];

const yearOptions = [
  { label: languageStore.isThai ? '6 เดือนที่ผ่านมา' : 'Last 6 Months', value: '6M' },
  { label: '2025', value: '2025' },
  { label: '2024', value: '2024' },
  { label: '2023', value: '2023' },
  { label: '2022', value: '2022' },
  { label: languageStore.isThai ? '5 ปีที่ผ่านมา' : 'Last 5 Years', value: '5Y' },
];
const selectedYear = ref('5Y');

// TradingView-style timeframes (hourly and above only)
const timeframes = [
  { label: '1H', value: '1H', interval: '1h', range: '5d' },
  { label: '1D', value: '1D', interval: '1d', range: '1mo' },
  { label: '1W', value: '1W', interval: '1wk', range: '3mo' },
  { label: '1M', value: '1M', interval: '1mo', range: '1y' },
  { label: '1Y', value: '1Y', interval: '1d', range: '1y' },
  { label: '3Y', value: '3Y', interval: '1wk', range: '3y' },
  { label: '5Y', value: '5Y', interval: '1mo', range: '5y' },
];

// Reactive state
const selectedSymbol = ref((route.params.symbol as string) || 'AAPL');

/**
 * ราคาสด — poll ทุก 15 วิ ผ่านแคชกลางของ backend (GET /market/quotes/realtime)
 *
 * ไม่ใช่ streaming จริง: Yahoo Finance แบบฟรีไม่มี websocket ให้ใช้ นี่คือการ refresh
 * เป็นช่วง ๆ ที่ถี่ขึ้นกว่าเดิม (ของเดิมโหลดครั้งเดียวตอนเปิดหน้าแล้วค้างอยู่อย่างนั้น)
 * และหยุดเองเมื่อผู้ใช้สลับไปแท็บอื่นของเบราว์เซอร์
 */
const {
  quote: liveQuote,
  isPaused: livePaused,
  refresh: refreshLivePrice,
} = useLivePrice(selectedSymbol, {
  enabled: computed(() => Boolean(stockData.value)),
});

const currentPrice = computed(() => {
  if (liveQuote.value?.price) return liveQuote.value.price;
  if (stockData.value?.profile?.currentPrice) return stockData.value.profile.currentPrice;
  if (stockData.value?.technicalIndicators?.currentPrice)
    return stockData.value.technicalIndicators.currentPrice;
  if (stockData.value?.historicalData && stockData.value.historicalData.length > 0) {
    return stockData.value.historicalData[stockData.value.historicalData.length - 1]?.close || 0;
  }
  return 0; // Fallback to 0 to prevent NaN
});
const priceChange = computed(() => {
  // Yahoo คิด %chg เทียบราคาปิดวันก่อนให้แล้ว ตรงกว่าการเทียบสองแท่งท้ายของกราฟ
  // ซึ่งเปลี่ยนความหมายไปตาม interval ที่เลือก (1W/1M แท่งก่อนหน้าคือสัปดาห์/เดือนก่อน)
  if (liveQuote.value?.changePercent != null) return liveQuote.value.changePercent;

  if (
    !stockData.value ||
    !stockData.value.historicalData ||
    stockData.value.historicalData.length < 2
  )
    return 0;
  const latest = stockData.value.historicalData[stockData.value.historicalData.length - 1];
  const previous = stockData.value.historicalData[stockData.value.historicalData.length - 2];
  // TypeScript ตอนนี้รู้แล้วว่า latest และ previous ไม่ใช่ undefined แน่ๆ
  return latest && previous && previous.close
    ? ((latest.close - previous.close) / previous.close) * 100
    : 0;
});

/** เวลาที่ราคาสดอัปเดตล่าสุด — โชว์ข้างป้ายราคาให้รู้ว่าตัวเลขเก่าแค่ไหน */
const liveUpdatedLabel = computed(() => {
  if (!liveQuote.value) return '';

  return new Date(liveQuote.value.asOf).toLocaleTimeString(
    languageStore.isThai ? 'th-TH' : 'en-US',
    { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
  );
});
const priceChangeColor = computed(() => {
  const change = priceChange.value;
  if (change > 0) return 'positive';
  if (change < 0) return 'negative';
  return 'neutral';
});

// Overbought/Oversold confluence signal (RSI + Stochastic %K)
const overboughtSignal = computed<OverboughtOversoldSignal | null>(
  () => stockData.value?.technicalIndicators?.overboughtOversold ?? null,
);

const intrinsicValue = ref<IntrinsicValueAnalysis | null>(null);
const intrinsicValueLoading = ref(false);

const intrinsicValueStatusColor = computed(() => {
  switch (intrinsicValue.value?.status) {
    case 'Undervalued':
      return 'positive';
    case 'Overvalued':
      return 'negative';
    default:
      return 'grey';
  }
});

const intrinsicValueStatusIcon = computed(() => {
  switch (intrinsicValue.value?.status) {
    case 'Undervalued':
      return 'trending_up';
    case 'Overvalued':
      return 'trending_down';
    default:
      return 'remove';
  }
});

/** คำขอย่อยของหุ้นตัวที่ผู้ใช้เปลี่ยนไปแล้ว ต้องไม่เขียนทับข้อมูลของตัวปัจจุบัน */
const isStaleSymbol = (symbol: string) =>
  selectedSymbol.value.toUpperCase() !== symbol.toUpperCase();

const fetchIntrinsicValue = async (symbol: string) => {
  intrinsicValueLoading.value = true;
  try {
    const response = await api.get(`/stocks/intrinsic-value/${symbol}`);
    if (isStaleSymbol(symbol)) return;
    intrinsicValue.value = response.data;
  } catch (err) {
    if (isStaleSymbol(symbol)) return;
    console.error('Failed to fetch intrinsic value:', err);
    $q.notify({
      type: 'negative',
      message: languageStore.isThai
        ? 'ไม่สามารถดึงข้อมูลมูลค่าพื้นฐานได้'
        : 'Failed to fetch intrinsic value',
      position: 'top',
    });
  } finally {
    if (!isStaleSymbol(symbol)) {
      intrinsicValueLoading.value = false;
    }
  }
};

// Seasonality analysis state
const seasonalityData = ref<SeasonalityAnalysis | null>(null);
const seasonalityLoading = ref(false);
const fetchSeasonalityData = async (symbol: string) => {
  seasonalityLoading.value = true;
  try {
    const response = await api.get(`/stocks/seasonality/${symbol}`, {
      params: { period: selectedYear.value },
    });
    if (isStaleSymbol(symbol)) return;
    seasonalityData.value = response.data;
  } catch (err) {
    if (isStaleSymbol(symbol)) return;
    console.error('Failed to fetch seasonality data:', err);
    $q.notify({
      type: 'negative',
      message: languageStore.isThai
        ? 'ไม่สามารถดึงข้อมูลสถิติฤดูกาลได้'
        : 'Failed to fetch seasonality data',
      position: 'top',
    });
  } finally {
    if (!isStaleSymbol(symbol)) {
      seasonalityLoading.value = false;
    }
  }
};

// Refetch seasonality whenever the user picks a different period/year.
watch(selectedYear, () => {
  if (selectedSymbol.value) {
    void fetchSeasonalityData(selectedSymbol.value);
  }
});

// Helper function to get seasonality cell color
const getSeasonalityCellColor = (averageChangePercent: number) => {
  if (averageChangePercent > 0) {
    return 'positive';
  } else if (averageChangePercent < 0) {
    return 'negative';
  }
  return 'neutral';
};

// Helper function to get seasonality cell intensity
const getSeasonalityCellIntensity = (averageChangePercent: number) => {
  const absChange = Math.abs(averageChangePercent);
  if (absChange > 2) return 'high';
  if (absChange > 1) return 'medium';
  return 'low';
};

const signalIcon = computed(() => {
  switch (overboughtSignal.value?.status) {
    case 'Strong Buy':
      return 'trending_up';
    case 'Buy Signal':
      return 'arrow_upward';
    case 'Strong Sell':
      return 'trending_down';
    case 'Sell Signal':
      return 'arrow_downward';
    default:
      return 'remove';
  }
});

const signalLabel = computed(() => {
  const signal = overboughtSignal.value;
  if (!signal) return '';
  if (signal.isStrongReversal) {
    return languageStore.isThai ? 'คาดว่าจะกลับตัวรุนแรง' : 'Strong Reversal Expected';
  }
  const labels: Record<OverboughtOversoldStatus, { th: string; en: string }> = {
    'Strong Buy': { th: 'สัญญาณซื้อแรง', en: 'Strong Buy' },
    'Buy Signal': { th: 'สัญญาณซื้อ', en: 'Buy Signal' },
    'Strong Sell': { th: 'สัญญาณขายแรง', en: 'Strong Sell' },
    'Sell Signal': { th: 'สัญญาณขาย', en: 'Sell Signal' },
    Neutral: { th: 'เป็นกลาง', en: 'Neutral' },
  };
  const entry = labels[signal.status];
  return languageStore.isThai ? entry.th : entry.en;
});

const detectedPattern = computed(() => {
  return (
    stockData.value?.technicalIndicators?.detectedPattern ?? {
      name: null,
      detectedAt: null,
      coordinates: [],
    }
  );
});

const hasDetectedPattern = computed(
  () => Boolean(detectedPattern.value.name) && detectedPattern.value.coordinates.length >= 3,
);

const detectedPatternLabel = computed(() => {
  if (!hasDetectedPattern.value) {
    return languageStore.isThai ? 'ไม่พบรูปแบบกราฟที่ชัดเจน' : 'No clear pattern detected';
  }
  return detectedPattern.value.name ?? '';
});

const detectedPatternDateLabel = computed(() => {
  if (!detectedPattern.value.detectedAt) return '';
  try {
    return new Intl.DateTimeFormat(languageStore.isThai ? 'th-TH' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(detectedPattern.value.detectedAt));
  } catch {
    return detectedPattern.value.detectedAt;
  }
});

const INTRADAY_INTERVALS = new Set(['1h']);

const sortedHistory = computed<HistoricalDataPoint[]>(() => {
  if (!stockData.value?.historicalData?.length) return [];
  return [...stockData.value.historicalData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
});

/** แท่งราคาในรูปที่ lightweight-charts รับ (เรียงเวลาแล้ว ไม่มีเวลาซ้ำ) */
const chartBars = computed(() => toCandlestickData(sortedHistory.value));

/**
 * เส้นทับกราฟ: EMA 20/50/100 + รูปแบบที่ตรวจพบ
 *
 * ของเดิมบน ApexCharts ยัดทุกอย่างรวมเป็น series เดียวกันกับราคา ทำให้สลับ
 * candlestick/line ทีต้องคำนวณใหม่ทั้งชุด — ที่นี่แยกเป็น series ของตัวเอง
 * ไลบรารีจัดการให้เอง
 */
const chartOverlays = computed<OverlaySpec[]>(() => {
  const history = sortedHistory.value;

  if (!history.length) return [];

  const emas = stockData.value?.technicalIndicators?.emas;

  const overlays: OverlaySpec[] = [
    { id: 'ema20', title: 'EMA 20', color: '#3b82f6', points: toOverlayData(history, emas?.ema20) },
    { id: 'ema50', title: 'EMA 50', color: '#f97316', points: toOverlayData(history, emas?.ema50) },
    {
      id: 'ema100',
      title: 'EMA 100',
      color: '#a855f7',
      points: toOverlayData(history, emas?.ema100),
    },
  ].filter((overlay) => overlay.points.length > 0);

  const pattern = stockData.value?.technicalIndicators?.detectedPattern;
  const patternPoints = toPatternData(pattern?.coordinates);

  if (patternPoints.length >= 2) {
    overlays.push({
      id: 'pattern',
      title: pattern?.name || 'Pattern',
      color: '#eab308',
      points: patternPoints,
      lineWidth: 1,
    });
  }

  return overlays;
});

// AI Technical Analysis State
interface AITechnicalAnalysis {
  rsi: number;
  resistance1: number;
  resistance2: number;
  support1: number;
  support2: number;
  aiSummary: {
    th: string;
    en: string;
  };
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

const aiAnalysis = ref<AITechnicalAnalysis | null>(null);
const aiAnalysisLoading = ref(false);

/**
 * แนวรับ/แนวต้านเป็นเส้นแนวนอนคงที่ -> createPriceLine() ของ lightweight-charts
 * (ของเดิมเป็น yaxis annotation ของ ApexCharts)
 *
 * เส้นจาก /market/analysis/:symbol (AI S1/S2, AI R1/R2) ใช้สีจางกว่าเส้นที่คำนวณ
 * จากราคาตรง ๆ เพื่อให้แยกออกว่าอันไหนมาจากไหน
 */
const chartPriceLines = computed<PriceLineSpec[]>(() => {
  const lines: PriceLineSpec[] = [];

  const addLine = (price: number | null | undefined, color: string, title: string) => {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return;
    lines.push({ price: Number(price.toFixed(2)), color, title });
  };

  stockData.value?.technicalIndicators?.supportLevels.forEach((level, index) =>
    addLine(level, '#14b8a6', `S${index + 1}`),
  );
  stockData.value?.technicalIndicators?.resistanceLevels.forEach((level, index) =>
    addLine(level, '#f97316', `R${index + 1}`),
  );

  if (aiAnalysis.value) {
    addLine(aiAnalysis.value.support1, '#22d3ee', 'AI S1');
    addLine(aiAnalysis.value.support2, '#0ea5e9', 'AI S2');
    addLine(aiAnalysis.value.resistance1, '#fb7185', 'AI R1');
    addLine(aiAnalysis.value.resistance2, '#f43f5e', 'AI R2');
  }

  return lines;
});

const isIntradayInterval = computed(() => INTRADAY_INTERVALS.has(selectedInterval.value));

// Fetch AI Technical Analysis
const fetchAIAnalysis = async (symbol: string) => {
  aiAnalysisLoading.value = true;
  try {
    const response = await api.get(`/market/analysis/${symbol}`);
    if (isStaleSymbol(symbol)) return;
    aiAnalysis.value = response.data;
  } catch (err) {
    if (isStaleSymbol(symbol)) return;
    console.error('Failed to fetch AI analysis:', err);
    // Don't show error notification - AI analysis is optional
  } finally {
    if (!isStaleSymbol(symbol)) {
      aiAnalysisLoading.value = false;
    }
  }
};

const formatNewsDate = (value: string | Date) => {
  return new Date(value).toLocaleDateString(languageStore.isThai ? 'th-TH' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Analyst recommendations (GET /stocks/analyst/:symbol — real yahoo-finance2 data, not AI-generated)
interface AnalystRecommendation {
  symbol: string;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  updatedAt: string | null;
}

const analystData = ref<AnalystRecommendation | null>(null);
const analystLoading = ref(false);

const fetchAnalystRecommendations = async (symbol: string) => {
  analystLoading.value = true;
  analystData.value = null;
  try {
    const response = await api.get<AnalystRecommendation>(`/stocks/analyst/${symbol}`);
    if (isStaleSymbol(symbol)) return;
    analystData.value = response.data;
  } catch (err) {
    if (isStaleSymbol(symbol)) return;
    console.error('Failed to fetch analyst recommendations:', err);
    analystData.value = null;
    // Empty state handles both "no data" and fetch failure — no fake data, no error toast.
  } finally {
    if (!isStaleSymbol(symbol)) {
      analystLoading.value = false;
    }
  }
};

const hasAnalystData = computed(
  () =>
    analystData.value !== null &&
    (analystData.value.recommendationKey !== null || analystData.value.targetMeanPrice !== null),
);

const RECOMMENDATION_LABELS: Record<
  string,
  { th: string; en: string; tone: 'positive' | 'negative' | 'neutral' }
> = {
  strong_buy: { th: 'ซื้อแรง', en: 'Strong Buy', tone: 'positive' },
  buy: { th: 'ซื้อ', en: 'Buy', tone: 'positive' },
  hold: { th: 'ถือ', en: 'Hold', tone: 'neutral' },
  underperform: { th: 'ต่ำกว่าตลาด', en: 'Underperform', tone: 'negative' },
  sell: { th: 'ขาย', en: 'Sell', tone: 'negative' },
};

const recommendationLabel = computed(() => {
  const key = analystData.value?.recommendationKey?.toLowerCase() ?? '';
  const entry = RECOMMENDATION_LABELS[key];
  if (!entry)
    return { text: analystData.value?.recommendationKey ?? '—', tone: 'neutral' as const };
  return { text: languageStore.isThai ? entry.th : entry.en, tone: entry.tone };
});

// Popular Stocks (หุ้นยอดนิยม) table state
interface PopularStock {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  support1: number | null;
  support2: number | null;
  resistance1: number | null;
  resistance2: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

const popularStocks = ref<PopularStock[]>([]);
const popularLoading = ref(true);
const popularLogoErrors = ref(new Set<string>());

const fetchPopularStocks = async () => {
  popularLoading.value = true;
  try {
    const response = await api.get<PopularStock[]>('/stocks/popular');
    popularStocks.value = response.data;
  } catch (err) {
    console.error('Failed to fetch popular stocks:', err);
    popularStocks.value = [];
  } finally {
    popularLoading.value = false;
  }
};

/**
 * เดิมปุ่มนี้พาไปหน้า /StockExplorer แยกอีกหน้า ตอนนี้ตัวสำรวจหุ้นเป็นแถบซ้ายของหน้าเดียวกันแล้ว
 * จึงบอกหน้าแม่ให้กางแถบนั้นออกมาแทนการเปลี่ยนหน้า
 */
const goToAllStocks = () => {
  emit('browse-all');
};

const POPULAR_LOGO_DOMAINS: Record<string, string> = {
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  NVDA: 'nvidia.com',
  GOOGL: 'abc.xyz',
  AMZN: 'amazon.com',
  META: 'meta.com',
  TSLA: 'tesla.com',
  AMD: 'amd.com',
  NFLX: 'netflix.com',
  AVGO: 'broadcom.com',
};

const getPopularLogoUrl = (symbol: string): string => {
  const domain = POPULAR_LOGO_DOMAINS[symbol.toUpperCase()] ?? `${symbol.toLowerCase()}.com`;
  return `https://logo.clearbit.com/${domain}`;
};

const formatPopularPrice = (value: number | null): string =>
  value == null ? '—' : value.toFixed(2);

const formatPopularPercent = (value: number | null): string =>
  value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatPopularDividend = (value: number | null): string =>
  value == null ? '—' : `${value.toFixed(2)}%`;

const formatPopularMarketCap = (value: number | null): string => {
  if (value == null || value <= 0) return '—';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return value.toLocaleString('en-US');
};

const percentClass = (value: number | null): string => {
  if (value == null) return 'muted';
  return value >= 0 ? 'text-positive' : 'text-negative';
};

// Methods
/**
 * ลำดับของคำขอชุดวิเคราะห์ — คำขอที่ตอบช้ากว่ารอบใหม่ต้องถูกทิ้ง
 *
 * ของเดิมไม่มีตัวนี้ กดสลับหุ้น/timeframe เร็ว ๆ แล้วคำขอเก่าตอบทีหลังจะเขียนทับข้อมูล
 * ของรอบใหม่ ผลคือ URL เป็น NVDA แต่หน้าจอโชว์ MSFT (ยืนยันด้วยเทสแล้ว)
 */
let analysisSeq = 0;

const fetchStockData = async (symbol: string, interval: string, range: string) => {
  // Hard guard against routing bleed
  const invalidSymbols = [
    'Dashboard',
    'Assets',
    'Record',
    'Portfolio',
    'Analytics',
    'News',
    'Classroom',
  ];
  if (!symbol || invalidSymbols.includes(symbol)) return;

  const seq = ++analysisSeq;
  const isInitialLoad = !stockData.value;

  if (isInitialLoad) {
    loading.value = true;
    error.value = '';
  } else {
    refreshing.value = true;
    refreshError.value = '';
  }

  try {
    const response = await api.get(`/stocks/analysis/${symbol}`, {
      params: { interval, range },
    });

    // มีรอบใหม่แซงไปแล้ว -> ผลนี้เก่า ห้ามเขียนทับ
    if (seq !== analysisSeq) return;

    stockData.value = response.data;
    // Also fetch intrinsic value, seasonality data, AI analysis, and analyst recommendations
    await Promise.all([
      fetchIntrinsicValue(symbol),
      fetchSeasonalityData(symbol),
      fetchAIAnalysis(symbol),
      fetchAnalystRecommendations(symbol),
    ]);
  } catch (err) {
    if (seq !== analysisSeq) return;

    console.error('Error fetching stock data:', err);

    const message = languageStore.isThai
      ? 'โหลดข้อมูลหุ้นไม่สำเร็จ'
      : 'Failed to fetch stock data';

    // ยังไม่เคยมีข้อมูล -> แทนที่ทั้งหน้าด้วยกล่อง error เดิม
    // มีข้อมูลเก่าค้างอยู่ -> คงกราฟไว้แล้วขึ้นแถบเตือนแทน จะได้ไม่กลายเป็นจอเปล่าเงียบ ๆ
    if (isInitialLoad) {
      error.value = message;
    } else {
      refreshError.value = message;
    }

    $q.notify({ type: 'negative', message, position: 'top' });
  } finally {
    if (seq === analysisSeq) {
      loading.value = false;
      refreshing.value = false;
    }
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatMarketCap = (marketCap: number) => {
  if (marketCap >= 1000000000000) return `$${(marketCap / 1000000000000).toFixed(1)}T`;
  if (marketCap >= 1000000000) return `$${(marketCap / 1000000000).toFixed(1)}B`;
  if (marketCap >= 1000000) return `$${(marketCap / 1000000).toFixed(1)}M`;
  return `$${(marketCap / 1000).toFixed(1)}K`;
};

const formatVolume = (volume: number) => {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toLocaleString('en-US');
};

// Latest session volume — sourced from the most recent historical bar (no
// dedicated backend field for this; historicalData already carries it).
const latestVolume = computed<number | null>(() => {
  const history = sortedHistory.value;
  if (!history.length) return null;
  return history[history.length - 1]?.volume ?? null;
});

const onTimeframeChange = (timeframe: string) => {
  const tf = timeframes.find((t) => t.value === timeframe);
  if (tf) {
    selectedTimeframe.value = tf.value;
    selectedInterval.value = tf.interval;
    selectedRange.value = tf.range;
    if (selectedSymbol.value) {
      void fetchStockData(selectedSymbol.value, tf.interval, tf.range);
    }
  }
};

// Watchers
watch(
  () => route.params.symbol,
  (newSymbol) => {
    // When navigating AWAY from this page the param becomes undefined while the
    // component is still mounted. Only react on the very first (immediate) run; never
    // fall back to fetching 'AAPL' on teardown, which fired spurious requests.
    const rawSymbol = newSymbol as string | undefined;
    const symbolToFetch = rawSymbol || selectedSymbol.value || 'AAPL';
    const invalidSymbols = [
      'Dashboard',
      'Assets',
      'Record',
      'Portfolio',
      'Analytics',
      'News',
      'Classroom',
    ];

    if (rawSymbol && !invalidSymbols.includes(rawSymbol) && rawSymbol !== selectedSymbol.value) {
      selectedSymbol.value = rawSymbol;
      void fetchStockData(rawSymbol, selectedInterval.value, selectedRange.value);
    } else if (!stockData.value && !invalidSymbols.includes(symbolToFetch)) {
      // Initial load fallback (only when no data has been loaded yet)
      void fetchStockData(symbolToFetch, selectedInterval.value, selectedRange.value);
    }
  },
  { immediate: true },
);

const priceChartRef = ref<InstanceType<typeof PriceChart> | null>(null);

/** วันที่เคยสั่งโหลดประวัติใหม่เพราะข้ามวันเทรดไปแล้ว — กันไม่ให้วนโหลดทุกรอบ poll */
let rolloverRefetchedDay: number | null = null;

watch(
  () => stockData.value,
  () => {
    rolloverRefetchedDay = null;
  },
);

// ราคาสดเข้ามาแล้วอัปเดตเฉพาะแท่งล่าสุด ไม่ setData ใหม่ทั้งชุด
// (setData จะรีเซ็ตตำแหน่งที่ผู้ใช้เลื่อน/ซูมกราฟค้างไว้)
watch(liveQuote, (quote) => {
  if (!quote) return;

  const bars = chartBars.value;
  const lastBar = bars[bars.length - 1];

  if (!lastBar) return;

  if (isNewerTradingDay(quote.asOf, lastBar.time)) {
    // ประวัติที่ถืออยู่ยังไม่มีแท่งของวันนี้ — ต้องโหลดใหม่ ห้ามเอาราคาวันนี้ไปทับ
    // แท่งของเมื่อวาน (จะได้แท่งที่ high/low ผิดความจริง) และโหลดแค่ครั้งเดียวต่อวัน
    // เผื่อกรณีตลาดหยุดจริง ๆ แล้วประวัติไม่มีแท่งใหม่ให้โหลดสักที
    const quoteDay = toTradingDay(quote.asOf);

    if (quoteDay !== null && quoteDay !== rolloverRefetchedDay) {
      rolloverRefetchedDay = quoteDay;
      void fetchStockData(selectedSymbol.value, selectedInterval.value, selectedRange.value);
    }

    return;
  }

  const merged = mergeLivePrice(lastBar, quote.price);

  if (merged) {
    priceChartRef.value?.applyLiveBar(merged);
  }
});

onMounted(() => {
  void loadStockCatalog();
  void fetchPopularStocks();
});
</script>

<template>
  <div class="stock-analysis-page" :class="{ 'dark-theme': $q.dark.isActive }">
    <div class="analysis-wrapper terminal-shell">
      <header class="terminal-bar premium-card">
        <div class="terminal-identity">
          <p class="eyebrow">
            {{
              languageStore.isThai
                ? 'เทอร์มินัลวิเคราะห์หุ้น (Equity Terminal)'
                : 'Equity Intelligence Terminal'
            }}
          </p>
          <div class="title-row">
            <span class="symbol mono-num">{{ stockData?.profile?.symbol || selectedSymbol }}</span>
            <span class="name">{{ stockData?.profile?.name || '-' }}</span>
          </div>
          <p class="subline">
            {{
              stockData?.profile?.industry ||
              stockData?.profile?.sector ||
              (languageStore.isThai ? '—' : '—')
            }}
          </p>
        </div>

        <div class="terminal-search-wrap">
          <!-- ตัวค้นหานี้ถูกถอดออกไปเป็น StockSymbolPicker เพื่อให้ฟอร์ม DCA และ
               หน้าบันทึกซื้อหุ้นใช้ตัวเดียวกัน (เดิมสองที่นั้นเป็นช่องพิมพ์เปล่า) -->
          <StockSymbolPicker
            v-model="searchQuery"
            clearable
            :dark="$q.dark.isActive"
            class="terminal-search-input"
            :placeholder="
              languageStore.isThai
                ? 'ค้นหา ticker หรือชื่อบริษัท...'
                : 'Search ticker or company...'
            "
            @select="(item) => selectSearchResult(item.symbol)"
          >
            <template #append>
              <q-btn flat dense round icon="tune" size="sm" @click="openSearchDialog = true">
                <q-tooltip>{{
                  languageStore.isThai ? 'ตัวกรองขั้นสูง' : 'Advanced filters'
                }}</q-tooltip>
              </q-btn>
            </template>
          </StockSymbolPicker>
        </div>

        <div v-if="stockData" class="terminal-price">
          <div class="chip-price mono-num">{{ formatCurrency(currentPrice) }}</div>
          <div class="chip-delta mono-num" :class="priceChangeColor">
            <q-icon :name="priceChange >= 0 ? 'arrow_upward' : 'arrow_downward'" size="14px" />
            <span>{{ priceChange >= 0 ? '+' : '' }}{{ priceChange.toFixed(2) }}%</span>
          </div>

          <!-- ให้เห็นชัดว่าตัวเลขนี้อัปเดตเมื่อไหร่ และตอนนี้ยัง refresh อยู่หรือหยุดไปแล้ว -->
          <button
            v-if="liveQuote"
            type="button"
            class="live-badge"
            :class="{ 'live-badge--paused': livePaused }"
            data-test="live-price-badge"
            @click="() => void refreshLivePrice()"
          >
            <span class="live-dot" />
            <span class="live-text mono-num">{{ liveUpdatedLabel }}</span>
            <q-tooltip max-width="260px">
              {{
                livePaused
                  ? languageStore.isThai
                    ? 'หยุดอัปเดตชั่วคราวเพราะสลับไปแท็บอื่น — กลับมาแล้วจะดึงใหม่ทันที'
                    : 'Paused while this browser tab is hidden — resumes on return.'
                  : languageStore.isThai
                    ? 'อัปเดตราคาทุก 15 วินาที (ไม่ใช่ real-time streaming — Yahoo Finance แบบฟรีไม่มี websocket) กดเพื่อดึงเดี๋ยวนี้'
                    : 'Refreshes every 15s (not true streaming — free Yahoo Finance has no websocket). Click to refresh now.'
              }}
            </q-tooltip>
          </button>
        </div>
      </header>

      <q-dialog v-model="openSearchDialog" :dark="$q.dark.isActive">
        <q-card class="advanced-search-card">
          <q-card-section>
            <div class="row items-center q-mb-md">
              <q-icon name="search" size="24px" class="q-mr-sm" color="primary" />
              <div class="text-h6 text-weight-bold">
                {{ languageStore.isThai ? 'ค้นหาหุ้น' : 'Stock Search' }}
              </div>
            </div>
            <q-input
              v-model="searchQuery"
              :placeholder="
                languageStore.isThai
                  ? 'พิมพ์ตัวอักษรแรกของ ticker...'
                  : 'Type first letter of ticker...'
              "
              outlined
              dense
              clearable
              autofocus
              class="q-mb-md"
              @update:model-value="onSearchQueryUpdate"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
            <div
              v-if="filteredSearchResults.length"
              class="search-dropdown search-dropdown--modal q-mb-md"
            >
              <div
                v-for="item in filteredSearchResults"
                :key="`modal-${item.symbol}`"
                class="search-result-row"
                @click="selectSearchResult(item.symbol)"
              >
                <span class="result-symbol mono-num">{{ item.symbol }}</span>
                <span class="result-name">{{ item.name }}</span>
              </div>
            </div>
            <div class="q-mb-sm text-caption text-grey-7">
              {{ languageStore.isThai ? 'หมวดหมู่' : 'Categories' }}
            </div>
            <div class="category-chip-row">
              <q-chip
                v-for="cat in categoryOptions"
                :key="cat.value"
                :color="selectedCategory === cat.value ? 'primary' : 'grey-2'"
                :text-color="selectedCategory === cat.value ? 'white' : 'grey-8'"
                :outline="selectedCategory !== cat.value"
                clickable
                @click="selectedCategory = selectedCategory === cat.value ? null : cat.value"
                class="category-chip"
              >
                <q-icon :name="cat.icon" size="16px" class="q-mr-xs" />
                {{ cat.label }}
              </q-chip>
            </div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat :label="languageStore.isThai ? 'ปิด' : 'Close'" v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <div v-if="loading" class="terminal-skeleton">
        <div class="skeleton-bar premium-card">
          <q-skeleton type="text" width="30%" />
          <q-skeleton type="text" width="50%" class="q-mt-sm" />
        </div>
        <div class="metric-strip">
          <div v-for="n in 7" :key="`sk-m-${n}`" class="metric-cell premium-card">
            <q-skeleton type="text" width="40%" />
            <q-skeleton type="text" width="70%" class="q-mt-sm" height="28px" />
          </div>
        </div>
        <div class="chart-stage premium-card">
          <q-skeleton type="rect" height="56px" class="q-mb-md" />
          <q-skeleton type="rect" class="chart-skeleton" />
        </div>
      </div>

      <div v-else-if="error" class="error-container premium-card">
        <q-icon name="error_outline" size="48px" color="negative" />
        <h3 class="q-mt-md text-h6 text-weight-bold">
          {{ languageStore.isThai ? 'เกิดข้อผิดพลาด' : 'Error Loading Data' }}
        </h3>
        <p class="text-grey">{{ error }}</p>
        <q-btn
          color="primary"
          outline
          class="q-mt-sm rounded-borders text-weight-bold"
          :label="languageStore.isThai ? 'ลองใหม่' : 'Retry'"
          @click="() => fetchStockData(selectedSymbol, selectedInterval, selectedRange)"
        />
      </div>

      <div v-else-if="stockData" class="terminal-main">
        <div class="metric-strip">
          <div class="metric-cell premium-card hover-lift">
            <span class="metric-label">
              P/E
              <q-icon name="info_outline" size="14px" class="q-ml-xs text-grey-5">
                <q-tooltip max-width="220px">
                  {{
                    languageStore.isThai
                      ? 'อัตราส่วนราคาต่อกำไร ยิ่งต่ำอาจยิ่งถูก เทียบราคาหุ้นกับกำไรต่อหุ้น'
                      : 'Price-to-Earnings. Compares share price to earnings per share. Lower can mean cheaper.'
                  }}
                </q-tooltip>
              </q-icon>
            </span>
            <span class="metric-value mono-num">{{
              stockData.financials[0]?.peRatio?.toFixed(2) ?? '—'
            }}</span>
          </div>
          <div class="metric-cell premium-card hover-lift">
            <span class="metric-label">
              EPS
              <q-icon name="info_outline" size="14px" class="q-ml-xs text-grey-5">
                <q-tooltip max-width="220px">
                  {{
                    languageStore.isThai
                      ? 'กำไรต่อหุ้น แสดงกำไรของบริษัทที่จัดสรรให้แต่ละหุ้น ยิ่งสูงยิ่งดี'
                      : 'Earnings Per Share. Company profit allocated to each share. Higher is generally better.'
                  }}
                </q-tooltip>
              </q-icon>
            </span>
            <span class="metric-value mono-num">{{
              stockData.financials[0]?.eps?.toFixed(2) ?? '—'
            }}</span>
          </div>
          <div class="metric-cell premium-card hover-lift">
            <span class="metric-label">{{ languageStore.isThai ? 'มูลค่าตลาด' : 'Mkt Cap' }}</span>
            <span class="metric-value mono-num">{{
              formatMarketCap(stockData.profile.marketCap)
            }}</span>
          </div>
          <div
            class="metric-cell premium-card hover-lift"
            :class="
              intrinsicValue?.status === 'Undervalued'
                ? 'bullish'
                : intrinsicValue?.status === 'Overvalued'
                  ? 'bearish'
                  : ''
            "
          >
            <span class="metric-label">{{
              languageStore.isThai ? 'มูลค่าพื้นฐาน' : 'Intrinsic'
            }}</span>
            <template v-if="intrinsicValueLoading">
              <q-skeleton type="text" width="80%" height="24px" />
            </template>
            <span v-else-if="intrinsicValue" class="metric-value mono-num">{{
              formatCurrency(intrinsicValue.intrinsicValue)
            }}</span>
            <span v-else class="metric-value muted">—</span>
          </div>
          <div
            class="metric-cell premium-card hover-lift"
            :class="
              intrinsicValue && intrinsicValue.discountPremium > 0
                ? 'bullish'
                : intrinsicValue && intrinsicValue.discountPremium < 0
                  ? 'bearish'
                  : ''
            "
          >
            <span class="metric-label">{{ languageStore.isThai ? 'ส่วนต่าง' : 'Prem/Disc' }}</span>
            <template v-if="intrinsicValueLoading">
              <q-skeleton type="text" width="60%" height="24px" />
            </template>
            <span v-else-if="intrinsicValue" class="metric-value mono-num">
              {{ intrinsicValue.discountPremium > 0 ? '+' : ''
              }}{{ intrinsicValue.discountPremium.toFixed(1) }}%
            </span>
            <span v-else class="metric-value muted">—</span>
          </div>
          <div class="metric-cell premium-card hover-lift">
            <span class="metric-label">
              {{ languageStore.isThai ? 'ปันผล' : 'Dividend Yield' }}
              <q-icon name="info_outline" size="14px" class="q-ml-xs text-grey-5">
                <q-tooltip max-width="220px">
                  {{
                    languageStore.isThai
                      ? 'อัตราผลตอบแทนเงินปันผลต่อปี เทียบกับราคาหุ้นปัจจุบัน'
                      : 'Trailing annual dividend yield relative to the current share price.'
                  }}
                </q-tooltip>
              </q-icon>
            </span>
            <span v-if="stockData.profile.dividendYield != null" class="metric-value mono-num"
              >{{ stockData.profile.dividendYield.toFixed(2) }}%</span
            >
            <span v-else class="metric-value muted">—</span>
          </div>
          <div class="metric-cell premium-card hover-lift">
            <span class="metric-label">{{
              languageStore.isThai ? 'ปริมาณซื้อขาย' : 'Volume'
            }}</span>
            <span v-if="latestVolume != null" class="metric-value mono-num">{{
              formatVolume(latestVolume)
            }}</span>
            <span v-else class="metric-value muted">—</span>
          </div>
        </div>

        <div class="terminal-workspace">
          <div class="chart-stage premium-card">
            <!-- โหลดทับของเดิม: ไม่ถอดกราฟทิ้ง แค่บอกให้เห็นว่ากำลังโหลดอยู่
                 (ของเดิมสลับไปโครงร่างทั้งก้อน ทำให้กราฟถูกสร้างใหม่ทุกครั้ง) -->
            <q-linear-progress
              v-if="refreshing"
              indeterminate
              color="primary"
              size="2px"
              class="refresh-progress"
              data-test="analysis-refreshing"
            />

            <div v-if="refreshError" class="refresh-error-banner" data-test="analysis-refresh-error">
              <q-icon name="warning" size="18px" />
              <span class="refresh-error-banner__text">{{ refreshError }}</span>
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                color="primary"
                :label="languageStore.isThai ? 'ลองใหม่' : 'Retry'"
                data-test="analysis-refresh-retry"
                @click="() => fetchStockData(selectedSymbol, selectedInterval, selectedRange)"
              />
            </div>

            <q-tabs
              v-model="activeTab"
              class="analysis-tabs text-grey"
              active-color="primary"
              indicator-color="primary"
              align="left"
              narrow-indicator
              dense
              :dark="$q.dark.isActive"
            >
              <q-tab name="graph" :label="languageStore.isThai ? 'กราฟ' : 'Graph'" />
              <q-tab name="summary" :label="languageStore.isThai ? 'สรุปบริษัท' : 'Summary'" />
              <q-tab
                name="financials"
                :label="languageStore.isThai ? 'ข้อมูลการเงิน' : 'Financials'"
              />
              <q-tab
                name="seasonality"
                :label="languageStore.isThai ? 'สถิติย้อนหลัง' : 'Seasonality'"
              />
              <!-- ภาพรวมตลาดย้ายมาจากหน้า /StockExplorer เดิมตอนยุบสองหน้าเข้าด้วยกัน
                   ต้องอยู่เต็มความกว้าง จึงเป็นแท็บ ไม่ใช่ยัดลงแถบซ้ายที่แคบ -->
              <q-tab name="market" :label="languageStore.isThai ? 'ภาพรวมตลาด' : 'Market'" />
            </q-tabs>

            <q-tab-panels v-model="activeTab" animated class="bg-transparent">
              <q-tab-panel name="graph" class="q-pa-none">
                <div class="chart-container chart-hero">
                  <div class="timeframe-selector">
                    <q-btn-group rounded outline class="timeframe-group">
                      <q-btn
                        v-for="tf in timeframes"
                        :key="tf.value"
                        :label="tf.label"
                        :color="selectedTimeframe === tf.value ? 'primary' : 'grey'"
                        :outline="selectedTimeframe !== tf.value"
                        size="sm"
                        class="timeframe-btn text-weight-bold"
                        @click="onTimeframeChange(tf.value)"
                      />
                    </q-btn-group>

                    <q-btn-group rounded outline class="chart-type-group">
                      <q-btn
                        icon="candlestick_chart"
                        :color="chartDisplayType === 'candlestick' ? 'primary' : 'grey'"
                        :outline="chartDisplayType !== 'candlestick'"
                        size="sm"
                        class="chart-type-btn text-weight-bold"
                        @click="chartDisplayType = 'candlestick'"
                      >
                        <q-tooltip>{{
                          languageStore.isThai ? 'กราฟแท่งเทียน' : 'Candlestick chart'
                        }}</q-tooltip>
                      </q-btn>
                      <q-btn
                        icon="show_chart"
                        :color="chartDisplayType === 'line' ? 'primary' : 'grey'"
                        :outline="chartDisplayType !== 'line'"
                        size="sm"
                        class="chart-type-btn text-weight-bold"
                        @click="chartDisplayType = 'line'"
                      >
                        <q-tooltip>{{
                          languageStore.isThai ? 'กราฟเส้น' : 'Line chart'
                        }}</q-tooltip>
                      </q-btn>
                    </q-btn-group>
                  </div>

                  <div class="chart-indicators-row">
                    <div class="rsi-display">
                      <div class="rsi-label text-weight-bold">
                        <q-icon name="show_chart" size="18px" class="q-mr-xs" />
                        {{ languageStore.isThai ? 'ราคาปิด | RSI:' : 'RSI (14):' }}
                      </div>
                      <div
                        class="rsi-value"
                        :class="{
                          overbought: stockData.technicalIndicators.rsi > 70,
                          oversold: stockData.technicalIndicators.rsi < 30,
                          neutral:
                            stockData.technicalIndicators.rsi >= 30 &&
                            stockData.technicalIndicators.rsi <= 70,
                        }"
                      >
                        {{ stockData.technicalIndicators.rsi.toFixed(2) }}
                      </div>
                    </div>

                    <div
                      v-if="overboughtSignal && overboughtSignal.status !== 'Neutral'"
                      class="screener-signal-badge"
                      :class="{
                        'screener-signal-badge--buy':
                          overboughtSignal.status === 'Strong Buy' ||
                          overboughtSignal.status === 'Buy Signal',
                        'screener-signal-badge--sell':
                          overboughtSignal.status === 'Strong Sell' ||
                          overboughtSignal.status === 'Sell Signal',
                        'screener-signal-badge--strong': overboughtSignal.isStrongReversal,
                      }"
                    >
                      <q-icon :name="signalIcon" size="18px" class="q-mr-xs" />
                      <div class="screener-signal-badge__text">
                        <span class="screener-signal-badge__label text-weight-bold">
                          {{ languageStore.isThai ? 'สัญญาณคัดกรอง:' : 'Screener Signal:' }}
                        </span>
                        <span class="screener-signal-badge__value">{{ signalLabel }}</span>
                      </div>
                      <q-tooltip class="screener-signal-tooltip" max-width="260px">
                        <div class="text-weight-bold q-mb-xs">{{ overboughtSignal.status }}</div>
                        <div>RSI: {{ overboughtSignal.rsi.toFixed(2) }}</div>
                        <div>Stochastic %K: {{ overboughtSignal.stochasticK.toFixed(2) }}</div>
                        <div>Stochastic %D: {{ overboughtSignal.stochasticD.toFixed(2) }}</div>
                        <div class="q-mt-xs">{{ overboughtSignal.description }}</div>
                      </q-tooltip>
                    </div>

                    <div
                      class="pattern-badge"
                      :class="{ 'pattern-badge--active': hasDetectedPattern }"
                    >
                      <q-icon name="auto_graph" size="18px" class="q-mr-xs" />
                      <div class="pattern-badge__text">
                        <span class="pattern-badge__label text-weight-bold">
                          {{ languageStore.isThai ? 'รูปแบบที่ตรวจพบ:' : 'Detected Pattern:' }}
                        </span>
                        <span class="pattern-badge__value">{{ detectedPatternLabel }}</span>
                        <span
                          v-if="hasDetectedPattern && detectedPatternDateLabel"
                          class="pattern-badge__date"
                        >
                          {{ languageStore.isThai ? 'เมื่อ' : 'on' }} {{ detectedPatternDateLabel }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="chart-canvas-wrap">
                    <PriceChart
                      v-if="chartBars.length"
                      ref="priceChartRef"
                      class="tw-chart-container chart-hero-canvas"
                      :bars="chartBars"
                      :display-type="chartDisplayType"
                      :price-lines="chartPriceLines"
                      :overlays="chartOverlays"
                      :intraday="isIntradayInterval"
                      :height="620"
                    />
                    <div v-else class="chart-empty-state" data-test="price-chart-empty">
                      {{
                        languageStore.isThai
                          ? 'ไม่มีข้อมูลราคาสำหรับช่วงเวลานี้'
                          : 'No price data for this timeframe'
                      }}
                    </div>

                    <!-- เปลี่ยน timeframe แล้วต้องเห็นว่ากำลังโหลด ไม่ใช่กราฟค้างเงียบ ๆ -->
                    <div
                      v-if="refreshing"
                      class="chart-loading-overlay"
                      data-test="chart-loading-overlay"
                    >
                      <q-spinner-dots size="36px" color="primary" />
                      <span class="chart-loading-overlay__text">
                        {{ languageStore.isThai ? 'กำลังโหลดกราฟ...' : 'Loading chart...' }}
                      </span>
                    </div>
                  </div>

                  <!-- Popular Stocks (หุ้นยอดนิยม) -->
                  <div class="popular-stocks-section q-mt-md">
                    <q-card class="popular-card" flat bordered>
                      <q-card-section class="popular-header">
                        <div class="row items-center">
                          <q-icon
                            name="local_fire_department"
                            size="22px"
                            class="popular-header-icon q-mr-sm"
                          />
                          <div class="text-h6 text-weight-bold">
                            {{ languageStore.isThai ? 'หุ้นยอดนิยม' : 'Popular Stocks' }}
                          </div>
                        </div>
                      </q-card-section>

                      <q-separator />

                      <q-card-section v-if="popularLoading" class="popular-state">
                        <q-spinner-dots size="40px" color="primary" />
                        <span class="q-mt-sm text-grey-6">
                          {{
                            languageStore.isThai
                              ? 'กำลังโหลดข้อมูลหุ้นยอดนิยม...'
                              : 'Loading popular stocks...'
                          }}
                        </span>
                      </q-card-section>

                      <q-card-section v-else-if="!popularStocks.length" class="popular-state">
                        <q-icon name="cloud_off" size="36px" color="grey-6" />
                        <span class="q-mt-sm text-grey-6">
                          {{
                            languageStore.isThai
                              ? 'ไม่สามารถโหลดข้อมูลหุ้นได้ในขณะนี้'
                              : 'Could not load stock data right now'
                          }}
                        </span>
                      </q-card-section>

                      <template v-else>
                        <div class="popular-table-wrapper">
                          <table class="popular-table">
                            <thead>
                              <tr>
                                <th class="text-left">
                                  {{ languageStore.isThai ? 'หุ้น' : 'Stock' }}
                                </th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'ราคา' : 'Price' }}
                                </th>
                                <th class="text-right">Percent</th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'แนวรับ 1' : 'Support 1' }}
                                </th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'แนวรับ 2' : 'Support 2' }}
                                </th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'ต้าน 1' : 'Resistance 1' }}
                                </th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'ต้าน 2' : 'Resistance 2' }}
                                </th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'ปันผล' : 'Dividend' }}
                                </th>
                                <th class="text-right">
                                  {{ languageStore.isThai ? 'มูลค่าบริษัท' : 'Market Cap' }}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="stock in popularStocks"
                                :key="stock.symbol"
                                class="popular-row"
                                @click="selectSearchResult(stock.symbol)"
                              >
                                <td>
                                  <div class="stock-cell">
                                    <img
                                      v-if="!popularLogoErrors.has(stock.symbol)"
                                      :src="getPopularLogoUrl(stock.symbol)"
                                      :alt="stock.symbol"
                                      class="stock-logo"
                                      loading="lazy"
                                      @error="popularLogoErrors.add(stock.symbol)"
                                    />
                                    <!-- โลโก้ Clearbit โดน ad blocker บล็อกบ่อย -> ใช้ป้ายตัวย่อ
                                         ชุดเดียวกับ Watchlist/AI Radar แทนช่องว่าง -->
                                    <div
                                      v-else
                                      class="stock-logo stock-logo--fallback"
                                      :style="{ background: symbolAvatarColor(stock.symbol) }"
                                      data-test="popular-logo-fallback"
                                    >
                                      {{ symbolAvatarInitials(stock.symbol) }}
                                    </div>
                                    <div class="stock-cell-text">
                                      <span class="stock-cell-symbol mono-num">{{
                                        stock.symbol
                                      }}</span>
                                      <span class="stock-cell-name">{{ stock.name }}</span>
                                    </div>
                                  </div>
                                </td>
                                <td class="text-right">
                                  <div class="cell-main mono-num">
                                    {{ formatPopularPrice(stock.price) }}
                                  </div>
                                  <div class="cell-sub">
                                    {{ languageStore.isThai ? 'ก่อนตลาดเปิด' : 'Pre-market' }}
                                    <span class="mono-num">{{
                                      formatPopularPrice(stock.preMarketPrice)
                                    }}</span>
                                  </div>
                                </td>
                                <td class="text-right">
                                  <div
                                    class="cell-main mono-num"
                                    :class="percentClass(stock.changePercent)"
                                  >
                                    {{ formatPopularPercent(stock.changePercent) }}
                                  </div>
                                  <div
                                    class="cell-sub mono-num"
                                    :class="percentClass(stock.preMarketChangePercent)"
                                  >
                                    {{ formatPopularPercent(stock.preMarketChangePercent) }}
                                  </div>
                                </td>
                                <td class="text-right level-cell mono-num">
                                  {{ formatPopularPrice(stock.support1) }}
                                </td>
                                <td class="text-right level-cell mono-num">
                                  {{ formatPopularPrice(stock.support2) }}
                                </td>
                                <td class="text-right level-cell mono-num">
                                  {{ formatPopularPrice(stock.resistance1) }}
                                </td>
                                <td class="text-right level-cell mono-num">
                                  {{ formatPopularPrice(stock.resistance2) }}
                                </td>
                                <td class="text-right mono-num">
                                  {{ formatPopularDividend(stock.dividendYield) }}
                                </td>
                                <td class="text-right mono-num">
                                  {{ formatPopularMarketCap(stock.marketCap) }}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div class="popular-footer">
                          <q-btn
                            flat
                            no-caps
                            color="primary"
                            class="view-all-btn text-weight-bold"
                            @click="goToAllStocks"
                          >
                            {{ languageStore.isThai ? 'ดูทั้งหมด' : 'View All' }}
                            <q-icon name="arrow_forward" size="16px" class="q-ml-xs" />
                          </q-btn>
                        </div>
                      </template>
                    </q-card>
                  </div>

                  <!-- Analyst Recommendations -->
                  <div class="side-cards-grid q-mt-md">
                    <q-card class="premium-card side-card" flat bordered>
                      <q-card-section class="side-card-header">
                        <div class="row items-center">
                          <q-icon name="groups" size="22px" class="side-card-header-icon q-mr-sm" />
                          <div class="text-h6 text-weight-bold">
                            {{
                              languageStore.isThai
                                ? 'บทวิเคราะห์นักวิเคราะห์'
                                : 'Analyst Recommendations'
                            }}
                          </div>
                        </div>
                      </q-card-section>

                      <q-separator />

                      <q-card-section v-if="analystLoading" class="side-card-state">
                        <q-spinner-dots size="40px" color="primary" />
                      </q-card-section>

                      <q-card-section v-else-if="!hasAnalystData" class="side-card-state">
                        <q-icon name="assignment_late" size="36px" color="grey-6" />
                        <span class="q-mt-sm text-grey-6">
                          {{
                            languageStore.isThai
                              ? 'ยังไม่มีบทวิเคราะห์สำหรับหุ้นนี้'
                              : 'No analyst coverage available for this stock'
                          }}
                        </span>
                      </q-card-section>

                      <q-card-section v-else class="analyst-body">
                        <div
                          class="analyst-recommendation"
                          :class="`is-${recommendationLabel.tone}`"
                        >
                          {{ recommendationLabel.text }}
                        </div>
                        <div v-if="analystData?.numberOfAnalysts" class="analyst-sub">
                          {{ languageStore.isThai ? 'จากนักวิเคราะห์' : 'Based on' }}
                          {{ analystData.numberOfAnalysts }}
                          {{ languageStore.isThai ? 'ท่าน' : 'analysts' }}
                        </div>

                        <div class="analyst-target-grid">
                          <div class="analyst-target-box">
                            <div class="analyst-target-label">
                              {{ languageStore.isThai ? 'เป้าหมายต่ำ' : 'Low' }}
                            </div>
                            <div class="analyst-target-value mono-num">
                              {{
                                analystData?.targetLowPrice != null
                                  ? formatCurrency(analystData.targetLowPrice)
                                  : '—'
                              }}
                            </div>
                          </div>
                          <div class="analyst-target-box analyst-target-box--mean">
                            <div class="analyst-target-label">
                              {{ languageStore.isThai ? 'เป้าหมายเฉลี่ย' : 'Mean' }}
                            </div>
                            <div class="analyst-target-value mono-num">
                              {{
                                analystData?.targetMeanPrice != null
                                  ? formatCurrency(analystData.targetMeanPrice)
                                  : '—'
                              }}
                            </div>
                          </div>
                          <div class="analyst-target-box">
                            <div class="analyst-target-label">
                              {{ languageStore.isThai ? 'เป้าหมายสูง' : 'High' }}
                            </div>
                            <div class="analyst-target-value mono-num">
                              {{
                                analystData?.targetHighPrice != null
                                  ? formatCurrency(analystData.targetHighPrice)
                                  : '—'
                              }}
                            </div>
                          </div>
                        </div>

                        <div v-if="analystData?.updatedAt" class="analyst-updated">
                          {{ languageStore.isThai ? 'อัปเดตล่าสุด' : 'Last updated' }}:
                          {{ formatNewsDate(analystData.updatedAt) }}
                        </div>
                      </q-card-section>
                    </q-card>
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name="summary" class="q-pa-none">
                <div class="summary-container q-pa-lg">
                  <div class="info-list">
                    <div class="info-row">
                      <span class="info-label">{{
                        languageStore.isThai ? 'ชื่ออุตสาหกรรม' : 'Industry'
                      }}</span>
                      <span class="info-value text-weight-bold">{{
                        stockData.profile.industry
                      }}</span>
                    </div>
                    <q-separator :dark="$q.dark.isActive" />

                    <div class="info-row">
                      <span class="info-label">{{ languageStore.isThai ? 'ซีอีโอ' : 'CEO' }}</span>
                      <span class="info-value text-weight-bold">{{ stockData.profile.ceo }}</span>
                    </div>
                    <q-separator :dark="$q.dark.isActive" />

                    <div class="info-row">
                      <span class="info-label">{{
                        languageStore.isThai ? 'สำนักงานใหญ่' : 'Headquarters'
                      }}</span>
                      <span class="info-value text-weight-bold">{{
                        stockData.profile.headquarters
                      }}</span>
                    </div>
                    <q-separator :dark="$q.dark.isActive" />

                    <div class="info-row">
                      <span class="info-label">{{
                        languageStore.isThai ? 'เว็บไซต์' : 'Website'
                      }}</span>
                      <span class="info-value">
                        <a
                          :href="stockData.profile.website"
                          target="_blank"
                          class="website-link text-primary text-weight-bold"
                        >
                          {{ stockData.profile.website }}
                        </a>
                      </span>
                    </div>
                    <q-separator :dark="$q.dark.isActive" class="q-mb-md" />

                    <div class="info-desc-box">
                      <span class="info-label block q-mb-sm text-weight-bold">{{
                        languageStore.isThai ? 'คำอธิบายธุรกิจ' : 'Description'
                      }}</span>
                      <p class="text-grey-7" style="line-height: 1.6; font-size: 14px">
                        {{ stockData.profile.description }}
                      </p>
                    </div>
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name="financials" class="q-pa-none">
                <div class="financials-container q-pa-lg">
                  <div class="financials-grid">
                    <div class="fin-stat-box">
                      <div class="fin-label">
                        {{ languageStore.isThai ? 'มูลค่าตลาด (Market Cap)' : 'Market Cap' }}
                      </div>
                      <div class="fin-value text-primary">
                        {{ formatMarketCap(stockData.profile.marketCap) }}
                      </div>
                    </div>

                    <div class="fin-stat-box">
                      <div class="fin-label">
                        {{ languageStore.isThai ? 'อัตราส่วน P/E' : 'P/E Ratio' }}
                      </div>
                      <div class="fin-value">
                        {{ stockData.financials[0]?.peRatio.toFixed(2) || 'N/A' }}
                      </div>
                    </div>

                    <div class="fin-stat-box">
                      <div class="fin-label">
                        {{ languageStore.isThai ? 'กำไรต่อหุ้น (EPS)' : 'EPS' }}
                      </div>
                      <div class="fin-value">
                        {{ stockData.financials[0]?.eps.toFixed(2) || 'N/A' }}
                      </div>
                    </div>

                    <div class="fin-stat-box">
                      <div class="fin-label">
                        {{ languageStore.isThai ? 'รายได้รวม' : 'Revenue' }}
                      </div>
                      <div class="fin-value">
                        {{ formatCurrency(stockData.financials[0]?.revenue || 0) }}
                      </div>
                    </div>

                    <div class="fin-stat-box full-width-col">
                      <div class="fin-label">
                        {{ languageStore.isThai ? 'รายได้สุทธิ' : 'Net Income' }}
                      </div>
                      <div class="fin-value text-positive">
                        {{ formatCurrency(stockData.financials[0]?.netIncome || 0) }}
                      </div>
                    </div>
                  </div>

                  <!-- DCF Stock Valuation Widget -->
                  <StockValuationWidget :symbol="selectedSymbol" class="q-mt-xl" />

                  <!-- Intrinsic Value Analysis Card -->
                  <div class="intrinsic-value-card q-mt-xl" v-if="intrinsicValue">
                    <div class="text-subtitle1 text-weight-bold q-mb-md">
                      <q-icon name="analytics" size="sm" class="q-mr-xs" color="primary" />
                      {{
                        languageStore.isThai
                          ? 'วิเคราะห์มูลค่าพื้นฐาน (Intrinsic Value)'
                          : 'Intrinsic Value Analysis'
                      }}
                    </div>
                    <div class="intrinsic-value-grid">
                      <div class="intrinsic-value-box current-price">
                        <div class="intrinsic-label">
                          {{ languageStore.isThai ? 'ราคาปัจจุบัน' : 'Current Price' }}
                        </div>
                        <div class="intrinsic-value">
                          {{ formatCurrency(intrinsicValue.currentPrice) }}
                        </div>
                      </div>

                      <div
                        class="intrinsic-value-box intrinsic-price"
                        :class="intrinsicValue.status.toLowerCase()"
                      >
                        <div class="intrinsic-label">
                          {{ languageStore.isThai ? 'มูลค่าพื้นฐาน' : 'Intrinsic Value' }}
                        </div>
                        <div class="intrinsic-value">
                          {{ formatCurrency(intrinsicValue.intrinsicValue) }}
                        </div>
                        <div class="intrinsic-status" :class="`text-${intrinsicValueStatusColor}`">
                          <q-icon :name="intrinsicValueStatusIcon" size="16px" class="q-mr-xs" />
                          {{ intrinsicValue.status }}
                        </div>
                      </div>

                      <div
                        class="intrinsic-value-box premium-discount"
                        :class="intrinsicValue.discountPremium > 0 ? 'positive' : 'negative'"
                      >
                        <div class="intrinsic-label">
                          {{ languageStore.isThai ? 'ส่วนลด/พรีเมียม' : 'Discount/Premium' }}
                          <q-icon name="info_outline" size="14px" class="q-ml-xs text-grey-5">
                            <q-tooltip max-width="240px">
                              {{
                                languageStore.isThai
                                  ? 'ส่วนต่างความปลอดภัย (Margin of Safety) ราคาปัจจุบันถูกกว่ามูลค่าพื้นฐาน = ส่วนลด (ดี), แพงกว่า = พรีเมียม'
                                  : 'Margin of Safety. Price below intrinsic value is a Discount (good); above is a Premium.'
                              }}
                            </q-tooltip>
                          </q-icon>
                        </div>
                        <div class="intrinsic-value">
                          {{ intrinsicValue.discountPremium > 0 ? '+' : ''
                          }}{{ intrinsicValue.discountPremium.toFixed(1) }}%
                        </div>
                        <div class="confidence-badge">
                          <q-icon name="verified" size="14px" class="q-mr-xs" />
                          {{ intrinsicValue.confidence }}%
                          {{ languageStore.isThai ? 'ความมั่นใจ' : 'Confidence' }}
                        </div>
                      </div>
                    </div>

                    <q-expansion-item
                      icon="info"
                      :label="
                        languageStore.isThai ? 'ดูรายละเอียดการวิเคราะห์' : 'View Analysis Details'
                      "
                      class="analysis-expansion q-mt-md"
                      dense
                    >
                      <q-card flat bordered class="analysis-details">
                        <q-card-section class="q-pa-md">
                          <div class="analysis-item q-mb-sm">
                            <div class="analysis-item-title text-weight-bold text-grey-7">
                              {{ languageStore.isThai ? 'การวิเคราะห์ P/E:' : 'P/E Analysis:' }}
                            </div>
                            <div class="analysis-item-content">
                              {{ intrinsicValue.analysis.peAnalysis }}
                            </div>
                          </div>
                          <div class="analysis-item q-mb-sm">
                            <div class="analysis-item-title text-weight-bold text-grey-7">
                              {{ languageStore.isThai ? 'การเติบโตของ EPS:' : 'EPS Growth:' }}
                            </div>
                            <div class="analysis-item-content">
                              {{ intrinsicValue.analysis.epsGrowth }}
                            </div>
                          </div>
                          <div class="analysis-item q-mb-sm">
                            <div class="analysis-item-title text-weight-bold text-grey-7">
                              {{ languageStore.isThai ? 'คุณภาพรายได้:' : 'Revenue Quality:' }}
                            </div>
                            <div class="analysis-item-content">
                              {{ intrinsicValue.analysis.revenueQuality }}
                            </div>
                          </div>
                          <div class="analysis-item">
                            <div class="analysis-item-title text-weight-bold text-grey-7">
                              {{ languageStore.isThai ? 'สรุปโดยรวม:' : 'Overall:' }}
                            </div>
                            <div class="analysis-item-content">
                              {{ intrinsicValue.analysis.overall }}
                            </div>
                          </div>
                        </q-card-section>
                      </q-card>
                    </q-expansion-item>
                  </div>

                  <div class="quarterly-table q-mt-xl">
                    <div class="text-subtitle1 text-weight-bold q-mb-md">
                      <q-icon name="table_view" size="sm" class="q-mr-xs" color="primary" />
                      {{ languageStore.isThai ? 'สรุปข้อมูลรายไตรมาส' : 'Quarterly Summary' }}
                    </div>
                    <div class="table-responsive-wrapper rounded-borders overflow-hidden">
                      <q-table
                        :rows="stockData.financials"
                        :dark="$q.dark.isActive"
                        :columns="[
                          {
                            name: 'quarter',
                            label: languageStore.isThai ? 'ไตรมาส' : 'Quarter',
                            field: 'quarter',
                            align: 'left',
                          },
                          {
                            name: 'year',
                            label: languageStore.isThai ? 'ปี' : 'Year',
                            field: 'year',
                            align: 'left',
                          },
                          {
                            name: 'revenue',
                            label: languageStore.isThai ? 'รายได้' : 'Revenue',
                            field: 'revenue',
                            align: 'right',
                            format: (val: number) => formatCurrency(val),
                          },
                          {
                            name: 'netIncome',
                            label: languageStore.isThai ? 'รายได้สุทธิ' : 'Net Income',
                            field: 'netIncome',
                            align: 'right',
                            format: (val: number) => formatCurrency(val),
                          },
                          {
                            name: 'eps',
                            label: 'EPS',
                            field: 'eps',
                            align: 'right',
                            format: (val: number) => val.toFixed(2),
                          },
                          {
                            name: 'peRatio',
                            label: 'P/E',
                            field: 'peRatio',
                            align: 'right',
                            format: (val: number) => val.toFixed(2),
                          },
                        ]"
                        flat
                        :hide-pagination="true"
                        class="clean-table"
                      />
                    </div>
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name="seasonality" class="q-pa-none">
                <div class="seasonality-container q-pa-lg">
                  <!-- Seasonality Header -->
                  <div class="seasonality-header">
                    <div class="row items-center justify-between q-mb-md">
                      <div class="text-subtitle1 text-weight-bold">
                        <q-icon name="calendar_month" size="sm" class="q-mr-xs" color="primary" />
                        {{ languageStore.isThai ? 'สถิติผลงานรายเดือน' : 'Monthly Seasonality' }}
                      </div>
                      <q-select
                        v-model="selectedYear"
                        :options="yearOptions"
                        :label="languageStore.isThai ? 'เลือกปี' : 'Year'"
                        outlined
                        dense
                        emit-value
                        map-options
                        style="min-width: 150px"
                        class="year-select"
                      />
                    </div>
                    <div class="seasonality-summary">
                      <div class="summary-stat">
                        <span class="stat-label">{{
                          languageStore.isThai ? 'อัตราชนะรวม' : 'Overall Win Rate'
                        }}</span>
                        <span class="stat-value"
                          >{{ seasonalityData?.overallWinRate.toFixed(1) || '0.0' }}%</span
                        >
                      </div>
                      <div class="summary-stat">
                        <span class="stat-label">{{
                          languageStore.isThai ? 'เดือนที่ดีที่สุด' : 'Best Month'
                        }}</span>
                        <span class="stat-value text-positive"
                          >{{ seasonalityData?.bestMonth.month || '-' }} ({{
                            seasonalityData?.bestMonth.winRate.toFixed(0) || '0'
                          }}%)</span
                        >
                      </div>
                      <div class="summary-stat">
                        <span class="stat-label">{{
                          languageStore.isThai ? 'เดือนที่แย่ที่สุด' : 'Worst Month'
                        }}</span>
                        <span class="stat-value text-negative"
                          >{{ seasonalityData?.worstMonth.month || '-' }} ({{
                            seasonalityData?.worstMonth.winRate.toFixed(0) || '0'
                          }}%)</span
                        >
                      </div>
                    </div>
                  </div>

                  <!-- Loading State -->
                  <div v-if="seasonalityLoading" class="seasonality-loading">
                    <div class="metric-strip metric-strip--compact">
                      <div v-for="n in 6" :key="`sk-s-${n}`" class="metric-cell premium-card">
                        <q-skeleton type="text" width="50%" />
                        <q-skeleton type="text" width="80%" class="q-mt-sm" />
                      </div>
                    </div>
                  </div>

                  <!-- Seasonality Heatmap -->
                  <div v-else-if="seasonalityData" class="seasonality-heatmap">
                    <div class="heatmap-grid">
                      <div
                        v-for="month in seasonalityData.analysis"
                        :key="month.month"
                        class="month-cell"
                        :class="[
                          getSeasonalityCellColor(month.averageChangePercent),
                          getSeasonalityCellIntensity(month.averageChangePercent),
                        ]"
                      >
                        <div class="month-name">{{ month.month }}</div>
                        <div class="win-rate">
                          {{ languageStore.isThai ? 'ชนะ' : 'Win' }}:
                          {{ month.winRate.toFixed(0) }}%
                        </div>
                        <div
                          class="avg-change"
                          :class="
                            month.averageChangePercent >= 0 ? 'text-positive' : 'text-negative'
                          "
                        >
                          {{ month.averageChangePercent >= 0 ? '+' : ''
                          }}{{ month.averageChangePercent.toFixed(1) }}%
                        </div>
                        <div class="years-data">
                          {{ month.positiveYears }}/{{ month.totalYears }}
                          {{ languageStore.isThai ? 'ปี' : 'years' }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Empty State -->
                  <div v-else class="seasonality-empty">
                    <q-icon name="calendar_month" size="48px" color="grey-6" class="q-mb-md" />
                    <p>
                      {{
                        languageStore.isThai
                          ? 'ไม่มีข้อมูลสถิติฤดูกาล'
                          : 'No seasonality data available'
                      }}
                    </p>
                  </div>
                </div>
              </q-tab-panel>

              <q-tab-panel name="market" class="q-pa-none">
                <div class="market-tab-wrap" data-test="market-overview-tab">
                  <MarketOverviewSection />
                </div>
              </q-tab-panel>
            </q-tab-panels>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   PREMIUM FIN-TECH STYLING
   ========================================= */
/* หน้านี้เคยมีธีมของตัวเองเป็นชุดกรม/คราม (#0b1120 / #111827 / #6366f1) ซึ่งเป็น
   คนละอัตลักษณ์กับที่เหลือของแอป เวลาเข้า Stock Terminal จึงเหมือนหลุดไปอีกเว็บหนึ่ง
   ยกมาใช้ teal/sage ชุดเดียวกับ app.scss แล้ว (ค่าเดียวกับที่ mockup ใช้)
   โครง selector เดิมไม่แตะ — ค่า dark เป็นค่าตั้งต้น แล้ว :not(.dark-theme) ทับด้วยชุด light */
.stock-analysis-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
  --bg-hover: #282e2e;
  --bg-terminal: #101314;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --border-color: #394141;
  --primary-color: #85b6b0;
  --profit-color: #4ade80;
  --loss-color: #f87171;
  --bull-bg: rgba(74, 222, 128, 0.08);
  --bear-bg: rgba(248, 113, 113, 0.08);
  --shadow-main: 0 1px 2px rgba(0, 0, 0, 0.2), 0 20px 44px -16px rgba(0, 0, 0, 0.55);

  background-color: var(--bg-page);
  min-height: 100vh;
  padding: clamp(12px, 2vw, 20px);
  color: var(--text-main);
  transition: all 0.3s ease;
}

.stock-analysis-page.dark-theme,
.stock-analysis-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
}

.stock-analysis-page:not(.dark-theme) {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-hover: #f0f5f4;
  --bg-terminal: #f0f5f4;
  --text-main: #1b3636;
  --text-muted: #789191;
  --border-color: #dae7e5;
  --primary-color: #336160;
  --profit-color: #178230;
  --loss-color: #c10015;
  --bull-bg: rgba(23, 130, 48, 0.08);
  --bear-bg: rgba(193, 0, 21, 0.08);
  --shadow-main: 0 1px 2px rgba(27, 54, 54, 0.04), 0 12px 32px -12px rgba(27, 54, 54, 0.1);
}

.mono-num {
  font-family: 'JetBrains Mono', 'IBM Plex Sans Thai', monospace;
  font-variant-numeric: tabular-nums;
}

.analysis-wrapper,
.terminal-shell {
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* mockup ใช้ --radius-md 16px กับการ์ดทุกใบ เดิมหน้านี้อยู่ที่ 10px */
.premium-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: var(--shadow-main);
  overflow: hidden;
}

.hover-lift {
  transition:
    transform 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.hover-lift:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0.12),
    var(--shadow-main);
}

/* --- Terminal Bar --- */
.terminal-bar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(260px, 340px) auto;
  gap: 16px;
  align-items: center;
  padding: 14px 18px;
}

.terminal-identity {
  min-width: 0;
  align-self: center;
}

.terminal-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 340px;
  justify-self: stretch;
  align-self: center;
}

.terminal-search-input {
  width: 100%;
}

.terminal-search-input :deep(.q-field__control) {
  border-radius: 8px;
  min-height: 40px;
  height: 40px;
}

.terminal-search-input :deep(.q-field__marginal) {
  height: 40px;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 200;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-main);
}

.search-dropdown--modal {
  position: static;
  max-height: 220px;
}

.search-result-row {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s ease;
}

.search-result-row:last-child {
  border-bottom: none;
}

.search-result-row:hover {
  background: var(--bg-hover);
}

.result-symbol {
  font-weight: 700;
  color: var(--primary-color);
}

.result-name {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-sector {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 2px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.terminal-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-hover);
  min-width: 120px;
}

/* --- Metric Strip --- */
.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.metric-strip--compact {
  grid-template-columns: repeat(3, 1fr);
}

.metric-cell {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-cell.bullish {
  border-color: rgba(0, 230, 118, 0.25);
  background: var(--bull-bg);
}

.metric-cell.bearish {
  border-color: rgba(255, 82, 82, 0.25);
  background: var(--bear-bg);
}

.metric-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.metric-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.metric-value.muted {
  color: var(--text-muted);
}

.metric-cell.bullish .metric-value {
  color: var(--profit-color);
}

.metric-cell.bearish .metric-value {
  color: var(--loss-color);
}

/* --- Chart Stage --- */
.terminal-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.terminal-workspace {
  flex: 1;
}

.chart-stage {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.refresh-progress {
  flex: 0 0 auto;
}

/* โหลดทับของเดิมไม่สำเร็จ — ต้องเห็นชัดว่าตัวเลขบนจอยังเป็นของรอบก่อน */
.refresh-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-primary, #e2e8f0);
  background: rgba(239, 68, 68, 0.12);
  border-bottom: 1px solid rgba(239, 68, 68, 0.35);
}

.refresh-error-banner__text {
  flex: 1;
  min-width: 0;
}

/* ครอบกราฟไว้เพื่อวาง overlay ตอนกำลังโหลดทับได้ */
.chart-canvas-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.chart-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(1.5px);
  pointer-events: none;
}

.chart-loading-overlay__text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #94a3b8);
}

.chart-hero {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart-hero-canvas {
  flex: 1;
  min-height: clamp(420px, calc(100vh - 340px), 680px);
}

.chart-skeleton {
  min-height: clamp(420px, calc(100vh - 340px), 680px);
  border-radius: 8px;
}

.terminal-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-bar {
  padding: 16px 18px;
}

.timeframe-selector {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.timeframe-group,
.chart-type-group {
  flex-wrap: wrap;
}

.eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin: 0 0 4px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.symbol {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-main);
}

.name {
  font-size: 14px;
  color: var(--text-muted);
}

.subline {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
}

.price-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg-hover);
  padding: 10px 16px;
  border-radius: 12px;
  min-width: 120px;
}

.chip-price {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main);
}

.chip-delta {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chip-delta.positive {
  color: var(--profit-color);
}
.chip-delta.negative {
  color: var(--loss-color);
}
.chip-delta.neutral {
  color: var(--text-muted);
}

@media (max-width: 1024px) {
  .terminal-bar {
    grid-template-columns: 1fr 1fr;
  }

  .terminal-search-wrap {
    grid-column: 1 / -1;
    order: 3;
  }

  .metric-strip {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 640px) {
  .terminal-bar {
    grid-template-columns: 1fr;
  }

  .terminal-price {
    align-items: flex-start;
  }

  .metric-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* --- Header Section --- */
.analysis-header {
  padding: 24px;
}

.search-section {
  margin-bottom: 24px;
}

.stock-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.stock-header-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stock-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: #fff;
}

.stock-symbol {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.2;
}

.stock-name {
  font-size: 14px;
  color: var(--text-muted);
}

.price-display {
  text-align: right;
}

.current-price {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.price-change {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 15px;
  font-weight: 700;
  margin-top: 4px;
}

.price-change.positive {
  color: var(--profit-color);
}
.price-change.negative {
  color: var(--loss-color);
}

.change-percent {
  font-weight: 500;
  opacity: 0.9;
}

.signal-badge {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 999px;
  letter-spacing: 0.2px;
  cursor: default;
}

.signal-badge--strong {
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.4);
  animation: signal-pulse 1.6s infinite;
}

@keyframes signal-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.5);
  }
  70% {
    transform: scale(1.04);
    box-shadow: 0 0 0 8px rgba(255, 255, 255, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
}

/* --- Status Containers --- */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  text-align: center;
}

/* --- Tabs --- */
.analysis-tabs {
  border-bottom: 1px solid var(--border-color);
}

.analysis-tabs :deep(.q-tab) {
  font-weight: 700;
  text-transform: none;
}

/* --- Graph Section --- */
.chart-container {
  padding: 0;
}

.chart-indicators-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  padding: 8px 0;
}

.rsi-display,
.pattern-badge,
.screener-signal-badge {
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.rsi-display:hover,
.pattern-badge:hover,
.screener-signal-badge:hover {
  transform: translateY(-1px);
}

.rsi-display {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-hover);
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  width: fit-content;
}

.pattern-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-hover);
  border: 1px dashed var(--border-color);
  padding: 6px 12px;
  border-radius: 6px;
  max-width: 100%;
  color: var(--text-muted);
}

.pattern-badge--active {
  border-style: solid;
  border-color: #eab308;
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(79, 70, 229, 0.08));
  color: var(--text-main);
}

.pattern-badge__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.3;
}

.pattern-badge__value {
  font-weight: 800;
  color: #eab308;
}

.pattern-badge--active .pattern-badge__value {
  color: var(--text-main);
}

.pattern-badge__date {
  font-size: 12px;
  color: var(--text-muted);
}

/* --- Screener Signal Badge --- */
.screener-signal-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: 6px;
  max-width: 100%;
  font-weight: 600;
  transition: all 0.25s ease;
}

.screener-signal-badge--buy {
  border-color: rgba(0, 230, 118, 0.45);
  background: var(--bull-bg);
  color: var(--profit-color);
  box-shadow: 0 0 12px rgba(0, 230, 118, 0.12);
}

.screener-signal-badge--sell {
  border-color: rgba(255, 82, 82, 0.45);
  background: var(--bear-bg);
  color: var(--loss-color);
  box-shadow: 0 0 12px rgba(255, 82, 82, 0.12);
}

.screener-signal-badge--strong {
  border-width: 3px;
  transform: scale(1.05);
  font-weight: 800;
}

.screener-signal-badge--strong.screener-signal-badge--buy {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.screener-signal-badge--strong.screener-signal-badge--sell {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.screener-signal-badge__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.3;
}

.screener-signal-badge__value {
  font-weight: 800;
}

.screener-signal-badge--buy .screener-signal-badge__value {
  color: var(--profit-color);
}

.screener-signal-badge--sell .screener-signal-badge__value {
  color: var(--loss-color);
}

.rsi-value {
  font-weight: 800;
  font-size: 14px;
}
.rsi-value.overbought {
  color: var(--loss-color);
}
.rsi-value.oversold {
  color: var(--profit-color);
}

/* --- Summary Section --- */
.info-row {
  display: flex;
  justify-content: space-between;
  padding: 16px 0;
  font-size: 15px;
}

.info-label {
  color: var(--text-muted);
}

.info-desc-box {
  background: var(--bg-hover);
  padding: 16px;
  border-radius: 12px;
}

.website-link {
  text-decoration: none;
}
.website-link:hover {
  text-decoration: underline;
}

/* --- Financials Section --- */
.financials-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.full-width-col {
  grid-column: 1 / -1;
}

.fin-stat-box {
  background: var(--bg-hover);
  padding: 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.fin-stat-box:hover {
  border-color: rgba(99, 102, 241, 0.3);
  transform: translateY(-1px);
}

.fin-label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 4px;
}

.fin-value {
  font-size: 18px;
  font-weight: 800;
}

/* --- Intrinsic Value Section --- */
.intrinsic-value-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--shadow-main);
}

.intrinsic-value-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.intrinsic-value-box {
  background: var(--bg-hover);
  padding: 20px;
  border-radius: 12px;
  border: 2px solid var(--border-color);
  text-align: center;
  transition: all 0.3s ease;
}

.intrinsic-value-box.current-price {
  border-color: var(--border-color);
}

.intrinsic-value-box.intrinsic-price.undervalued {
  border-color: var(--profit-color);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05));
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.intrinsic-value-box.intrinsic-price.overvalued {
  border-color: var(--loss-color);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05));
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);
}

.intrinsic-value-box.intrinsic-price.fair-value {
  border-color: #f59e0b;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05));
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2);
}

.intrinsic-value-box.premium-discount.positive {
  border-color: var(--profit-color);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.04));
}

.intrinsic-value-box.premium-discount.negative {
  border-color: var(--loss-color);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.04));
}

.intrinsic-label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.intrinsic-value {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 8px;
}

.intrinsic-status {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confidence-badge {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.analysis-expansion {
  background: var(--bg-hover);
  border-radius: 8px;
}

.analysis-details {
  background: var(--bg-card);
}

.analysis-item {
  margin-bottom: 12px;
}

.analysis-item:last-child {
  margin-bottom: 0;
}

.analysis-item-title {
  font-size: 13px;
  margin-bottom: 4px;
}

.analysis-item-content {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-main);
}

/* --- Seasonality Section --- */
.seasonality-container {
  background: var(--bg-card);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-main);
}

.seasonality-header {
  margin-bottom: 24px;
}

.seasonality-summary {
  display: flex;
  gap: 24px;
  padding: 16px;
  background: var(--bg-hover);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main);
}

.seasonality-loading,
.seasonality-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
}

.seasonality-heatmap {
  margin-top: 24px;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  padding: 4px;
}

.month-cell {
  background: var(--bg-hover);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.month-cell:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

/* Positive months - green gradient */
.month-cell.positive.low {
  border-color: rgba(16, 185, 129, 0.3);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.04));
}

.month-cell.positive.medium {
  border-color: rgba(16, 185, 129, 0.5);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.08));
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
}

.month-cell.positive.high {
  border-color: rgba(16, 185, 129, 0.7);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(16, 185, 129, 0.12));
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}

/* Negative months - red gradient */
.month-cell.negative.low {
  border-color: rgba(239, 68, 68, 0.3);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.04));
}

.month-cell.negative.medium {
  border-color: rgba(239, 68, 68, 0.5);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.08));
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.15);
}

.month-cell.negative.high {
  border-color: rgba(239, 68, 68, 0.7);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.12));
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25);
}

/* Neutral months */
.month-cell.neutral {
  border-color: var(--border-color);
  background: var(--bg-hover);
}

.month-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.win-rate {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 6px;
}

.avg-change {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}

.years-data {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* Responsive Design */
@media (max-width: 768px) {
  .seasonality-summary {
    flex-direction: column;
    gap: 12px;
  }

  .summary-stat {
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
  }

  .heatmap-grid {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }

  .month-cell {
    padding: 12px 8px;
  }

  .month-name {
    font-size: 13px;
  }

  .avg-change {
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .heatmap-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .month-cell {
    padding: 10px 6px;
  }

  .month-name {
    font-size: 12px;
    margin-bottom: 6px;
  }

  .win-rate {
    font-size: 11px;
    margin-bottom: 4px;
  }

  .avg-change {
    font-size: 13px;
    margin-bottom: 4px;
  }

  .years-data {
    font-size: 10px;
  }
}

/* --- Table --- */
.table-responsive-wrapper {
  border: 1px solid var(--border-color);
}

.clean-table :deep(.q-table th) {
  background: var(--bg-hover);
  color: var(--text-muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color);
}

.clean-table :deep(.q-table td) {
  font-size: 14px;
}

/* --- Popular Stocks Table --- */
.popular-stocks-section {
  margin-top: 24px;
}

.popular-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.popular-header {
  padding: 14px 18px;
}

.popular-header-icon {
  color: #f97316;
}

.popular-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 16px;
}

.popular-table-wrapper {
  overflow-x: auto;
}

.popular-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 920px;
}

.popular-table th {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.popular-table td {
  padding: 12px 14px;
  font-size: 14px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
  vertical-align: middle;
}

.popular-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.popular-row:hover {
  background: var(--bg-hover);
}

.popular-row:last-child td {
  border-bottom: none;
}

.stock-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stock-logo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: contain;
  background: #ffffff;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* พื้นหลังมาจาก symbolAvatarColor() ผูกแบบ inline — หุ้นแต่ละตัวจึงได้สีคงที่ของตัวเอง
   เหมือนที่ Watchlist/AI Radar ใช้ (ของเดิมเป็น gradient สีเดียวกันหมดทุกตัว) */
.stock-logo--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.02em;
}

.stock-cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stock-cell-symbol {
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
}

.stock-cell-name {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.cell-main {
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.3;
}

.cell-sub {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}

.cell-sub.text-positive,
.cell-main.text-positive {
  color: var(--profit-color) !important;
}

.cell-sub.text-negative,
.cell-main.text-negative {
  color: var(--loss-color) !important;
}

.cell-main.muted,
.cell-sub.muted {
  color: var(--text-muted) !important;
}

.level-cell {
  color: var(--text-muted);
}

.popular-footer {
  display: flex;
  justify-content: center;
  padding: 10px 16px 14px;
}

.view-all-btn {
  border-radius: 8px;
}

/* --- Analyst Recommendations --- */
.side-cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.side-card {
  display: flex;
  flex-direction: column;
}

.side-card-header {
  padding: 14px 18px;
}

.side-card-header-icon {
  color: var(--primary-color);
}

.side-card-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 16px;
  flex: 1;
}

.analyst-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.analyst-recommendation {
  font-size: 22px;
  font-weight: 800;
}

.analyst-recommendation.is-positive {
  color: var(--profit-color) !important;
}

.analyst-recommendation.is-negative {
  color: var(--loss-color) !important;
}

.analyst-recommendation.is-neutral {
  color: var(--text-muted) !important;
}

.analyst-sub {
  font-size: 12px;
  color: var(--text-muted) !important;
  margin-top: -8px;
}

.analyst-target-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.analyst-target-box {
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  text-align: center;
}

.analyst-target-box--mean {
  border-color: rgba(99, 102, 241, 0.35);
}

.analyst-target-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted) !important;
}

.analyst-target-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main) !important;
  margin-top: 4px;
}

.analyst-updated {
  font-size: 11px;
  color: var(--text-muted) !important;
}

/* --- Responsive --- */
@media (max-width: 600px) {
  .stock-info {
    flex-direction: column;
    align-items: flex-start;
  }
  .price-display {
    text-align: left;
    width: 100%;
  }
  .price-change {
    justify-content: flex-start;
  }
  .financials-grid {
    grid-template-columns: 1fr;
  }

  .popular-table th,
  .popular-table td {
    padding: 10px 10px;
  }
}

.market-tab-wrap {
  padding: 16px 0;
}

/* --- ป้ายราคาสด --- */
.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font-size: 11px;
  cursor: pointer;
}

.live-badge:hover {
  border-color: #22c55e;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  animation: live-pulse 2s ease-in-out infinite;
}

.live-badge--paused .live-dot {
  background: #64748b;
  animation: none;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
}

.chart-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 620px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
}

/* --- TradingView Lightweight Charts --- */
.tw-chart-container {
  position: relative;
  width: 100%;
  height: 620px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-terminal);
  border: 1px solid var(--border-color);
}

.tw-chart-container :deep(.tv-lightweight-charts) {
  border-radius: 12px;
}

/* tooltip ของกราฟ — เดิมฮาร์ดโค้ดโทน slate ไว้ จึงเป็นคนละสีกับการ์ดรอบตัว
   ตอนนี้อ่านจากตัวแปรของหน้าเลย เปลี่ยนธีมแล้วตามไปเองทั้งสองโหมด */
.tw-chart-container :deep(.tv-lightweight-charts-tooltip) {
  background: var(--bg-card) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 10px !important;
  color: var(--text-main) !important;
  font-family: 'Inter', 'IBM Plex Sans Thai', system-ui, sans-serif !important;
}

/* Price scale labels */
.tw-chart-container :deep(.tv-lightweight-charts-price-axis) {
  color: var(--text-muted);
}

/* --- Advanced Search Dialog --- */
.advanced-search-card {
  min-width: min(92vw, 420px);
  max-width: 480px;
  border-radius: 10px;
}

.advanced-search-card :deep(.q-card__section) {
  padding: 20px;
}

.category-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-chip {
  border-radius: 9999px;
}

/* Pro Bloomberg Terminal Grid Layout */
.terminal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 768px) {
  .terminal-grid {
    grid-template-columns: 1fr;
  }
}

.year-select :deep(.q-select__input) {
  font-size: 13px;
}
</style>

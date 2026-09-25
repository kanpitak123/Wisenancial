<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useAssetStore } from 'stores/AssetStore';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useLivePrice } from 'src/composables/useLivePrice';
import { useOlderHistoryLoader } from 'src/composables/useOlderHistoryLoader';
import { assetService } from 'src/services/asset.service';
import { isForexMarketOpen } from 'src/utils/forex-market-hours';
import PriceChart from 'components/charts/PriceChart.vue';
import {
  isNewerTradingDay,
  mergeLivePrice,
  toCandlestickData,
  toTradingDay,
  type CandlestickPoint,
  type PriceLineSpec,
} from 'src/utils/price-chart';

const assetStore = useAssetStore();

// ==========================================
// 📊 Chart Logic — shares components/charts/PriceChart.vue and
// composables/useOlderHistoryLoader.ts with the Stock chart (StockAnalysisPage.vue)
// instead of a second hand-rolled implementation. See
// forex-chart-parity-investigation.md for why: this inherits the visible-range
// lazy-load subscription, the position-preserving prepend/live-tick updates, AND the
// chart-zoom-drift-fix (commit a0e8cb6) for free, since it's the same component.
// ==========================================
const priceChartRef = ref<InstanceType<typeof PriceChart> | null>(null);

const currentTab = ref('chart'); // 'chart' | 'financial'
const selectedInterval = ref<'1d' | '1wk' | '1mo'>('1d');

/** ChartDataPoint (AssetStore) -> CandlestickPoint (PriceChart) — ชื่อฟิลด์คนละชุด (time/value vs date/volume) */
const currentBars = computed<CandlestickPoint[]>(() =>
  toCandlestickData(
    assetStore.chartData.map((point) => ({
      date: point.time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.value,
    })),
  ),
);

const historyRequestKey = computed(
  () => `${assetStore.activeAsset?.symbol ?? ''}:${selectedInterval.value}`,
);

const {
  bars: chartBars,
  loading: loadingOlderHistory,
  loadOlder: onNeedOlderHistory,
} = useOlderHistoryLoader(currentBars, {
  requestKey: historyRequestKey,
  fetchOlder: async (before) => {
    const asset = assetStore.activeAsset;
    if (!asset) return [];

    const portfolioId = assetStore.requirePortfolioId();
    const data = await assetService.getChart(
      portfolioId,
      asset.symbol,
      selectedInterval.value,
      before,
    );

    return toCandlestickData(
      data.map((point) => ({
        date: point.time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.value,
      })),
    );
  },
});

/** เส้นแนวรับ/แนวต้าน — ดูย้อนหลัง 30 แท่งล่าสุด (ของเดิมวาดด้วย candlestickSeries.createPriceLine ตรงๆ) */
const supportResistanceLines = computed<PriceLineSpec[]>(() => {
  const data = chartBars.value;
  if (data.length === 0) return [];

  const lookback = Math.min(30, data.length);
  const recentData = data.slice(-lookback);
  const highs = recentData.map((d) => d.high);
  const lows = recentData.map((d) => d.low);

  return [
    { price: Math.max(...highs), color: '#ef4444', title: 'RES' },
    { price: Math.min(...lows), color: '#10b981', title: 'SUP' },
  ];
});

// ==========================================
// 📡 Realtime — reuses the same 15s-poll + server-side-cache composable Stock uses
// ==========================================
const activeSymbol = computed(() => assetStore.activeAsset?.symbol ?? null);

/**
 * คู่เงิน/ทองคำเท่านั้นที่ผูกกับปฏิทินตลาด Forex (ปิดเสาร์-อาทิตย์) — crypto (BTC/USD ฯลฯ)
 * เทรด 24/7 อยู่แล้วไม่ต้องเกท ส่วนดัชนี (US30/NAS100/SPX500) มีปฏิทินตลาดหุ้นของตัวเองซึ่ง
 * ไม่ใช่ขอบเขตของงานนี้ (ดู forex-chart-parity-investigation.md Phase B) — ปล่อย poll
 * ตามปกติเหมือนเดิม ไม่ได้แย่ลงกว่าก่อนแก้
 */
const FOREX_MARKET_HOURS_SYMBOLS = new Set([
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'USD/CHF',
  'XAU/USD',
]);

const forexMarketOpenNow = ref(isForexMarketOpen());
let marketHoursTimer: ReturnType<typeof setInterval> | null = null;

const livePriceEnabled = computed(() => {
  const symbol = activeSymbol.value;
  if (!symbol) return false;
  if (FOREX_MARKET_HOURS_SYMBOLS.has(symbol)) return forexMarketOpenNow.value;
  return true;
});

const { quote: liveQuote } = useLivePrice(activeSymbol, { enabled: livePriceEnabled });

/** วันที่เคยสั่งโหลดประวัติใหม่เพราะข้ามวันเทรดไปแล้ว — กันไม่ให้วนโหลดทุกรอบ poll (เหมือน StockAnalysisPage) */
let rolloverRefetchedDay: number | null = null;

watch(activeSymbol, () => {
  rolloverRefetchedDay = null;
});

// ราคาสดเข้ามาแล้วอัปเดตเฉพาะแท่งล่าสุดด้วย series.update() ไม่ setData ใหม่ทั้งชุด
// (setData จะรีเซ็ตตำแหน่งที่ผู้ใช้เลื่อน/ซูมกราฟค้างไว้) — ไม่มีทางสร้างแท่งปลอม เพราะ
// mergeLivePrice() แก้ไขแท่งสุดท้ายที่มีอยู่แล้วเท่านั้น ไม่เคยสร้างแท่งใหม่เอง
watch(liveQuote, (quote) => {
  if (!quote) return;

  const bars = chartBars.value;
  const lastBar = bars[bars.length - 1];
  if (!lastBar) return;

  if (isNewerTradingDay(quote.asOf, lastBar.time)) {
    const quoteDay = toTradingDay(quote.asOf);
    if (quoteDay !== null && quoteDay !== rolloverRefetchedDay) {
      rolloverRefetchedDay = quoteDay;
      const asset = assetStore.activeAsset;
      if (asset) void assetStore.fetchChartData(asset.symbol, selectedInterval.value);
    }
    return;
  }

  const merged = mergeLivePrice(lastBar, quote.price);
  if (merged) {
    priceChartRef.value?.applyLiveBar(merged);
  }
});

const { safeLoad } = useSafeLoad();

onMounted(async () => {
  marketHoursTimer = setInterval(() => {
    forexMarketOpenNow.value = isForexMarketOpen();
  }, 60_000);

  // บัญชีที่ยังไม่มีพอร์ต fetchAssets() จะ throw — ต้องดักไว้ ไม่งั้น mounted หลุดทั้งก้อน
  await safeLoad(() => assetStore.fetchAssets(), 'โหลดรายการสินทรัพย์ไม่สำเร็จ');

  const activeAsset = assetStore.activeAsset;
  if (activeAsset) {
    await safeLoad(() => assetStore.setActiveAsset(activeAsset), 'โหลดข้อมูลสินทรัพย์ไม่สำเร็จ');
  }
});

// ดักฟังการเปลี่ยนคู่เงิน
watch(
  () => assetStore.activeAsset,
  async (newAsset) => {
    if (newAsset) {
      await assetStore.setActiveAsset(newAsset, selectedInterval.value);
    }
  },
);

onUnmounted(() => {
  if (marketHoursTimer !== null) clearInterval(marketHoursTimer);
});

// ==========================================
// 📈 Computed Logic (คำนวณข้อมูล Real-time)
// ==========================================

// คำนวณราคาล่าสุดและเปอร์เซ็นต์เปลี่ยนแปลง
const currentPriceInfo = computed(() => {
  const data = assetStore.chartData;
  const last = data[data.length - 1];
  if (data.length > 0 && last) {
    const current = last.close;
    const previous = data.length > 1 ? (data[data.length - 2]?.close ?? current) : current;

    const diff = current - previous;
    const percent = previous !== 0 ? (diff / previous) * 100 : 0;
    const isPositive = diff >= 0;

    return {
      price: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(current),
      diffFormatted: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        Math.abs(diff),
      ),
      percentFormatted: percent.toFixed(2) + '%',
      isPositive,
      icon: isPositive ? 'arrow_upward' : 'arrow_downward',
      colorClass: isPositive ? 'text-positive' : 'text-negative',
    };
  }
  return {
    price: '$0.00',
    diffFormatted: '$0.00',
    percentFormatted: '0.00%',
    isPositive: true,
    icon: 'arrow_upward',
    colorClass: 'text-positive',
  };
});

/**
 * ตรวจจับ Pattern พื้นฐาน — เทียบแท่งล่าสุดกับแท่งก่อนหน้าด้วยเงื่อนไขตรง ๆ
 * (engulfing / doji) ไม่ใช่ผลจากโมเดลภาษา ป้ายบนหน้าจอเดิมเขียนว่า "AI Detected"
 * ซึ่งทำให้เข้าใจผิด จึงเหลือแค่ "Pattern Detected"
 */
const detectedPattern = computed(() => {
  const data = assetStore.chartData;
  if (!data || data.length < 2) return 'Scanning...';

  const curr = data[data.length - 1];
  const prev = data[data.length - 2];
  if (
    !curr ||
    !prev ||
    curr.open === null ||
    prev.open === null ||
    curr.high === null ||
    curr.low === null
  ) {
    return 'Scanning...';
  }

  const currIsBull = curr.close > curr.open;
  const prevIsBear = prev.close < prev.open;
  const currIsBear = curr.close < curr.open;
  const prevIsBull = prev.close > prev.open;

  if (prevIsBear && currIsBull && curr.close > prev.open && curr.open < prev.close)
    return 'Bullish Engulfing';
  if (prevIsBull && currIsBear && curr.close < prev.open && curr.open > prev.close)
    return 'Bearish Engulfing';
  if (Math.abs(curr.close - curr.open) / (curr.high - curr.low) < 0.1) return 'Doji (Neutral)';

  return currIsBull ? 'Uptrend' : 'Downtrend';
});

// คำนวณ RSI(14)
const calculatedRSI = computed(() => {
  const data = assetStore.chartData;
  if (!data || data.length < 15) return '--';

  let gains = 0,
    losses = 0;
  for (let i = data.length - 14; i < data.length; i++) {
    const point = data[i];
    const prevPoint = data[i - 1];
    if (!point || !prevPoint) continue;
    const diff = point.close - prevPoint.close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return '100.00';
  const rs = gains / losses;
  return (100 - 100 / (1 + rs)).toFixed(2);
});

// ==========================================
// 📅 Monthly Statistics Mockup
// ==========================================
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
</script>

<template>
  <q-page class="explorer-page q-pa-md q-pa-sm-lg">
    <div class="row justify-between items-center q-mb-lg header-section">
      <div class="col-12 col-md-6">
        <div class="text-h4 text-weight-bolder text-main tracking-tight flex items-center">
          <q-icon name="explore" class="q-mr-sm text-primary" />
          Asset Explorer
        </div>
        <div class="text-subtitle2 text-muted q-mt-xs">
          World market data & technical analysis
        </div>
      </div>

      <div class="col-12 col-md-4 q-mt-md q-mt-md-none">
        <q-select
          outlined
          dense
          v-model="assetStore.activeAsset"
          :options="assetStore.assets"
          option-label="symbol"
          class="rounded-input bg-card shadow-sm"
          placeholder="Search Asset..."
        >
          <template v-slot:prepend>
            <q-icon name="search" color="primary" />
          </template>
        </q-select>
      </div>
    </div>

    <div
      v-if="assetStore.activeAsset"
      class="asset-info-card q-mb-lg row items-center q-pa-lg shadow-lg"
    >
      <div class="asset-logo q-mr-lg">
        {{ assetStore.activeAsset.symbol.substring(0, 2) }}
      </div>
      <div>
        <div class="row items-center">
          <div class="text-h5 text-weight-bold q-mr-sm">{{ assetStore.activeAsset.symbol }}</div>
          <q-icon name="star_outline" size="sm" color="warning" class="cursor-pointer" />
        </div>
        <div class="text-caption text-muted">{{ assetStore.activeAsset.name }}</div>
      </div>
      <q-space />
      <div class="text-right">
        <div class="text-h4 text-weight-bolder tracking-tight">{{ currentPriceInfo.price }}</div>
        <div class="text-weight-bold" :class="currentPriceInfo.colorClass">
          <q-icon :name="currentPriceInfo.icon" />
          {{ currentPriceInfo.isPositive ? '+' : '-' }}{{ currentPriceInfo.diffFormatted }} ({{
            currentPriceInfo.percentFormatted
          }})
        </div>
      </div>
    </div>

    <q-card class="dashboard-card overflow-hidden no-border">
      <q-tabs
        v-model="currentTab"
        dense
        class="text-muted bg-card-soft"
        active-color="primary"
        indicator-color="primary"
        align="left"
      >
        <q-tab name="chart" label="Chart Data" />
        <q-tab name="financial" label="Monthly Statistics" />
      </q-tabs>

      <q-separator />

      <q-tab-panels v-model="currentTab" animated class="bg-card">
        <q-tab-panel name="chart" class="q-pa-none">
          <div class="chart-controls row items-center q-pa-md">
            <q-btn-toggle
              v-model="selectedInterval"
              flat
              dense
              toggle-color="primary"
              :disable="!assetStore.activeAsset"
              :options="[
                { label: '1D', value: '1d' },
                { label: '1W', value: '1wk' },
                { label: '1M', value: '1mo' },
              ]"
              @update:model-value="
                (val) => assetStore.activeAsset && assetStore.fetchChartData(assetStore.activeAsset.symbol, val)
              "
            />
            <q-separator vertical class="q-mx-md" inset />
            <div class="tech-badge bg-card-soft q-px-md q-py-xs rounded-borders flex items-center">
              <span class="text-caption text-muted q-mr-sm">RSI(14):</span>
              <span
                class="text-weight-bold"
                :class="
                  Number(calculatedRSI) > 70
                    ? 'text-negative'
                    : Number(calculatedRSI) < 30
                      ? 'text-positive'
                      : 'text-primary'
                "
              >
                {{ calculatedRSI }}
              </span>
            </div>
            <q-space />
            <div class="pattern-badge">
              <q-icon name="auto_awesome" color="warning" /> Pattern Detected:
              <b>{{ detectedPattern }}</b>
            </div>
          </div>

          <div class="chart-wrapper relative-position">
            <PriceChart
              v-if="assetStore.activeAsset"
              ref="priceChartRef"
              :bars="chartBars"
              display-type="candlestick"
              :price-lines="supportResistanceLines"
              :height="500"
              data-test="asset-explorer-chart"
              @need-older-history="onNeedOlderHistory"
            />
            <div
              v-if="!assetStore.activeAsset"
              class="flex flex-center explorer-empty-state"
              style="height: 500px"
              data-test="asset-explorer-empty"
            >
              {{
                assetStore.assets.length === 0
                  ? 'No assets available right now.'
                  : 'Pick a symbol to see its chart.'
              }}
            </div>
            <div v-if="assetStore.isLoading" class="absolute-full flex flex-center bg-overlay">
              <q-spinner-dots color="primary" size="4em" />
            </div>
            <div
              v-if="loadingOlderHistory"
              class="chart-history-loading"
              data-test="chart-history-loading"
            >
              <q-spinner size="18px" color="primary" />
            </div>
          </div>
        </q-tab-panel>

        <q-tab-panel name="financial" class="q-pa-lg">
          <div class="text-h6 text-weight-bold q-mb-md flex items-center">
            <q-icon name="calendar_month" class="q-mr-sm text-primary" />
            Average Monthly Performance (Last 5 Years)
          </div>

          <div class="row q-col-gutter-md">
            <div v-for="m in months" :key="m" class="col-6 col-sm-4 col-md-2">
              <q-card
                class="month-card text-center q-pa-md border-radius-lg"
                :class="Math.random() > 0.4 ? 'month-positive' : 'month-negative'"
              >
                <div class="text-overline text-weight-bold">{{ m }}</div>
                <div class="text-h6 text-weight-bolder q-my-xs">
                  {{ Math.random() > 0.4 ? '+' : '-' }}{{ (Math.random() * 5).toFixed(1) }}%
                </div>
                <div class="text-caption opacity-70">
                  Win: {{ Math.floor(Math.random() * 100) }}%
                </div>
              </q-card>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<style scoped>
.explorer-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;

  background-color: var(--bg-page);
  min-height: 100vh;
}

.body--dark .explorer-page {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --bg-card-soft: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #23314b;
}

/* Asset Info Card */
.asset-info-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
}
.asset-logo {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 900;
  font-size: 20px;
}

/* Dashboard Style */
.dashboard-card {
  background: var(--bg-card);
  border-radius: 24px;
  border: 1px solid var(--border-color);
}

.chart-wrapper {
  min-height: 500px;
}

/* Monthly Stats Grid */
.month-card {
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  transition: transform 0.2s;
}
.month-card:hover {
  transform: translateY(-5px);
}

.month-positive {
  border: 1.5px solid #10b981;
  color: #10b981;
}
.month-negative {
  border: 1.5px solid #ef4444;
  color: #ef4444;
}

/* Badges */
.pattern-badge {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.bg-overlay {
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 10;
}

.explorer-empty-state {
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
  text-align: center;
  padding: 0 24px;
}

.rounded-input :deep(.q-field__control) {
  border-radius: 12px !important;
}

.chart-history-loading {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
}
</style>

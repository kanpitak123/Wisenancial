<script setup lang="ts">
/**
 * Market Overview lower section (image_83637e blueprint):
 *   1. Top metrics row (P/E, EPS, Yield, Market Cap, Avg Dividend)
 *   2. Market index chart (TradingView lightweight-charts area chart)
 *   3. Support/Resistance + Market breadth (2-col grid)
 *   4. Popular stocks table
 *
 * The index chart (2) is real OHLC history from Yahoo (/stocks/historical),
 * refreshed every 60s. The index-level metrics (1), support/resistance and
 * breadth (3) remain placeholders — Yahoo has no free feed for SET index P/E,
 * EPS, dividend or advancers/decliners, so those need a dedicated SET data
 * provider before they can be made real (or should be hidden until then).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import type { AreaData, Time, UTCTimestamp } from 'lightweight-charts';
import type { ApexOptions } from 'apexcharts';
import VueApexCharts from 'vue3-apexcharts';
import LightweightAreaChart from 'components/charts/LightweightAreaChart.vue';
import { api } from 'boot/axios';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';

interface HistoricalDataPoint {
  date: string;
  close: number;
}

const $q = useQuasar();
const router = useRouter();
const languageStore = useLanguageStore();

const isDark = computed(() => $q.dark.isActive);
const isThai = computed(() => languageStore.isThai);

/* ------------------------------------------------------------------ */
/* Index selector + real index-level quote                             */
/* ------------------------------------------------------------------ */
type IndexSymbol = 'SET' | 'SET50' | 'mai';

interface IndexQuote {
  price: number;
  changePercent: number;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  previousClose: number | null;
  support1: number | null;
  resistance1: number | null;
}

const selectedIndex = ref<IndexSymbol>('SET');
const indexOptions: IndexSymbol[] = ['SET', 'SET50', 'mai'];
const indexQuote = ref<IndexQuote | null>(null);

// Real index stats (level, change, day/52w range, pivots) from Yahoo.
const loadIndexQuote = async (symbol: IndexSymbol) => {
  try {
    const { data } = await api.get<IndexQuote>(
      `/stocks/index-quote/${encodeURIComponent(INDEX_YAHOO[symbol])}`,
    );
    indexQuote.value = data;
  } catch (error) {
    console.error('Failed to load index quote:', error);
    indexQuote.value = null;
  }
};

/* ------------------------------------------------------------------ */
/* Top metrics row                                                     */
/* ------------------------------------------------------------------ */
const metrics = computed(() => {
  const q = indexQuote.value;
  return [
    {
      key: 'level',
      title: isThai.value ? 'ดัชนี' : 'Index',
      value: fmt(q?.price),
      unit: '',
    },
    {
      key: 'chg',
      title: isThai.value ? 'เปลี่ยนแปลง' : 'Change',
      value: fmt(q?.changePercent),
      unit: '%',
    },
    {
      key: 'high',
      title: isThai.value ? 'สูงสุดวันนี้' : 'Day High',
      value: fmt(q?.dayHigh),
      unit: '',
    },
    {
      key: 'low',
      title: isThai.value ? 'ต่ำสุดวันนี้' : 'Day Low',
      value: fmt(q?.dayLow),
      unit: '',
    },
    {
      key: 'w52',
      title: isThai.value ? '52 สัปดาห์สูงสุด' : '52W High',
      value: fmt(q?.week52High),
      unit: '',
    },
  ];
});

/* ------------------------------------------------------------------ */
/* Chart: timeframes + deterministic mock series                       */
/* ------------------------------------------------------------------ */
type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'All';

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'All'];
const activeTimeframe = ref<Timeframe>('1D');

const TF_CONF: Record<Timeframe, { points: number; stepSec: number; intraday: boolean }> = {
  '1D': { points: 78, stepSec: 300, intraday: true },
  '1W': { points: 35, stepSec: 3600, intraday: true },
  '1M': { points: 22, stepSec: 86400, intraday: false },
  '3M': { points: 66, stepSec: 86400, intraday: false },
  '6M': { points: 130, stepSec: 86400, intraday: false },
  '1Y': { points: 252, stepSec: 86400, intraday: false },
  YTD: { points: 135, stepSec: 86400, intraday: false },
  All: { points: 260, stepSec: 604800, intraday: false },
};

// Each Thai index maps to its Yahoo Finance symbol; the backend serves real
// OHLC history for these via /stocks/historical.
const INDEX_YAHOO: Record<IndexSymbol, string> = {
  SET: '^SET.BK',
  SET50: '^SET50.BK',
  mai: '^MAI.BK',
};

// Frontend timeframes → the timeframe strings the backend understands. YTD/All
// fold onto the widest supported windows.
const TF_TO_BACKEND: Record<Timeframe, string> = {
  '1D': '1D',
  '1W': '1W',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  YTD: '1Y',
  All: '5Y',
};

const chartData = ref<AreaData<Time>[]>([]);
const chartTimeVisible = computed(() => TF_CONF[activeTimeframe.value].intraday);
const chartRef = ref<InstanceType<typeof LightweightAreaChart> | null>(null);

// Fetch real index history and map close prices to the area series. On failure
// the chart is emptied rather than showing fabricated data.
const loadChart = async (symbol: IndexSymbol, timeframe: Timeframe) => {
  try {
    const { data } = await api.get<HistoricalDataPoint[]>(
      `/stocks/historical/${encodeURIComponent(INDEX_YAHOO[symbol])}/${TF_TO_BACKEND[timeframe]}`,
    );
    chartData.value = (data ?? [])
      .filter((p) => Number.isFinite(p.close) && p.close > 0)
      .map((p) => ({
        time: Math.floor(new Date(p.date).getTime() / 1000) as UTCTimestamp,
        value: Number(p.close.toFixed(2)),
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  } catch (error) {
    console.error('Failed to load index chart:', error);
    chartData.value = [];
  }
};

watch([selectedIndex, activeTimeframe], ([symbol, timeframe]) => {
  void loadChart(symbol, timeframe);
});

watch(selectedIndex, (symbol) => {
  void loadIndexQuote(symbol);
});

// Refresh the current selection periodically so the latest data stays current.
let refreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void loadChart(selectedIndex.value, activeTimeframe.value);
  void loadIndexQuote(selectedIndex.value);
  void loadPopular();
  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    void loadChart(selectedIndex.value, activeTimeframe.value);
    void loadIndexQuote(selectedIndex.value);
  }, 60_000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

/* ------------------------------------------------------------------ */
/* Chart style toggle: new "Beautiful" area chart vs. old bar chart     */
/* ------------------------------------------------------------------ */
type ChartMode = 'new' | 'old';
const chartMode = ref<ChartMode>('new');

const barCategories = computed(() =>
  chartData.value.map((point) => {
    const date = new Date((point.time as number) * 1000);
    return chartTimeVisible.value
      ? date.toLocaleTimeString(isThai.value ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(isThai.value ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' });
  }),
);

const barSeries = computed(() => [
  {
    name: isThai.value ? 'ราคา' : 'Price',
    data: chartData.value.map((point) => point.value),
  },
]);

const barOptions = computed<ApexOptions>(() => ({
  chart: {
    type: 'bar',
    background: 'transparent',
    toolbar: { show: false },
    animations: { enabled: false },
  },
  theme: { mode: isDark.value ? 'dark' : 'light' },
  plotOptions: {
    bar: { columnWidth: '55%', borderRadius: 2 },
  },
  dataLabels: { enabled: false },
  colors: ['#2563eb'],
  xaxis: {
    categories: barCategories.value,
    labels: { style: { colors: isDark.value ? '#8b9cb3' : '#667085', fontSize: '10px' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: isDark.value ? '#8b9cb3' : '#667085' } },
  },
  grid: {
    borderColor: isDark.value ? '#2a3544' : '#e2e8f0',
    strokeDashArray: 3,
  },
  tooltip: { theme: isDark.value ? 'dark' : 'light' },
}));

/* ------------------------------------------------------------------ */
/* Support/Resistance + market breadth rows                            */
/* ------------------------------------------------------------------ */
// Support/Resistance from the index's real intraday pivots.
const srRows = computed(() => {
  const q = indexQuote.value;
  return [
    { label: isThai.value ? 'แนวรับ' : 'Support', value: fmt(q?.support1), tone: 'up' },
    { label: isThai.value ? 'แนวต้าน' : 'Resistance', value: fmt(q?.resistance1), tone: 'down' },
    { label: isThai.value ? 'ต่ำสุดวันนี้' : 'Day Low', value: fmt(q?.dayLow), tone: 'up' },
    { label: isThai.value ? 'สูงสุดวันนี้' : 'Day High', value: fmt(q?.dayHigh), tone: 'down' },
  ];
});

// Real day/52-week range (replaces the market-breadth panel, which has no free
// SET data feed).
const statsRows = computed(() => {
  const q = indexQuote.value;
  return [
    {
      icon: 'trending_up',
      tone: 'up',
      label: isThai.value ? 'สูงสุดวันนี้' : 'Day High',
      value: fmt(q?.dayHigh),
    },
    {
      icon: 'trending_down',
      tone: 'down',
      label: isThai.value ? 'ต่ำสุดวันนี้' : 'Day Low',
      value: fmt(q?.dayLow),
    },
    {
      icon: 'vertical_align_top',
      tone: 'info',
      label: isThai.value ? '52 สัปดาห์สูงสุด' : '52W High',
      value: fmt(q?.week52High),
    },
    {
      icon: 'vertical_align_bottom',
      tone: 'info',
      label: isThai.value ? '52 สัปดาห์ต่ำสุด' : '52W Low',
      value: fmt(q?.week52Low),
    },
  ];
});

/* ------------------------------------------------------------------ */
/* Popular stocks table                                                */
/* ------------------------------------------------------------------ */
interface PopularStock {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  support: number | null;
  resistance: number | null;
  valueMB: number | null;
  pe: number | null;
  eps: number | null;
  dividendPct: number | null;
}

// Real quotes for the popular Thai (SET) stocks, loaded on mount.
const popularStocks = ref<PopularStock[]>([]);

const loadPopular = async () => {
  try {
    const { data } = await api.get<PopularStock[]>('/stocks/popular-th');
    popularStocks.value = data ?? [];
  } catch (error) {
    console.error('Failed to load popular stocks:', error);
    popularStocks.value = [];
  }
};

/** Placeholder logo avatar — deterministic per symbol (shared with Watchlist / popular stocks). */
const avatarColor = symbolAvatarColor;
const avatarInitials = symbolAvatarInitials;

const goToStock = (symbol: string) => {
  void router.push(`/stock/${symbol}`);
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */
function formatMoney(value: number, digits = 2) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const signedPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${formatMoney(value)}%`;

/** Null-safe money format: null/undefined renders as an em dash. */
const fmt = (value: number | null | undefined, digits = 2) =>
  value == null ? '—' : formatMoney(value, digits);

/** Null-safe signed percent. */
const signedPct = (value: number | null | undefined) =>
  value == null ? '—' : signedPercent(value);
</script>

<template>
  <div class="market-overview" :class="{ 'market-overview--dark': isDark }">
    <!-- 2. Top metrics row -->
    <div class="mo-metrics">
      <article v-for="metric in metrics" :key="metric.key" class="mo-card mo-metric">
        <div class="mo-metric__title">{{ metric.title }}</div>
        <div class="mo-metric__value">{{ metric.value }}</div>
        <div class="mo-metric__unit">{{ metric.unit }}</div>
      </article>
    </div>

    <!-- 3. Market index chart -->
    <section class="mo-card mo-chart">
      <header class="mo-chart__header">
        <h2 class="mo-chart__title">{{ isThai ? 'ดัชนีตลาด' : 'Market Index' }}</h2>

        <div class="mo-timeframes" role="tablist">
          <button
            v-for="tf in TIMEFRAMES"
            :key="tf"
            type="button"
            role="tab"
            class="mo-timeframe"
            :class="{ 'mo-timeframe--active': activeTimeframe === tf }"
            :aria-selected="activeTimeframe === tf"
            @click="activeTimeframe = tf"
          >
            {{ tf }}
          </button>
        </div>

        <q-select
          v-model="selectedIndex"
          :options="indexOptions"
          dense
          borderless
          options-dense
          class="mo-index-select"
          popup-content-class="mo-index-select-popup"
        />

        <div class="mo-chart-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            class="mo-chart-toggle__btn"
            :class="{ 'mo-chart-toggle__btn--active': chartMode === 'new' }"
            :aria-selected="chartMode === 'new'"
            @click="chartMode = 'new'"
          >
            <q-icon name="auto_awesome" size="14px" />
            <q-tooltip>{{ isThai ? 'กราฟใหม่' : 'Beautiful chart' }}</q-tooltip>
          </button>
          <button
            type="button"
            role="tab"
            class="mo-chart-toggle__btn"
            :class="{ 'mo-chart-toggle__btn--active': chartMode === 'old' }"
            :aria-selected="chartMode === 'old'"
            @click="chartMode = 'old'"
          >
            <q-icon name="bar_chart" size="14px" />
            <q-tooltip>{{ isThai ? 'กราฟแท่งแบบเดิม' : 'Classic bar chart' }}</q-tooltip>
          </button>
        </div>
      </header>

      <div class="mo-chart__canvas">
        <LightweightAreaChart
          v-if="chartMode === 'new'"
          ref="chartRef"
          :data="chartData"
          :dark="isDark"
          :time-visible="chartTimeVisible"
        />
        <VueApexCharts
          v-else
          type="bar"
          height="320"
          :options="barOptions"
          :series="barSeries"
        />
      </div>
    </section>

    <!-- 4. Support/Resistance + Market breadth -->
    <div class="mo-mid-grid">
      <section class="mo-card mo-panel">
        <h3 class="mo-panel__title">
          {{ isThai ? 'แนวรับ - แนวต้าน' : 'Support - Resistance' }}
        </h3>
        <div
          v-for="row in srRows"
          :key="row.label"
          class="mo-row"
        >
          <span class="mo-row__label">{{ row.label }}</span>
          <span class="mo-row__value" :class="`mo-tone--${row.tone}`">
            {{ row.value }}
          </span>
        </div>
      </section>

      <section class="mo-card mo-panel">
        <h3 class="mo-panel__title">
          {{ isThai ? 'ช่วงราคา' : 'Price Range' }}
        </h3>
        <div
          v-for="row in statsRows"
          :key="row.label"
          class="mo-row"
        >
          <span class="mo-row__icon" :class="`mo-icon--${row.tone}`">
            <q-icon :name="row.icon" size="15px" />
          </span>
          <span class="mo-row__label">{{ row.label }}</span>
          <span class="mo-row__value" :class="`mo-tone--${row.tone}`">
            {{ row.value }}
          </span>
        </div>
      </section>
    </div>

    <!-- 5. Popular stocks table -->
    <section class="mo-card mo-popular">
      <h3 class="mo-panel__title mo-popular__title">
        {{ isThai ? 'หุ้นยอดนิยม' : 'Popular Stocks' }}
      </h3>

      <div class="mo-table-wrap">
        <table class="mo-table">
          <thead>
            <tr>
              <th class="is-left">{{ isThai ? 'หุ้น' : 'Symbol' }}</th>
              <th>{{ isThai ? 'ราคา' : 'Price' }}</th>
              <th>%</th>
              <th>{{ isThai ? 'แนวรับ' : 'Support' }}</th>
              <th>{{ isThai ? 'แนวต้าน' : 'Resistance' }}</th>
              <th>{{ isThai ? 'มูลค่าซื้อขาย' : 'Value' }}</th>
              <th>P/E</th>
              <th>EPS</th>
              <th>{{ isThai ? 'ปันผล (%)' : 'Div (%)' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="stock in popularStocks"
              :key="stock.symbol"
              class="mo-table__row"
              @click="goToStock(stock.symbol)"
            >
              <td class="is-left">
                <div class="mo-symbol">
                  <span class="mo-symbol__logo" :style="{ background: avatarColor(stock.symbol) }">
                    {{ avatarInitials(stock.symbol) }}
                  </span>
                  <span class="mo-symbol__meta">
                    <span class="mo-symbol__ticker">{{ stock.symbol }}</span>
                    <span class="mo-symbol__name">{{ stock.name }}</span>
                  </span>
                </div>
              </td>
              <td>
                <div class="mo-num mo-num--strong">{{ fmt(stock.price) }}</div>
                <div class="mo-subtext">
                  {{ isThai ? 'ก่อนตลาดเปิด' : 'Pre-market' }}
                  <span
                    class="mo-num--sub"
                    :class="(stock.preMarketChangePercent ?? 0) >= 0 ? 'mo-tone--up' : 'mo-tone--down'"
                  >
                    {{ fmt(stock.preMarketPrice) }}
                  </span>
                </div>
              </td>
              <td>
                <div
                  class="mo-num mo-num--strong"
                  :class="(stock.changePercent ?? 0) >= 0 ? 'mo-tone--up' : 'mo-tone--down'"
                >
                  {{ signedPct(stock.changePercent) }}
                </div>
                <div
                  class="mo-subtext mo-num--sub"
                  :class="(stock.preMarketChangePercent ?? 0) >= 0 ? 'mo-tone--up' : 'mo-tone--down'"
                >
                  {{ signedPct(stock.preMarketChangePercent) }}
                </div>
              </td>
              <td><span class="mo-num mo-tone--up">{{ fmt(stock.support) }}</span></td>
              <td><span class="mo-num mo-tone--down">{{ fmt(stock.resistance) }}</span></td>
              <td>
                <span class="mo-num">
                  {{ fmt(stock.valueMB, 0) }} {{ isThai ? 'ลบ.' : 'MB' }}
                </span>
              </td>
              <td><span class="mo-num">{{ fmt(stock.pe, 1) }}</span></td>
              <td><span class="mo-num">{{ fmt(stock.eps) }}</span></td>
              <td><span class="mo-num">{{ fmt(stock.dividendPct) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ==================================================================
   Light theme (default) with dark-mode overrides
================================================================== */
.market-overview {
  --mo-bg-card: #ffffff;
  --mo-bg-subtle: #f8fafc;
  --mo-text-primary: #101828;
  --mo-text-secondary: #667085;
  --mo-border: #e2e8f0;
  --mo-accent: #2563eb;
  --mo-accent-soft: rgba(37, 99, 235, 0.1);
  --mo-up: #16a34a;
  --mo-down: #dc2626;
  --mo-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);

  font-family: 'Inter', 'IBM Plex Sans Thai', 'Kanit', sans-serif;
  line-height: 1.5;
  color: var(--mo-text-primary);
}

.market-overview--dark {
  --mo-bg-card: #131a22;
  --mo-bg-subtle: #0f151d;
  --mo-text-primary: #e8edf4;
  --mo-text-secondary: #8b9cb3;
  --mo-border: #2a3544;
  --mo-accent-soft: rgba(37, 99, 235, 0.22);
  --mo-up: #22c55e;
  --mo-down: #ef4444;
  --mo-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.mo-card {
  background: var(--mo-bg-card);
  border: 1px solid var(--mo-border);
  border-radius: 12px;
  box-shadow: var(--mo-shadow);
}

/* ------------------------------------------------------------------
   2. Top metrics row
------------------------------------------------------------------ */
.mo-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.mo-metric {
  padding: 14px 16px;
  text-align: center;
}

.mo-metric__title {
  font-size: 12px;
  color: var(--mo-text-secondary);
  line-height: 1.5;
}

.mo-metric__value {
  font-size: 22px;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'IBM Plex Sans Thai', monospace;
  line-height: 1.5;
}

.mo-metric__unit {
  font-size: 12px;
  color: var(--mo-text-secondary);
  line-height: 1.5;
}

/* ------------------------------------------------------------------
   3. Chart section
------------------------------------------------------------------ */
.mo-chart {
  padding: 16px 16px 8px;
  margin-bottom: 16px;
}

.mo-chart__header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.mo-chart__title {
  font-size: 16px;
  font-weight: 800;
  margin: 0;
  line-height: 1.5;
}

.mo-timeframes {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: center;
  flex-wrap: wrap;
}

.mo-timeframe {
  border: none;
  background: transparent;
  color: var(--mo-text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.5;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.mo-timeframe:hover {
  background: var(--mo-bg-subtle);
}

.mo-timeframe--active {
  background: var(--mo-accent-soft);
  color: var(--mo-accent);
}

.mo-chart-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--mo-border);
  border-radius: 10px;
  background: var(--mo-bg-subtle);
}

.mo-chart-toggle__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--mo-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.mo-chart-toggle__btn:hover {
  color: var(--mo-text-primary);
}

.mo-chart-toggle__btn--active {
  background: var(--mo-bg-card);
  color: var(--mo-accent);
  box-shadow: var(--mo-shadow);
}

.mo-index-select {
  min-width: 92px;
  font-weight: 700;
  border: 1px solid var(--mo-border);
  border-radius: 8px;
  padding: 0 4px 0 12px;
  background: var(--mo-bg-card);
}

/* app.scss forces a --bg-tertiary background on q-field internals with
   !important — undo it here so the select follows the card theme. */
.market-overview .mo-index-select :deep(.q-field__control),
.market-overview .mo-index-select :deep(.q-field__native) {
  background-color: transparent !important;
  color: var(--mo-text-primary) !important;
  font-weight: 700 !important;
}

.market-overview .mo-index-select :deep(.q-field__append) {
  color: var(--mo-text-secondary) !important;
}

.mo-chart__canvas {
  height: 320px;
}

/* ------------------------------------------------------------------
   4. Support/Resistance + Market breadth
------------------------------------------------------------------ */
.mo-mid-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.mo-panel {
  padding: 16px 18px;
}

.mo-panel__title {
  font-size: 15px;
  font-weight: 800;
  margin: 0 0 6px;
  line-height: 1.5;
}

.mo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--mo-border);
}

.mo-row:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.mo-row__label {
  flex: 1;
  font-size: 13.5px;
  color: var(--mo-text-secondary);
  line-height: 1.5;
}

.mo-row__value {
  font-size: 14px;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'IBM Plex Sans Thai', monospace;
  line-height: 1.5;
  white-space: nowrap;
}

.mo-row__icon {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.mo-icon--up {
  background: rgba(22, 163, 74, 0.12);
  color: var(--mo-up);
}

.mo-icon--down {
  background: rgba(220, 38, 38, 0.1);
  color: var(--mo-down);
}

.mo-icon--flat {
  background: rgba(102, 112, 133, 0.12);
  color: var(--mo-text-secondary);
}

.mo-icon--info {
  background: var(--mo-accent-soft);
  color: var(--mo-accent);
}

.mo-tone--up {
  color: var(--mo-up);
}

.mo-tone--down {
  color: var(--mo-down);
}

.mo-tone--flat {
  color: var(--mo-text-secondary);
}

.mo-tone--info {
  color: var(--mo-accent);
}

/* ------------------------------------------------------------------
   5. Popular stocks table
------------------------------------------------------------------ */
.mo-popular {
  padding: 16px 0 6px;
}

.mo-popular__title {
  padding: 0 18px;
  margin-bottom: 10px;
}

.mo-table-wrap {
  overflow-x: auto;
}

.mo-table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
}

.mo-table th {
  font-size: 12px;
  font-weight: 700;
  color: var(--mo-text-secondary);
  text-align: right;
  padding: 8px 14px;
  border-bottom: 1px solid var(--mo-border);
  white-space: nowrap;
  line-height: 1.5;
}

.mo-table td {
  text-align: right;
  padding: 10px 14px;
  border-bottom: 1px solid var(--mo-border);
  white-space: nowrap;
  line-height: 1.5;
}

.mo-table th.is-left,
.mo-table td.is-left {
  text-align: left;
  padding-left: 18px;
}

.mo-table__row {
  cursor: pointer;
  transition: background 0.12s ease;
}

.mo-table__row:hover {
  background: var(--mo-bg-subtle);
}

.mo-table tbody tr:last-child td {
  border-bottom: none;
}

.mo-symbol {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mo-symbol__logo {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
}

.mo-symbol__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mo-symbol__ticker {
  font-size: 13.5px;
  font-weight: 800;
  line-height: 1.5;
}

.mo-symbol__name {
  font-size: 11.5px;
  color: var(--mo-text-secondary);
  line-height: 1.5;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mo-num {
  font-size: 13px;
  font-weight: 600;
  font-family: 'JetBrains Mono', 'IBM Plex Sans Thai', monospace;
  line-height: 1.5;
}

.mo-num--strong {
  font-weight: 800;
}

.mo-num--sub {
  font-size: 11.5px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'IBM Plex Sans Thai', monospace;
}

.mo-subtext {
  font-size: 11px;
  color: var(--mo-text-secondary);
  line-height: 1.5;
}

/* ------------------------------------------------------------------
   Responsive
------------------------------------------------------------------ */
@media (max-width: 900px) {
  .mo-metrics {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 700px) {
  .mo-metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  .mo-mid-grid {
    grid-template-columns: 1fr;
  }

  .mo-chart__header {
    gap: 8px;
  }

  .mo-timeframes {
    order: 3;
    flex-basis: 100%;
    justify-content: flex-start;
  }

  .mo-chart__canvas {
    height: 260px;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, computed } from 'vue';
import type { IChartApi, IPriceLine } from 'lightweight-charts';
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';
import { useAssetStore } from 'stores/AssetStore';
import { useQuasar } from 'quasar';

const $q = useQuasar();
const assetStore = useAssetStore();

// ==========================================
// 📊 Chart Logic
// ==========================================
const chartContainer = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candlestickSeries: any = null;

// เก็บตัวแปรเส้นแนวรับ/แนวต้าน เพื่อเอาไว้ลบทิ้งเวลาเปลี่ยนเหรียญ
let supportLine: IPriceLine | null = null;
let resistanceLine: IPriceLine | null = null;

const currentTab = ref('chart'); // 'chart' | 'financial'
const selectedInterval = ref<'1d' | '1wk' | '1mo'>('1d');

// สร้างกราฟ
const initChart = () => {
  if (!chartContainer.value) return;

  chart = createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth || 600,
    height: 500,
    layout: {
      background: { color: 'transparent' },
      textColor: '#94a3b8',
    },
    grid: {
      vertLines: { color: 'rgba(148, 163, 184, 0.1)' },
      horzLines: { color: 'rgba(148, 163, 184, 0.1)' },
    },
    crosshair: { mode: 0 },
    timeScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
  });

  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#10b981',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
  });

  const handleResize = () => {
    if (chart && chartContainer.value) {
      chart.applyOptions({ width: chartContainer.value.clientWidth });
    }
  };
  window.addEventListener('resize', handleResize);
};

// 🟢 ฟังก์ชันตีเส้นแนวรับ/แนวต้าน
const drawSupportResistance = () => {
  if (!candlestickSeries || assetStore.chartData.length === 0) return;

  // ลบเส้นเก่าทิ้งก่อน ป้องกันการวาดซ้อนกัน
  if (supportLine) candlestickSeries.removePriceLine(supportLine);
  if (resistanceLine) candlestickSeries.removePriceLine(resistanceLine);

  const data = assetStore.chartData;
  const lookback = Math.min(30, data.length); // ดูย้อนหลัง 30 แท่ง
  const recentData = data.slice(-lookback);

  const maxHigh = Math.max(...recentData.map((d) => d.high));
  const minLow = Math.min(...recentData.map((d) => d.low));

  // วาดเส้นแนวต้าน (Resistance) - สีแดง
  resistanceLine = candlestickSeries.createPriceLine({
    price: maxHigh,
    color: '#ef4444',
    lineWidth: 2,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: 'RES',
  });

  // วาดเส้นแนวรับ (Support) - สีเขียว
  supportLine = candlestickSeries.createPriceLine({
    price: minLow,
    color: '#10b981',
    lineWidth: 2,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: 'SUP',
  });
};

// อัปเดตข้อมูลกราฟเมื่อเปลี่ยน Asset
const updateChartData = () => {
  if (candlestickSeries && assetStore.chartData.length > 0) {
    candlestickSeries.setData(assetStore.chartData as any);
    drawSupportResistance(); // สั่งตีเส้นใหม่
    chart?.timeScale().fitContent();
  }
};

onMounted(async () => {
  await assetStore.fetchAssets();
  initChart();
  if (assetStore.activeAsset) {
    await assetStore.setActiveAsset(assetStore.activeAsset);
    updateChartData();
  }
});

// ดักฟังการเปลี่ยนคู่เงิน
watch(
  () => assetStore.activeAsset,
  async (newAsset) => {
    if (newAsset) {
      await assetStore.setActiveAsset(newAsset);
      updateChartData();
    }
  },
);

onUnmounted(() => {
  if (chart) chart.remove();
});

// ==========================================
// 📈 Computed Logic (คำนวณข้อมูล Real-time)
// ==========================================

// คำนวณราคาล่าสุดและเปอร์เซ็นต์เปลี่ยนแปลง
const currentPriceInfo = computed(() => {
  const data = assetStore.chartData;
  if (data && data.length > 0) {
    const current = data[data.length - 1].close;
    const previous = data.length > 1 ? data[data.length - 2].close : current;

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

// ตรวจจับ Pattern พื้นฐาน
const detectedPattern = computed(() => {
  const data = assetStore.chartData;
  if (!data || data.length < 2) return 'Scanning...';

  const curr = data[data.length - 1];
  const prev = data[data.length - 2];

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
    const diff = data[i].close - data[i - 1].close;
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
          World market data & AI technical analysis
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
              :options="[
                { label: '1D', value: '1d' },
                { label: '1W', value: '1wk' },
                { label: '1M', value: '1mo' },
              ]"
              @update:model-value="
                (val) => assetStore.fetchChartData(assetStore.activeAsset!.symbol, val)
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
            <div class="ai-pattern-badge">
              <q-icon name="auto_awesome" color="warning" /> AI Detected:
              <b>{{ detectedPattern }}</b>
            </div>
          </div>

          <div class="chart-wrapper relative-position">
            <div ref="chartContainer" class="full-width" style="height: 500px"></div>
            <div v-if="assetStore.isLoading" class="absolute-full flex flex-center bg-overlay">
              <q-spinner-dots color="primary" size="4em" />
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
.ai-pattern-badge {
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

.rounded-input :deep(.q-field__control) {
  border-radius: 12px !important;
}
</style>

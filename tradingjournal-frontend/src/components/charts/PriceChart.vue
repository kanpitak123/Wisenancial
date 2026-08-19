<script setup lang="ts">
/**
 * กราฟราคาบน lightweight-charts (Apache-2.0, ฟรี ไม่ต้องขอ license)
 *
 * คนละตัวกับ TradingView Charting Library ตัวเต็มที่ต้องยื่นขอสิทธิ์ใช้งาน
 *
 * ตัวไลบรารีวาดลง canvas ทั้งหมด เทส jsdom จึงมองไม่เห็นเนื้อกราฟ — ตรรกะที่ต้องคุม
 * ด้วยเทสถูกดันออกไปไว้ที่ src/utils/price-chart.ts (ฟังก์ชันล้วน) ส่วนไฟล์นี้เหลือแค่
 * การผูก props เข้ากับ API ของไลบรารี
 */
import { onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  CandlestickSeries,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type {
  CandlestickPoint,
  OverlaySpec,
  PriceLineSpec,
} from 'src/utils/price-chart';

const props = withDefaults(
  defineProps<{
    bars: CandlestickPoint[];
    displayType: 'candlestick' | 'line';
    priceLines?: PriceLineSpec[];
    overlays?: OverlaySpec[];
    height?: number;
    /** interval ระดับชั่วโมง -> แกนเวลาต้องโชว์เวลาไม่ใช่แค่วันที่ */
    intraday?: boolean;
  }>(),
  {
    priceLines: () => [],
    overlays: () => [],
    height: 620,
    intraday: false,
  },
);

const $q = useQuasar();

const container = ref<HTMLDivElement | null>(null);

// shallowRef: object ของไลบรารีเป็น instance ที่มี state ภายในเยอะมาก
// ถ้าให้ Vue ทำ deep reactive ทับจะทั้งช้าและพังได้
const chart = shallowRef<IChartApi | null>(null);
const mainSeries = shallowRef<ISeriesApi<SeriesType> | null>(null);
const overlaySeries = shallowRef(new Map<string, ISeriesApi<'Line'>>());
const priceLineHandles = shallowRef<IPriceLine[]>([]);

const asTime = (time: number): Time => time as UTCTimestamp;

const toSeriesData = (bars: CandlestickPoint[]) =>
  props.displayType === 'line'
    ? bars.map((bar): LineData => ({ time: asTime(bar.time), value: bar.close }))
    : bars.map(
        (bar): CandlestickData => ({
          time: asTime(bar.time),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }),
      );

function createMainSeries() {
  const instance = chart.value;

  if (!instance) return;

  if (mainSeries.value) {
    instance.removeSeries(mainSeries.value);
    mainSeries.value = null;
    priceLineHandles.value = [];
  }

  mainSeries.value =
    props.displayType === 'line'
      ? instance.addSeries(LineSeries, {
          color: '#22c55e',
          lineWidth: 2,
          priceLineVisible: false,
        })
      : instance.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderUpColor: '#22c55e',
          borderDownColor: '#ef4444',
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
          priceLineVisible: false,
        });

  mainSeries.value.setData(toSeriesData(props.bars));
  applyPriceLines();
}

function applyPriceLines() {
  const series = mainSeries.value;

  if (!series) return;

  for (const handle of priceLineHandles.value) {
    series.removePriceLine(handle);
  }

  priceLineHandles.value = props.priceLines
    .filter((line) => Number.isFinite(line.price) && line.price > 0)
    .map((line) =>
      series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: line.title,
        lineVisible: true,
        axisLabelColor: line.color,
        axisLabelTextColor: '#0f172a',
      }),
    );
}

function applyOverlays() {
  const instance = chart.value;

  if (!instance) return;

  const existing = overlaySeries.value;
  const nextIds = new Set(props.overlays.map((overlay) => overlay.id));

  for (const [id, series] of existing) {
    if (!nextIds.has(id)) {
      instance.removeSeries(series);
      existing.delete(id);
    }
  }

  for (const overlay of props.overlays) {
    let series = existing.get(overlay.id);

    if (!series) {
      series = instance.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: overlay.lineWidth ?? 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: overlay.title,
      });

      existing.set(overlay.id, series);
    }

    series.setData(
      overlay.points.map((point): LineData => ({
        time: asTime(point.time),
        value: point.value,
      })),
    );
  }
}

/**
 * เดิมสีของกราฟถูกฮาร์ดโค้ดเป็นโทนกรม (#0f172a / #1e293b) ชุดเดียวใช้ทั้งสองธีม
 * พอเปิดโหมดสว่างจึงกลายเป็นสี่เหลี่ยมสีเข้มวางอยู่กลางการ์ดสีอ่อน
 * ตอนนี้อ่านจากธีมปัจจุบัน โดยใช้ค่าชุดเดียวกับ --bg-card / --border-color ของแอป
 */
function chartTheme() {
  return $q.dark.isActive
    ? { background: '#1f2323', text: '#b7c2bf', line: '#2c3434', border: '#394141' }
    : { background: '#fdfefe', text: '#496565', line: '#e7f4f2', border: '#dae7e5' };
}

function buildChart() {
  if (!container.value) return;

  const theme = chartTheme();

  chart.value = createChart(container.value, {
    autoSize: true,
    height: props.height,
    layout: {
      background: { color: theme.background },
      textColor: theme.text,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.line },
      horzLines: { color: theme.line },
    },
    rightPriceScale: {
      borderColor: theme.border,
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: props.intraday,
      secondsVisible: false,
      rightOffset: 6,
    },
    crosshair: { mode: CrosshairMode.Magnet },
    // pan/zoom เป็นค่าเริ่มต้นของไลบรารีอยู่แล้ว ระบุไว้ให้ชัดว่าตั้งใจเปิด
    // เพื่อให้เลื่อนดูกราฟย้อนหลังได้ (ของเดิมบน ApexCharts เลื่อนไม่ได้)
    handleScroll: true,
    handleScale: true,
  });

  createMainSeries();
  applyOverlays();
  chart.value.timeScale().fitContent();
}

function destroyChart() {
  chart.value?.remove();
  chart.value = null;
  mainSeries.value = null;
  overlaySeries.value = new Map();
  priceLineHandles.value = [];
}

/**
 * อัปเดตแท่งล่าสุดจากราคาสด — ใช้ series.update() ไม่ใช่ setData()
 * เพราะ update() ไม่ไปยุ่งกับตำแหน่งที่ผู้ใช้เลื่อน/ซูมกราฟค้างไว้
 */
function applyLiveBar(bar: CandlestickPoint) {
  const series = mainSeries.value;

  if (!series) return;

  series.update(
    props.displayType === 'line'
      ? ({ time: asTime(bar.time), value: bar.close } satisfies LineData)
      : ({
          time: asTime(bar.time),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        } satisfies CandlestickData),
  );
}

defineExpose({ applyLiveBar });

onMounted(buildChart);
onBeforeUnmount(destroyChart);

// สลับ candlestick <-> line: ไลบรารีเปลี่ยนชนิด series กลางคันไม่ได้ ต้องสร้างใหม่
watch(() => props.displayType, createMainSeries);

watch(
  () => props.bars,
  (bars) => {
    mainSeries.value?.setData(toSeriesData(bars));
    chart.value?.timeScale().fitContent();
  },
);

watch(() => props.priceLines, applyPriceLines, { deep: true });
watch(() => props.overlays, applyOverlays, { deep: true });

// สลับธีมแล้วทาสีกราฟใหม่ด้วย applyOptions — ไม่สร้างกราฟใหม่ทั้งตัว
// ผู้ใช้จึงไม่เสียตำแหน่งที่เลื่อน/ซูมไว้ และไม่เสี่ยงเจอ instance ที่ถูก dispose ค้าง
watch(
  () => $q.dark.isActive,
  () => {
    const theme = chartTheme();

    chart.value?.applyOptions({
      layout: { background: { color: theme.background }, textColor: theme.text },
      grid: { vertLines: { color: theme.line }, horzLines: { color: theme.line } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
    });
  },
);

watch(
  () => props.intraday,
  (intraday) => chart.value?.timeScale().applyOptions({ timeVisible: intraday }),
);
</script>

<template>
  <div
    ref="container"
    class="price-chart"
    :style="{ height: `${height}px` }"
    data-test="price-chart"
  />
</template>

<style scoped>
.price-chart {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
}
</style>

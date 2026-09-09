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
  type LogicalRange,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  isPrependUpdate,
  type CandlestickPoint,
  type OverlaySpec,
  type PriceLineSpec,
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

/**
 * ยิงตอนผู้ใช้เลื่อนกราฟใกล้ขอบซ้าย (ใกล้แท่งแรกที่โหลดไว้) — บอกผู้เรียกว่าถึงเวลาโหลด
 * ประวัติเก่ากว่าเพิ่ม ผู้เรียกเป็นคนตัดสินใจว่าจะยิง/ไม่ยิง (เช่นกำลังโหลดอยู่แล้ว หรือ
 * รู้อยู่แล้วว่าหมดประวัติแล้ว) — ที่นี่แค่ debounce การยิงเอง ไม่ทำอะไรมากกว่านั้น
 */
const emit = defineEmits<{ needOlderHistory: [] }>();

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
    //
    // handleScale.mouseWheel ปิดไว้โดยเฉพาะ (ต่างจากค่า default ของไลบรารี) — ยืนยันแล้วว่า
    // เป็นสาเหตุของบั๊ก "ซูมเลื่อนไปเรื่อยๆ เวลาโต้ตอบซ้ำๆ": กราฟฝังอยู่ในหน้าที่เลื่อน
    // (scroll) ได้ตามปกติ ไม่ใช่ panel ที่ตรึงความสูงไว้ ดังนั้น wheel event เดียวกันที่ผู้ใช้
    // ใช้เลื่อนหน้าเว็บผ่านตัวกราฟ จะถูกไลบรารีตีความเป็นคำสั่งซูมไปพร้อมกันด้วย (ค่า default
    // handleScale: true เปิด mouseWheel ไว้) สองพฤติกรรมนี้ไม่ได้หักล้างกันพอดี ซูมจึงลอย/สะสม
    // ไปเรื่อยๆ ทุกครั้งที่ผู้ใช้เลื่อนเมาส์วีลผ่านกราฟ — reproduce และยืนยันสาเหตุ+วิธีแก้ผ่าน
    // instrumentation จริงบน timeScale().subscribeVisibleLogicalRangeChange() แล้ว (ปิด
    // mouseWheel อย่างเดียว, ลาก pinch/axisPressedMouseMove ไว้ตามเดิม, ทดสอบ scroll วน 8+
    // รอบ ไม่มี drift เลย ส่วนลาก-แพนแนวนอนยังทำงานปกติทุกอย่าง)
    handleScroll: true,
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
  });

  createMainSeries();
  applyOverlays();
  chart.value.timeScale().fitContent();
  chart.value.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
}

/**
 * ใกล้ขอบซ้ายของแท่งที่โหลดไว้ (from ~ 0, ติดลบได้ถ้าเลื่อนเลยขอบไปแล้ว) -> ขอประวัติ
 * เก่ากว่าเพิ่ม — debounce ไว้เพราะ event นี้ยิงถี่มากระหว่างลาก (นับได้ 50+ ครั้งต่อการลาก
 * หนึ่งครั้งจากการทดสอบจริง) ไม่งั้นจะยิง request ซ้อนกันรัวๆ กลางที่ผู้ใช้กำลังลากอยู่
 *
 * ผู้เรียก (StockAnalysisPage) เป็นคนตัดสินใจว่าจะยิง fetch จริงมั้ย (เช่นกำลังโหลดอยู่แล้ว
 * หรือรู้อยู่แล้วว่าหมดประวัติแล้ว) — ที่นี่แค่ debounce การยิง event เอง
 */
const HISTORY_EDGE_THRESHOLD_BARS = 10;
const HISTORY_EDGE_DEBOUNCE_MS = 150;
let historyEdgeTimer: ReturnType<typeof setTimeout> | null = null;

function handleVisibleLogicalRangeChange(range: LogicalRange | null) {
  if (!range || range.from > HISTORY_EDGE_THRESHOLD_BARS) return;

  if (historyEdgeTimer !== null) clearTimeout(historyEdgeTimer);
  historyEdgeTimer = setTimeout(() => {
    historyEdgeTimer = null;
    emit('needOlderHistory');
  }, HISTORY_EDGE_DEBOUNCE_MS);
}

function destroyChart() {
  if (historyEdgeTimer !== null) {
    clearTimeout(historyEdgeTimer);
    historyEdgeTimer = null;
  }
  chart.value?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
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
  (bars, oldBars) => {
    const series = mainSeries.value;

    if (!series) return;

    // โหลดประวัติเก่ากว่าเพิ่มตอนผู้ใช้เลื่อนกราฟถึงขอบ (lazy-load) — ต้องรักษาตำแหน่งที่
    // เลื่อน/ซูมค้างไว้ เหมือนที่ applyLiveBar() ทำกับราคาสด ไม่ใช่แค่ setData() แล้ว
    // fitContent() ทับตำแหน่งเดิมทิ้ง (setData() เลื่อน/ซูมกลับไปที่ค่าเริ่มต้นเองเสมอ)
    if (oldBars && isPrependUpdate(oldBars, bars)) {
      const range = chart.value?.timeScale().getVisibleLogicalRange();
      const shift = bars.length - oldBars.length;

      series.setData(toSeriesData(bars));

      if (range) {
        chart.value?.timeScale().setVisibleLogicalRange({
          from: range.from + shift,
          to: range.to + shift,
        });
      }

      return;
    }

    // เปลี่ยนหุ้น/timeframe หรือชุดข้อมูลใหม่ทั้งหมด — fitContent() ทับเป็นพฤติกรรมที่ถูก
    series.setData(toSeriesData(bars));
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

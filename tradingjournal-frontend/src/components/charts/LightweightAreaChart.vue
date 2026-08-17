<script setup lang="ts">
/**
 * Thin wrapper around TradingView's lightweight-charts (v5).
 * Renders a single area series (blue line + blue gradient fill) with the
 * price scale on the right axis, sized to its parent via `autoSize`.
 *
 * Real-time updates should go through `updateBar()` (series.update) —
 * never by replacing `data` — so the chart stays stable while ticking.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AreaSeries,
  ColorType,
  createChart,
  type AreaData,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type TimeChartOptions,
} from 'lightweight-charts';

const props = withDefaults(
  defineProps<{
    data: AreaData<Time>[];
    dark?: boolean;
    /** Show intraday times on the x-axis (1D / 1W views). */
    timeVisible?: boolean;
  }>(),
  { dark: false, timeVisible: false },
);

const chartContainer = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let series: ISeriesApi<'Area'> | null = null;

const LINE_COLOR = '#2563eb';

const chartOptions = (): DeepPartial<TimeChartOptions> => ({
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: props.dark ? '#8b9cb3' : '#667085',
    fontFamily: "'Inter', 'IBM Plex Sans Thai', sans-serif",
  },
  grid: {
    vertLines: { visible: false },
    horzLines: {
      color: props.dark ? 'rgba(139, 156, 179, 0.12)' : 'rgba(16, 24, 40, 0.06)',
    },
  },
  rightPriceScale: {
    borderVisible: false,
    scaleMargins: { top: 0.12, bottom: 0.08 },
  },
  timeScale: {
    borderVisible: false,
    timeVisible: props.timeVisible,
    secondsVisible: false,
  },
  crosshair: {
    vertLine: { color: LINE_COLOR, labelBackgroundColor: LINE_COLOR },
    horzLine: { color: LINE_COLOR, labelBackgroundColor: LINE_COLOR },
  },
  handleScroll: { mouseWheel: false },
  handleScale: { mouseWheel: false, pinch: false },
});

onMounted(() => {
  if (!chartContainer.value) return;

  chart = createChart(chartContainer.value, chartOptions());
  series = chart.addSeries(AreaSeries, {
    lineColor: LINE_COLOR,
    lineWidth: 2,
    topColor: 'rgba(37, 99, 235, 0.28)',
    bottomColor: 'rgba(37, 99, 235, 0.02)',
    priceLineVisible: false,
  });
  series.setData(props.data);
  chart.timeScale().fitContent();
});

watch(
  () => props.data,
  (data) => {
    if (!chart || !series) return;
    series.setData(data);
    chart.timeScale().fitContent();
  },
);

watch([() => props.dark, () => props.timeVisible], () => {
  chart?.applyOptions(chartOptions());
});

/** Push a single real-time tick (same or newer timestamp than the last bar). */
const updateBar = (bar: AreaData<Time>) => {
  series?.update(bar);
};

defineExpose({ updateBar });

onBeforeUnmount(() => {
  chart?.remove();
  chart = null;
  series = null;
});
</script>

<template>
  <div ref="chartContainer" class="lw-chart" />
</template>

<style scoped>
.lw-chart {
  width: 100%;
  height: 100%;
  min-height: 220px;
}
</style>

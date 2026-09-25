import { computed, ref, watch, type Ref } from 'vue';
import { sortedUniqueByTime, type CandlestickPoint } from 'src/utils/price-chart';

/**
 * Lazy-load-on-pan guard + merge logic, extracted from StockAnalysisPage.vue's
 * onNeedOlderHistory()/loadingOlderHistory/exhaustedHistoryKey so Forex Asset Explorer
 * can share the exact same behavior instead of a second hand-rolled copy — see
 * forex-chart-parity-investigation.md §5.
 *
 * What stays OUT of this composable (already shared for free, nothing to extract):
 * PriceChart.vue itself owns the visible-range subscription, the debounced edge
 * detection, and the position-preserving prepend update (isPrependUpdate + logical
 * range shift) — both pages use the same component, so that part needs no extraction.
 */
export interface UseOlderHistoryLoaderOptions {
  /** Resets loaded-older-bars/exhausted state whenever this changes (e.g. `${symbol}:${timeframe}`). */
  requestKey: Ref<string>;
  /** Fetch bars strictly before `before`. Return [] (not throw) once the provider's history boundary is hit. */
  fetchOlder: (before: Date) => Promise<CandlestickPoint[]>;
  /** Called on a genuine fetch failure — mirrors the original's "silent, console.error only" behavior by default. */
  onError?: (error: unknown) => void;
}

export function useOlderHistoryLoader(
  baseBars: Ref<CandlestickPoint[]>,
  options: UseOlderHistoryLoaderOptions,
) {
  const olderBars = ref<CandlestickPoint[]>([]);
  const loading = ref(false);
  const exhaustedKey = ref<string | null>(null);

  const bars = computed<CandlestickPoint[]>(() =>
    sortedUniqueByTime([...olderBars.value, ...baseBars.value]),
  );

  watch(options.requestKey, () => {
    olderBars.value = [];
    exhaustedKey.value = null;
    // ค้างจากคำขอเก่าที่อาจยังไม่ finally เสร็จ — เช็ค key ก่อนเขียนทับอยู่แล้วในตัว
    // loadOlder() เอง แต่รีเซ็ตธงตรงนี้ด้วยกันธงค้าง true ถ้าสลับ symbol/timeframe
    // กลางคันตอนกำลังโหลดอยู่
    loading.value = false;
  });

  async function loadOlder() {
    const key = options.requestKey.value;

    if (loading.value || exhaustedKey.value === key) return;

    const earliest = bars.value[0];
    if (!earliest) return;

    loading.value = true;

    try {
      const before = new Date(earliest.time * 1000);
      const older = await options.fetchOlder(before);

      // เปลี่ยน symbol/timeframe ไปแล้วระหว่างรอ -> ทิ้งผล ไม่ใช่ของช่วงนี้แล้ว
      if (key !== options.requestKey.value) return;

      const hasNewOlderBars = older.some((point) => point.time < earliest.time);

      if (!hasNewOlderBars) {
        // ไม่มีแท่งไหนเก่ากว่าที่มีอยู่แล้วจริงๆ = เจอขอบเขตข้อมูลเก่าสุดแล้ว — หยุดขอเพิ่ม
        exhaustedKey.value = key;
        return;
      }

      olderBars.value = sortedUniqueByTime([...older, ...olderBars.value]);
    } catch (error) {
      // เงียบ ไม่ notify — นี่คือ background pagination ตอนผู้ใช้แค่เลื่อนกราฟ ไม่ใช่การกระทำ
      // ที่ผู้ใช้เพิ่งสั่งตรงๆ ป๊อปอัป error ตรงนี้จะน่ารำคาญเกินไป (เลื่อนอีกทีก็ลองใหม่ได้เอง)
      if (options.onError) {
        options.onError(error);
      } else {
        console.error('Failed to fetch older history:', error);
      }
    } finally {
      if (key === options.requestKey.value) {
        loading.value = false;
      }
    }
  }

  return { bars, loading, loadOlder };
}

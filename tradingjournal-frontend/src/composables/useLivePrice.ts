import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { api } from 'boot/axios';

/**
 * ราคาล่าสุดที่ backend คืนมาจากแคชกลาง (GET /market/quotes/realtime)
 *
 * สำคัญ: ห้ามยิง Yahoo Finance จาก client ตรง ๆ — backend มีแคชอายุ 12 วิที่ใช้ร่วมกัน
 * ทุก client ที่ดูหุ้นตัวเดียวกัน ถ้าแต่ละเครื่องยิงเองจะโดน rate limit ของ Yahoo เร็วมาก
 * (Yahoo ฟรีไม่ประกาศ limit ไว้ และไม่มี websocket ให้ใช้ นี่จึงเป็นการ refresh เป็นช่วง ๆ
 * ไม่ใช่ streaming จริง)
 */
export interface LiveQuote {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  volume: number | null;
  marketState: string | null;
  asOf: string;
}

export interface UseLivePriceOptions {
  /** ระยะห่างระหว่างรอบ poll (มิลลิวินาที) — ต่ำกว่านี้ไม่มีประโยชน์เพราะแคชหลังบ้าน 12 วิ */
  intervalMs?: number;
  /** ปิดการ poll ทั้งหมด (เช่น หน้ายังโหลดข้อมูลตั้งต้นไม่เสร็จ) */
  enabled?: Ref<boolean>;
}

const DEFAULT_INTERVAL_MS = 15_000;

export function useLivePrice(
  symbol: Ref<string | null | undefined>,
  options: UseLivePriceOptions = {},
) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const enabled = options.enabled;

  const quote = ref<LiveQuote | null>(null);
  const isPolling = ref(false);
  /** จริงเมื่อแท็บถูกซ่อนอยู่ — หยุด poll เพื่อไม่ให้เปลืองทั้งเครื่องผู้ใช้และโควต้า Yahoo */
  const isPaused = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;
  /** กันรอบที่ยิงช้าตอบกลับมาทับรอบที่ใหม่กว่า หรือทับหุ้นตัวที่ผู้ใช้เปลี่ยนไปแล้ว */
  let requestSeq = 0;

  const canPoll = (): boolean =>
    Boolean(symbol.value) && (enabled?.value ?? true) && !isPaused.value;

  async function fetchOnce(): Promise<LiveQuote | null> {
    const target = symbol.value;

    if (!target) return null;

    const seq = ++requestSeq;

    try {
      const response = await api.get<LiveQuote[]>('/market/quotes/realtime', {
        params: { symbols: target.toUpperCase() },
      });

      // ตอบช้ากว่ารอบถัดไป หรือผู้ใช้เปลี่ยนหุ้นไปแล้ว -> ทิ้งผลนี้
      if (seq !== requestSeq || symbol.value?.toUpperCase() !== target.toUpperCase()) {
        return null;
      }

      const next = response.data?.[0] ?? null;

      if (next) {
        quote.value = next;
      }

      return next;
    } catch {
      // ราคาสดพังไม่ควรทำให้หน้าพัง — คงค่าล่าสุดที่มีไว้เงียบ ๆ แล้วลองใหม่รอบหน้า
      return null;
    }
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }

    isPolling.value = false;
  }

  function start() {
    stop();

    if (!canPoll()) return;

    isPolling.value = true;
    void fetchOnce();

    timer = setInterval(() => {
      if (!canPoll()) {
        stop();
        return;
      }

      void fetchOnce();
    }, intervalMs);
  }

  function handleVisibilityChange() {
    isPaused.value = document.visibilityState === 'hidden';

    if (isPaused.value) {
      stop();
      return;
    }

    // กลับมาที่แท็บแล้วราคาที่ค้างอยู่เก่าไปแล้ว — ดึงทันทีไม่ต้องรอครบรอบ
    start();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    isPaused.value = document.visibilityState === 'hidden';
  }

  watch(
    () => [symbol.value, enabled?.value],
    () => {
      // เปลี่ยนหุ้นแล้วราคาของตัวเก่าใช้ไม่ได้ ต้องล้างก่อนไม่งั้นหัวกราฟโชว์ราคาผิดตัวชั่วครู่
      quote.value = null;
      start();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stop();

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  return {
    quote,
    isPolling,
    isPaused,
    refresh: fetchOnce,
    start,
    stop,
  };
}

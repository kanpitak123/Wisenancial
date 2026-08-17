/**
 * ตัวแปลงข้อมูลราคาให้อยู่ในรูปที่ lightweight-charts รับ
 *
 * แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้เทสได้โดยไม่ต้องเรนเดอร์ canvas จริง
 * (lightweight-charts วาดลง canvas ทั้งหมด เทส jsdom มองไม่เห็นอะไรอยู่แล้ว)
 *
 * lightweight-charts บังคับสองข้อกับทุก series: เวลาต้องเรียงจากน้อยไปมาก
 * และห้ามมีเวลาซ้ำ ไม่งั้นจะ throw ตอน setData — ตัวแปลงในไฟล์นี้การันตีทั้งสองข้อ
 */

/** วินาที (ไม่ใช่มิลลิวินาที) ตามที่ UTCTimestamp ของไลบรารีกำหนด */
export type ChartTime = number;

export interface PriceBarInput {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandlestickPoint {
  time: ChartTime;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LinePoint {
  time: ChartTime;
  value: number;
}

/** เส้นแนวนอนคงที่ (support / resistance) — วาดด้วย createPriceLine() ของไลบรารี */
export interface PriceLineSpec {
  price: number;
  color: string;
  title: string;
}

/** เส้นทับกราฟที่เคลื่อนไปตามเวลา (EMA, รูปแบบที่ตรวจพบ) */
export interface OverlaySpec {
  id: string;
  title: string;
  color: string;
  points: LinePoint[];
  lineWidth?: 1 | 2 | 3 | 4;
}

export function toChartTime(date: string | number | Date): ChartTime | null {
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();

  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

const round2 = (value: number): number => Number(Number(value).toFixed(2));

const isUsableNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * เรียงตามเวลาและตัดเวลาซ้ำ (เก็บอันหลังสุดของเวลานั้น ๆ ไว้)
 *
 * Yahoo ส่งแท่งซ้ำเวลาเดิมมาได้ในบางช่วง interval ถ้าปล่อยผ่านไป setData จะ throw
 * แล้วกราฟหายทั้งอัน
 */
function sortedUniqueByTime<T extends { time: ChartTime }>(points: T[]): T[] {
  const byTime = new Map<ChartTime, T>();

  for (const point of points) {
    byTime.set(point.time, point);
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function toCandlestickData(bars: PriceBarInput[]): CandlestickPoint[] {
  const points: CandlestickPoint[] = [];

  for (const bar of bars) {
    const time = toChartTime(bar.date);

    if (
      time === null ||
      !isUsableNumber(bar.open) ||
      !isUsableNumber(bar.high) ||
      !isUsableNumber(bar.low) ||
      !isUsableNumber(bar.close)
    ) {
      continue;
    }

    points.push({
      time,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
    });
  }

  return sortedUniqueByTime(points);
}

export function toLineData(bars: PriceBarInput[]): LinePoint[] {
  const points: LinePoint[] = [];

  for (const bar of bars) {
    const time = toChartTime(bar.date);

    if (time === null || !isUsableNumber(bar.close)) continue;

    points.push({ time, value: round2(bar.close) });
  }

  return sortedUniqueByTime(points);
}

/**
 * ซีรีส์เส้นทับกราฟ (EMA) — backend ส่งมาเป็น array ที่ index ตรงกับแท่งราคา
 * ช่วงต้นที่ยังคำนวณไม่ได้เป็น null ต้องตัดทิ้ง ไม่ใช่แปลงเป็น 0
 */
export function toOverlayData(
  bars: PriceBarInput[],
  values: (number | null)[] | undefined,
): LinePoint[] {
  if (!values?.length) return [];

  const points: LinePoint[] = [];

  bars.forEach((bar, index) => {
    const value = values[index];
    const time = toChartTime(bar.date);

    if (time === null || !isUsableNumber(value)) return;

    points.push({ time, value: round2(value) });
  });

  return sortedUniqueByTime(points);
}

/** จุดของรูปแบบกราฟที่ตรวจพบ (Double Top/Bottom ฯลฯ) มาเป็นพิกัดของตัวเอง ไม่อิง index */
export function toPatternData(
  coordinates: { date: string; price: number }[] | undefined,
): LinePoint[] {
  if (!coordinates?.length) return [];

  const points: LinePoint[] = [];

  for (const coordinate of coordinates) {
    const time = toChartTime(coordinate.date);

    if (time === null || !isUsableNumber(coordinate.price)) continue;

    points.push({ time, value: round2(coordinate.price) });
  }

  return sortedUniqueByTime(points);
}

/**
 * รวมราคาล่าสุดเข้ากับแท่งสุดท้ายของกราฟ
 *
 * คืน null ถ้าไม่มีอะไรให้อัปเดต — ผู้เรียกจะได้ไม่สั่งวาดซ้ำโดยเปล่าประโยชน์
 * หมายเหตุ: ฟังก์ชันนี้ "แก้แท่งเดิม" อย่างเดียว ไม่สร้างแท่งใหม่ การขึ้นวันเทรดใหม่
 * ให้ใช้ isNewerTradingDay() แล้วโหลดประวัติใหม่แทน จะได้ไม่ต้องเดา open ของแท่งใหม่เอง
 */
export function mergeLivePrice(
  lastBar: CandlestickPoint | undefined,
  price: number | null | undefined,
): CandlestickPoint | null {
  if (!lastBar || !isUsableNumber(price) || price <= 0) return null;

  const close = round2(price);

  if (close === lastBar.close) return null;

  return {
    ...lastBar,
    close,
    high: Math.max(lastBar.high, close),
    low: Math.min(lastBar.low, close),
  };
}

/**
 * ราคาล่าสุดข้ามไปวันเทรดใหม่แล้วหรือยัง (เทียบตามวันแบบ UTC)
 *
 * ถ้าใช่แปลว่าประวัติที่ถืออยู่ขาดแท่งของวันนี้ — ต้องโหลดใหม่ ไม่ใช่เอาราคาวันนี้
 * ไปทับแท่งของเมื่อวาน
 */
export function isNewerTradingDay(
  quoteAt: string | number | Date,
  lastBarTime: ChartTime | undefined,
): boolean {
  if (lastBarTime === undefined) return false;

  const quoteDay = toTradingDay(quoteAt);
  const barDay = toTradingDay(lastBarTime * 1000);

  if (quoteDay === null || barDay === null) return false;

  return quoteDay > barDay;
}

/** เลขวัน (นับจาก epoch แบบ UTC) ใช้เทียบว่าข้ามวันเทรดไปแล้วหรือยัง */
export function toTradingDay(date: string | number | Date): number | null {
  const seconds = toChartTime(date);

  return seconds === null ? null : Math.floor(seconds / 86_400);
}

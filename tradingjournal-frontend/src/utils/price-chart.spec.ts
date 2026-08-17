/**
 * ตัวแปลงข้อมูลราคาให้ lightweight-charts
 *
 * ไลบรารี throw ทันทีถ้าข้อมูลไม่เรียงเวลาหรือมีเวลาซ้ำ ซึ่งจะทำให้กราฟหายทั้งอัน
 * แบบไม่มี error ให้ผู้ใช้เห็น เทสชุดนี้จึงล็อกสัญญาของ input ที่สกปรกได้จริงจาก Yahoo
 */
import { describe, expect, it } from 'vitest';
import {
  isNewerTradingDay,
  mergeLivePrice,
  toCandlestickData,
  toChartTime,
  toLineData,
  toOverlayData,
  toPatternData,
  toTradingDay,
  type CandlestickPoint,
  type PriceBarInput,
} from './price-chart';

const bar = (date: string, close: number): PriceBarInput => ({
  date,
  open: close - 1,
  high: close + 2,
  low: close - 3,
  close,
});

describe('toChartTime', () => {
  it('แปลงเป็นวินาที ไม่ใช่มิลลิวินาที', () => {
    const iso = '2026-08-17T00:00:00.000Z';

    expect(toChartTime(iso)).toBe(Date.parse(iso) / 1000);
  });

  it('วันที่ใช้ไม่ได้ -> null', () => {
    expect(toChartTime('ไม่ใช่วันที่')).toBeNull();
  });
});

describe('toCandlestickData', () => {
  it('เรียงเวลาจากน้อยไปมากเสมอ แม้ input สลับลำดับมา', () => {
    const points = toCandlestickData([
      bar('2026-08-03', 12),
      bar('2026-08-01', 10),
      bar('2026-08-02', 11),
    ]);

    expect(points.map((point) => point.close)).toEqual([10, 11, 12]);
    expect(points[0]!.time).toBeLessThan(points[1]!.time);
  });

  it('ตัดแท่งที่เวลาซ้ำ เก็บอันหลังสุดไว้ (ไลบรารี throw ถ้าเวลาซ้ำ)', () => {
    const points = toCandlestickData([
      bar('2026-08-01', 10),
      bar('2026-08-01', 99),
      bar('2026-08-02', 11),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0]!.close).toBe(99);
  });

  it('ข้ามแท่งที่ราคาไม่ใช่ตัวเลขใช้ได้ แทนที่จะแปลงเป็น 0', () => {
    const points = toCandlestickData([
      bar('2026-08-01', 10),
      { date: '2026-08-02', open: 1, high: 2, low: 3, close: Number.NaN },
      { date: 'พัง', open: 1, high: 2, low: 3, close: 4 },
    ]);

    expect(points).toHaveLength(1);
  });

  it('ปัดราคาเหลือ 2 ตำแหน่ง', () => {
    const points = toCandlestickData([
      { date: '2026-08-01', open: 1.005, high: 2.126, low: 0.994, close: 1.567 },
    ]);

    expect(points[0]).toMatchObject({ high: 2.13, close: 1.57 });
  });
});

describe('toLineData', () => {
  it('ใช้ราคาปิดเป็นค่าเดียวของจุด', () => {
    expect(toLineData([bar('2026-08-01', 10), bar('2026-08-02', 11)])).toEqual([
      { time: toChartTime('2026-08-01'), value: 10 },
      { time: toChartTime('2026-08-02'), value: 11 },
    ]);
  });
});

describe('toOverlayData', () => {
  const bars = [bar('2026-08-01', 10), bar('2026-08-02', 11), bar('2026-08-03', 12)];

  it('จับคู่ค่ากับแท่งตาม index และตัดช่วงต้นที่ยังคำนวณไม่ได้', () => {
    const points = toOverlayData(bars, [null, 10.5, 11.5]);

    expect(points).toEqual([
      { time: toChartTime('2026-08-02'), value: 10.5 },
      { time: toChartTime('2026-08-03'), value: 11.5 },
    ]);
  });

  it('ไม่มีค่า EMA -> ไม่มีเส้น', () => {
    expect(toOverlayData(bars, undefined)).toEqual([]);
    expect(toOverlayData(bars, [])).toEqual([]);
  });
});

describe('toPatternData', () => {
  it('ใช้พิกัดของตัวเอง ไม่อิง index ของแท่งราคา', () => {
    expect(
      toPatternData([
        { date: '2026-08-05', price: 20 },
        { date: '2026-08-01', price: 10 },
      ]),
    ).toEqual([
      { time: toChartTime('2026-08-01'), value: 10 },
      { time: toChartTime('2026-08-05'), value: 20 },
    ]);
  });
});

describe('mergeLivePrice', () => {
  const lastBar: CandlestickPoint = {
    time: 1786665600,
    open: 100,
    high: 105,
    low: 98,
    close: 102,
  };

  it('ราคาใหม่ทะลุ high เดิม -> ขยาย high ตาม', () => {
    expect(mergeLivePrice(lastBar, 108)).toEqual({
      ...lastBar,
      close: 108,
      high: 108,
    });
  });

  it('ราคาใหม่ต่ำกว่า low เดิม -> ขยาย low ตาม', () => {
    expect(mergeLivePrice(lastBar, 95)).toEqual({
      ...lastBar,
      close: 95,
      low: 95,
    });
  });

  it('ราคาอยู่ในกรอบเดิม -> เปลี่ยนแค่ close', () => {
    expect(mergeLivePrice(lastBar, 103)).toEqual({ ...lastBar, close: 103 });
  });

  it('ราคาเท่าเดิม -> null เพื่อไม่ให้สั่งวาดซ้ำเปล่า ๆ', () => {
    expect(mergeLivePrice(lastBar, 102)).toBeNull();
  });

  it('ไม่มีแท่งเดิม หรือราคาใช้ไม่ได้ -> null', () => {
    expect(mergeLivePrice(undefined, 102)).toBeNull();
    expect(mergeLivePrice(lastBar, null)).toBeNull();
    expect(mergeLivePrice(lastBar, 0)).toBeNull();
    expect(mergeLivePrice(lastBar, Number.NaN)).toBeNull();
  });
});

describe('isNewerTradingDay', () => {
  const barTime = toChartTime('2026-08-17T20:00:00.000Z')!;

  it('ราคาสดของวันถัดไป -> true (ห้ามเอาไปทับแท่งเมื่อวาน)', () => {
    expect(isNewerTradingDay('2026-08-18T13:31:00.000Z', barTime)).toBe(true);
  });

  it('ราคาสดของวันเดียวกัน -> false', () => {
    expect(isNewerTradingDay('2026-08-17T23:59:00.000Z', barTime)).toBe(false);
  });

  it('ไม่มีแท่งเดิม -> false', () => {
    expect(isNewerTradingDay('2026-08-18T13:31:00.000Z', undefined)).toBe(false);
  });
});

describe('toTradingDay', () => {
  it('เวลาต่างกันในวันเดียวกันได้เลขวันเท่ากัน', () => {
    expect(toTradingDay('2026-08-17T00:00:00.000Z')).toBe(
      toTradingDay('2026-08-17T23:59:59.000Z'),
    );
  });
});

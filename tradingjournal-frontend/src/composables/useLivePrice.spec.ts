/**
 * useLivePrice — ตัว poll ราคาสดของหน้ากราฟ
 *
 * สามเรื่องที่พังเงียบได้ง่ายและกินโควต้า Yahoo ฟรีจนโดนบล็อก:
 *   1. ไม่หยุด poll ตอนสลับแท็บเบราว์เซอร์
 *   2. ไม่หยุด poll ตอนออกจากหน้า (timer ค้างอยู่ตลอด session)
 *   3. เปลี่ยนหุ้นแล้วผลของหุ้นเก่าที่ตอบช้าเข้ามาทับของใหม่
 */
import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();

vi.mock('boot/axios', () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

const { useLivePrice } = await import('./useLivePrice');

function quote(symbol: string, price: number) {
  return {
    symbol,
    price,
    change: 1,
    changePercent: 0.5,
    open: price - 1,
    dayHigh: price + 1,
    dayLow: price - 2,
    previousClose: price - 1,
    volume: 1000,
    marketState: 'REGULAR',
    asOf: '2026-08-17T10:00:00.000Z',
  };
}

/** ตั้งค่า document.visibilityState แล้วยิง event เหมือนเบราว์เซอร์จริง */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useLivePrice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset();
    apiGet.mockResolvedValue({ data: [quote('AAPL', 180)] });
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ดึงทันทีตอนเริ่ม แล้ว poll ต่อตามรอบที่ตั้งไว้', async () => {
    const scope = effectScope();

    scope.run(() => useLivePrice(ref('AAPL'), { intervalMs: 15_000 }));

    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(apiGet).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiGet).toHaveBeenCalledTimes(4);

    scope.stop();
  });

  it('ยิงไปที่ /market/quotes/realtime ของ backend ไม่ใช่ Yahoo ตรง ๆ', async () => {
    const scope = effectScope();

    scope.run(() => useLivePrice(ref('aapl')));

    await vi.advanceTimersByTimeAsync(0);

    expect(apiGet).toHaveBeenCalledWith('/market/quotes/realtime', {
      params: { symbols: 'AAPL' },
    });

    scope.stop();
  });

  it('เก็บราคาที่ได้ไว้ใน quote', async () => {
    const scope = effectScope();
    const result = scope.run(() => useLivePrice(ref('AAPL')))!;

    await vi.advanceTimersByTimeAsync(0);

    expect(result.quote.value?.price).toBe(180);

    scope.stop();
  });

  it('สลับไปแท็บอื่นแล้วหยุด poll กลับมาแล้วดึงใหม่ทันที', async () => {
    const scope = effectScope();
    const result = scope.run(() => useLivePrice(ref('AAPL'), { intervalMs: 15_000 }))!;

    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await nextTick();
    expect(result.isPaused.value).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiGet).toHaveBeenCalledTimes(1); // ไม่ยิงเพิ่มเลยตลอด 1 นาทีที่ซ่อนอยู่

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(result.isPaused.value).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(2); // ดึงทันทีไม่ต้องรอครบรอบ

    scope.stop();
  });

  it('ออกจากหน้าแล้ว timer ต้องถูกเก็บ ไม่ยิงต่อ', async () => {
    const scope = effectScope();

    scope.run(() => useLivePrice(ref('AAPL'), { intervalMs: 15_000 }));

    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenCalledTimes(1);

    scope.stop();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('enabled = false ไม่ยิงเลย จนกว่าจะเปิด', async () => {
    const scope = effectScope();
    const enabled = ref(false);

    scope.run(() => useLivePrice(ref('AAPL'), { intervalMs: 15_000, enabled }));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiGet).not.toHaveBeenCalled();

    enabled.value = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('ไม่มี symbol ก็ไม่ยิง', async () => {
    const scope = effectScope();

    scope.run(() => useLivePrice(ref(null)));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiGet).not.toHaveBeenCalled();

    scope.stop();
  });

  it('เปลี่ยนหุ้นแล้วผลของตัวเก่าที่ตอบช้าต้องไม่ทับของใหม่', async () => {
    const symbol = ref('AAPL');
    let resolveSlow: (value: unknown) => void = () => undefined;

    apiGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
    );
    apiGet.mockResolvedValue({ data: [quote('MSFT', 420)] });

    const scope = effectScope();
    const result = scope.run(() => useLivePrice(symbol))!;

    await vi.advanceTimersByTimeAsync(0);

    // ยังไม่ทันตอบ ผู้ใช้เปลี่ยนหุ้นแล้ว
    symbol.value = 'MSFT';
    await vi.advanceTimersByTimeAsync(0);

    expect(result.quote.value?.symbol).toBe('MSFT');

    // AAPL เพิ่งตอบกลับมาทีหลัง — ต้องถูกทิ้ง
    resolveSlow({ data: [quote('AAPL', 180)] });
    await vi.advanceTimersByTimeAsync(0);

    expect(result.quote.value?.symbol).toBe('MSFT');
    expect(result.quote.value?.price).toBe(420);

    scope.stop();
  });

  it('API พัง -> คงราคาล่าสุดไว้ ไม่โยน error ออกไปให้หน้าพัง', async () => {
    const scope = effectScope();
    const result = scope.run(() => useLivePrice(ref('AAPL'), { intervalMs: 15_000 }))!;

    await vi.advanceTimersByTimeAsync(0);
    expect(result.quote.value?.price).toBe(180);

    apiGet.mockRejectedValue(new Error('503'));
    await vi.advanceTimersByTimeAsync(15_000);

    expect(result.quote.value?.price).toBe(180);

    scope.stop();
  });
});

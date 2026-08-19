/**
 * PriceChart — ตัวห่อ lightweight-charts
 *
 * ไลบรารีวาดลง canvas ล้วน jsdom มองไม่เห็นเนื้อกราฟ เทสชุดนี้จึง mock ตัวไลบรารี
 * แล้วตรวจว่า "เราสั่งอะไรมันบ้าง" — ซึ่งคือจุดที่พังจริงเวลา refactor:
 *   1. สลับ candlestick/line ต้องสร้าง series ใหม่ (เปลี่ยนชนิดกลางคันไม่ได้)
 *   2. support/resistance ต้องออกมาเป็น createPriceLine() ไม่ใช่หายไปเฉย ๆ
 *   3. pan/zoom ต้องไม่ถูกปิด
 *   4. ราคาสดต้องใช้ update() ไม่ใช่ setData() ที่จะรีเซ็ตตำแหน่งที่ผู้ใช้เลื่อนไว้
 */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartApi = {
  addSeries: vi.fn(),
  removeSeries: vi.fn(),
  remove: vi.fn(),
  timeScale: vi.fn(),
  // ใช้ตอนสลับธีม — ทาสีกราฟใหม่โดยไม่สร้าง instance ใหม่
  applyOptions: vi.fn(),
};

const timeScaleApi = { fitContent: vi.fn(), applyOptions: vi.fn() };
const createChart = vi.fn();

function makeSeries() {
  return {
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn((options: unknown) => ({ options })),
    removePriceLine: vi.fn(),
  };
}

let createdSeries: ReturnType<typeof makeSeries>[] = [];

vi.mock('lightweight-charts', () => ({
  createChart: (...args: unknown[]) => createChart(...args),
  CandlestickSeries: { type: 'Candlestick' },
  LineSeries: { type: 'Line' },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  CrosshairMode: { Normal: 0, Magnet: 1, Hidden: 2 },
}));

const PriceChart = (await import('./PriceChart.vue')).default;

const bars = [
  { time: 1_786_665_600, open: 100, high: 105, low: 98, close: 102 },
  { time: 1_786_752_000, open: 102, high: 110, low: 101, close: 108 },
];

/** series ตัวแรกคือ series ราคาหลัก ตัวถัด ๆ ไปคือ overlay */
const mainSeries = () => createdSeries[0]!;

function mountChart(props: Record<string, unknown> = {}) {
  return mount(PriceChart, {
    props: { bars, displayType: 'candlestick', ...props },
  });
}

describe('PriceChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdSeries = [];
    chartApi.addSeries.mockImplementation(() => {
      const series = makeSeries();
      createdSeries.push(series);
      return series;
    });
    chartApi.timeScale.mockReturnValue(timeScaleApi);
    createChart.mockReturnValue(chartApi);
  });

  it('เปิด pan/zoom ไว้ (เลื่อนดูกราฟย้อนหลังได้)', () => {
    mountChart();

    const options = createChart.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(options.handleScroll).toBe(true);
    expect(options.handleScale).toBe(true);
  });

  it('candlestick -> สร้าง CandlestickSeries พร้อมข้อมูล OHLC ครบ', () => {
    mountChart();

    expect(chartApi.addSeries).toHaveBeenCalledWith(
      { type: 'Candlestick' },
      expect.anything(),
    );
    expect(mainSeries().setData).toHaveBeenCalledWith([
      { time: 1_786_665_600, open: 100, high: 105, low: 98, close: 102 },
      { time: 1_786_752_000, open: 102, high: 110, low: 101, close: 108 },
    ]);
  });

  it('line -> สร้าง LineSeries และส่งเฉพาะราคาปิด', () => {
    mountChart({ displayType: 'line' });

    expect(chartApi.addSeries).toHaveBeenCalledWith({ type: 'Line' }, expect.anything());
    expect(mainSeries().setData).toHaveBeenCalledWith([
      { time: 1_786_665_600, value: 102 },
      { time: 1_786_752_000, value: 108 },
    ]);
  });

  it('สลับชนิดกราฟ -> ลบ series เดิมแล้วสร้างใหม่', async () => {
    const wrapper = mountChart();
    const first = mainSeries();

    await wrapper.setProps({ displayType: 'line' });

    expect(chartApi.removeSeries).toHaveBeenCalledWith(first);
    expect(chartApi.addSeries).toHaveBeenLastCalledWith({ type: 'Line' }, expect.anything());
  });

  it('support/resistance ออกมาเป็น createPriceLine ไม่ใช่หายไป', () => {
    mountChart({
      priceLines: [
        { price: 95, color: '#14b8a6', title: 'S1' },
        { price: 115, color: '#f97316', title: 'R1' },
      ],
    });

    expect(mainSeries().createPriceLine).toHaveBeenCalledTimes(2);
    expect(mainSeries().createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 95, title: 'S1', color: '#14b8a6' }),
    );
  });

  it('ราคาที่ใช้ไม่ได้ (<= 0) ไม่ถูกวาดเป็นเส้น', () => {
    mountChart({
      priceLines: [
        { price: 0, color: '#14b8a6', title: 'S1' },
        { price: Number.NaN, color: '#14b8a6', title: 'S2' },
        { price: 115, color: '#f97316', title: 'R1' },
      ],
    });

    expect(mainSeries().createPriceLine).toHaveBeenCalledTimes(1);
  });

  it('เปลี่ยนชุดเส้น -> ลบของเดิมก่อนวาดใหม่ ไม่ทับกันซ้อน', async () => {
    const wrapper = mountChart({
      priceLines: [{ price: 95, color: '#14b8a6', title: 'S1' }],
    });

    await wrapper.setProps({
      priceLines: [{ price: 96, color: '#14b8a6', title: 'S1' }],
    });

    expect(mainSeries().removePriceLine).toHaveBeenCalledTimes(1);
    expect(mainSeries().createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 96 }),
    );
  });

  it('EMA มาเป็น series ของตัวเอง แยกจากราคาหลัก', () => {
    mountChart({
      overlays: [
        {
          id: 'ema20',
          title: 'EMA 20',
          color: '#3b82f6',
          points: [{ time: 1_786_752_000, value: 104 }],
        },
      ],
    });

    expect(createdSeries).toHaveLength(2);
    expect(createdSeries[1]!.setData).toHaveBeenCalledWith([
      { time: 1_786_752_000, value: 104 },
    ]);
  });

  it('overlay ที่หายไปจาก props ต้องถูกลบออกจากกราฟ', async () => {
    const wrapper = mountChart({
      overlays: [
        { id: 'ema20', title: 'EMA 20', color: '#3b82f6', points: [] },
        { id: 'ema50', title: 'EMA 50', color: '#f97316', points: [] },
      ],
    });

    const ema50 = createdSeries[2]!;

    await wrapper.setProps({
      overlays: [{ id: 'ema20', title: 'EMA 20', color: '#3b82f6', points: [] }],
    });

    expect(chartApi.removeSeries).toHaveBeenCalledWith(ema50);
  });

  it('applyLiveBar ใช้ update() ไม่ใช่ setData() (ไม่รีเซ็ตตำแหน่งที่ผู้ใช้เลื่อนไว้)', () => {
    const wrapper = mountChart();
    const setDataCalls = mainSeries().setData.mock.calls.length;

    (wrapper.vm as unknown as { applyLiveBar: (bar: unknown) => void }).applyLiveBar({
      time: 1_786_752_000,
      open: 102,
      high: 112,
      low: 101,
      close: 112,
    });

    expect(mainSeries().update).toHaveBeenCalledWith({
      time: 1_786_752_000,
      open: 102,
      high: 112,
      low: 101,
      close: 112,
    });
    expect(mainSeries().setData).toHaveBeenCalledTimes(setDataCalls);
  });

  it('applyLiveBar ตอนเป็นกราฟเส้น ส่งเป็นจุดค่าเดียว', () => {
    const wrapper = mountChart({ displayType: 'line' });

    (wrapper.vm as unknown as { applyLiveBar: (bar: unknown) => void }).applyLiveBar({
      time: 1_786_752_000,
      open: 102,
      high: 112,
      low: 101,
      close: 112,
    });

    expect(mainSeries().update).toHaveBeenCalledWith({
      time: 1_786_752_000,
      value: 112,
    });
  });

  it('ถอด component แล้วต้องคืนทรัพยากรของกราฟ', () => {
    mountChart().unmount();

    expect(chartApi.remove).toHaveBeenCalled();
  });
});

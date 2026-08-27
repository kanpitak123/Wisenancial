/**
 * ScrollRail — รางเลื่อนแนวนอนที่ใช้ในหมวดของ Momentum Radar
 *
 * jsdom ไม่ได้ทำ layout จริง: clientWidth/scrollWidth เป็น 0 หมดและ scrollBy() ไม่มีผล
 * เทสนี้จึงเซ็ตค่าพวกนั้นลง element เองเพื่อจำลอง "รางที่มีของล้น" แล้ววัดว่า
 * ตรรกะขอบราง (atStart/atEnd) กับปุ่มตอบสนองถูกไหม
 */
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScrollRail from './ScrollRail.vue';

/** จำลองขนาดจริงให้ track: กว้างที่มองเห็น 500px แต่เนื้อหายาว total px */
function fakeLayout(track: HTMLElement, { client = 500, total = 1500, left = 0 } = {}) {
  Object.defineProperty(track, 'clientWidth', { value: client, configurable: true });
  Object.defineProperty(track, 'scrollWidth', { value: total, configurable: true });
  Object.defineProperty(track, 'scrollLeft', { value: left, writable: true, configurable: true });
}

function mountRail(itemCount = 6) {
  return mount(ScrollRail, {
    props: { itemCount },
    slots: {
      default: () =>
        Array.from({ length: itemCount }, (_, i) => h('article', { class: 'card' }, `card-${i}`)),
    },
    attachTo: document.body,
  });
}

describe('ScrollRail', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('render ทุกใบที่ส่งเข้ามาในราง ไม่ตัดทิ้ง', () => {
    const wrapper = mountRail(6);

    expect(wrapper.findAll('.card')).toHaveLength(6);
  });

  it('อยู่หัวราง -> ปุ่มซ้าย disabled, ปุ่มขวากดได้', async () => {
    const wrapper = mountRail(6);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    fakeLayout(track, { client: 500, total: 1500, left: 0 });
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(wrapper.find('[data-test="scroll-rail-prev"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="scroll-rail-next"]').attributes('disabled')).toBeUndefined();
  });

  it('เลื่อนไปกลางราง -> กดได้ทั้งสองข้าง', async () => {
    const wrapper = mountRail(6);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    fakeLayout(track, { client: 500, total: 1500, left: 400 });
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(wrapper.find('[data-test="scroll-rail-prev"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-test="scroll-rail-next"]').attributes('disabled')).toBeUndefined();
  });

  it('สุดทางขวา -> ปุ่มขวา disabled', async () => {
    const wrapper = mountRail(6);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    fakeLayout(track, { client: 500, total: 1500, left: 1000 });
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(wrapper.find('[data-test="scroll-rail-next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="scroll-rail-prev"]').attributes('disabled')).toBeUndefined();
  });

  it('เศษทศนิยมของ scrollLeft ต้องไม่ทำให้ปุ่มขวาค้างเปิดทั้งที่สุดทางแล้ว', async () => {
    const wrapper = mountRail(6);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    // 999.6 + 500 = 1499.6 ซึ่งน้อยกว่า 1500 อยู่ 0.4px — ต้องยังนับว่าสุดทาง
    fakeLayout(track, { client: 500, total: 1500, left: 999.6 });
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(wrapper.find('[data-test="scroll-rail-next"]').attributes('disabled')).toBeDefined();
  });

  it('ของใส่ได้พอดีไม่ล้น -> ปิดปุ่มทั้งสองข้าง', async () => {
    const wrapper = mountRail(2);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    fakeLayout(track, { client: 500, total: 500, left: 0 });
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(wrapper.find('[data-test="scroll-rail-prev"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="scroll-rail-next"]').attributes('disabled')).toBeDefined();
  });

  it('กดปุ่มขวา -> เรียก scrollBy ไปทางขวาแบบ smooth', async () => {
    const wrapper = mountRail(6);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    fakeLayout(track, { client: 500, total: 1500, left: 0 });
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy as unknown as typeof track.scrollBy;
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    await wrapper.find('[data-test="scroll-rail-next"]').trigger('click');

    expect(scrollBy).toHaveBeenCalledWith({ left: 500 * 0.85, behavior: 'smooth' });
  });

  it('กดปุ่มซ้าย -> เลื่อนย้อนกลับเป็นค่าติดลบ', async () => {
    const wrapper = mountRail(6);
    const track = wrapper.find('[data-test="scroll-rail-track"]').element as HTMLElement;

    fakeLayout(track, { client: 500, total: 1500, left: 800 });
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy as unknown as typeof track.scrollBy;
    track.dispatchEvent(new Event('scroll'));
    await nextTick();

    await wrapper.find('[data-test="scroll-rail-prev"]').trigger('click');

    expect(scrollBy).toHaveBeenCalledWith({ left: -(500 * 0.85), behavior: 'smooth' });
  });
});

/**
 * คำปฏิเสธ AI — บรรทัดสั้น "ไม่ใช่คำแนะนำทางการเงิน" + ลิงก์ไปคำปฏิเสธฉบับเต็มใน Terms
 */
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLanguageStore } from 'stores/LanguageStore';
import WsAiDisclaimer from './WsAiDisclaimer.vue';

const mountIt = (props: Record<string, unknown> = {}) =>
  mount(WsAiDisclaimer, { props, global: { stubs: { RouterLink: RouterLinkStub } } });

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('WsAiDisclaimer', () => {
  it('EN: บรรทัดนำ "Not financial advice." และลิงก์ไป /terms#ai-disclaimer เปิดแท็บใหม่', () => {
    useLanguageStore().setLanguage('en');
    const wrapper = mountIt();

    expect(wrapper.get('[data-test="ai-disclaimer-lead"]').text()).toBe('Not financial advice.');

    const link = wrapper.get('[data-test="ai-disclaimer-link"]');
    const stub = wrapper.getComponent('[data-test="ai-disclaimer-link"]') as unknown as {
      props(name: string): unknown;
    };

    expect(stub.props('to')).toEqual({ path: '/terms', hash: '#ai-disclaimer' });
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener');
  });

  it('TH: บรรทัดนำ "ไม่ใช่คำแนะนำทางการเงิน"', () => {
    useLanguageStore().setLanguage('th');

    expect(mountIt().get('[data-test="ai-disclaimer-lead"]').text()).toBe('ไม่ใช่คำแนะนำทางการเงิน');
  });

  it('ยังแสดงหมายเหตุของหน้า (note) ในกล่องเดียวกัน', () => {
    const wrapper = mountIt({ note: 'as of Q2' });

    expect(wrapper.get('[data-test="ai-disclaimer-note"]').text()).toBe('as of Q2');
  });
});

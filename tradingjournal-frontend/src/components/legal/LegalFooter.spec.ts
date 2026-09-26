import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLanguageStore } from 'stores/LanguageStore';
import LegalFooter from './LegalFooter.vue';

const mountFooter = () => mount(LegalFooter, { global: { stubs: { RouterLink: RouterLinkStub } } });

/** อ่าน prop `to` ของ RouterLink ที่ผูก data-test (เหมือนที่ LandingPage.spec ทำ) */
const linkTo = (wrapper: VueWrapper, id: string): unknown =>
  (
    wrapper.getComponent(`[data-test="${id}"]`) as unknown as { props(name: string): unknown }
  ).props('to');

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('LegalFooter', () => {
  it('ลิงก์ไป /terms และ /privacy', () => {
    const wrapper = mountFooter();

    expect(linkTo(wrapper, 'footer-terms')).toBe('/terms');
    expect(linkTo(wrapper, 'footer-privacy')).toBe('/privacy');
  });

  it('ป้ายลิงก์ตามภาษา', () => {
    useLanguageStore().setLanguage('en');
    const en = mountFooter();

    expect(en.get('[data-test="footer-terms"]').text()).toBe('Terms of Service');
    expect(en.get('[data-test="footer-privacy"]').text()).toBe('Privacy Policy');

    useLanguageStore().setLanguage('th');

    expect(mountFooter().get('[data-test="footer-terms"]').text()).toBe('ข้อกำหนดการให้บริการ');
  });
});

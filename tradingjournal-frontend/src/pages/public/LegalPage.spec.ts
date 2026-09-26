/**
 * หน้า /terms และ /privacy — ฉบับร่างที่ยังไม่ผ่านทนายความ
 *
 * ที่ล็อกไว้: แบนเนอร์ DRAFT ต้องขึ้นทุกครั้งทั้งสองภาษา, ตัวยึดที่ยังไม่มีคำตอบต้องเห็นชัด,
 * หัวข้อ AI Disclaimer ต้องมี id ให้การ์ด AI ลิงก์มา, และภาษาเดินตาม LanguageStore
 */
import { flushPromises, mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_DOCUMENTS } from 'src/constants/legal.content';
import { useLanguageStore } from 'stores/LanguageStore';
import LegalPage from './LegalPage.vue';

let hash = '';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/terms', params: {}, meta: {}, query: {}, hash }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const scrollIntoView = vi.fn();

/** อ่าน prop `to` ของ RouterLink ที่ผูก data-test (เหมือนที่ LandingPage.spec ทำ) */
const linkTo = (wrapper: VueWrapper, id: string): unknown =>
  (
    wrapper.getComponent(`[data-test="${id}"]`) as unknown as { props(name: string): unknown }
  ).props('to');

function mountPage(doc: 'terms' | 'privacy'): VueWrapper {
  return mount(LegalPage, {
    props: { doc },
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
  localStorage.clear();
  hash = '';
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe('LegalPage', () => {
  it.each([
    ['terms', 'en', 'DRAFT — pending legal review'],
    ['terms', 'th', 'ฉบับร่าง — รอการตรวจสอบทางกฎหมาย'],
    ['privacy', 'en', 'DRAFT — pending legal review'],
    ['privacy', 'th', 'ฉบับร่าง — รอการตรวจสอบทางกฎหมาย'],
  ] as const)('%s/%s แสดงแบนเนอร์ DRAFT', (doc, lang, banner) => {
    useLanguageStore().setLanguage(lang);

    const wrapper = mountPage(doc);

    expect(wrapper.get('[data-test="legal-draft-title"]').text()).toBe(banner);
  });

  it('แสดงทุกหัวข้อของฉบับร่างตามภาษาที่เลือก และสลับภาษาได้จากปุ่มบนหน้า', async () => {
    useLanguageStore().setLanguage('en');
    const wrapper = mountPage('terms');

    expect(wrapper.text()).toContain('Terms of Service — Wisenancial');
    expect(wrapper.findAll('.legal-section')).toHaveLength(LEGAL_DOCUMENTS.terms.en.sections.length);

    await wrapper.get('[data-test="legal-lang-th"]').trigger('click');

    expect(useLanguageStore().isThai).toBe(true);
    expect(wrapper.text()).toContain('ข้อกำหนดการให้บริการ — Wisenancial');
    expect(wrapper.text()).not.toContain('Terms of Service — Wisenancial');
  });

  it('ตัวยึดที่ยังไม่มีคำตอบถูกไฮไลต์ และแบนเนอร์บอกจำนวนที่เหลือ', () => {
    useLanguageStore().setLanguage('en');
    const wrapper = mountPage('terms');

    const marks = wrapper.findAll('[data-test="legal-placeholder"]');

    expect(marks.length).toBeGreaterThanOrEqual(5);
    expect(marks.map((m) => m.text()).join(' ')).toContain('[Placeholder — refund policy');
    expect(wrapper.get('[data-test="legal-draft-count"]').text()).toContain(String(marks.length));
  });

  it('ข้อความตัวหนาในต้นฉบับแสดงเป็น <strong> ไม่หลุดเครื่องหมาย **', () => {
    useLanguageStore().setLanguage('en');
    const wrapper = mountPage('terms');

    expect(wrapper.text()).not.toContain('**');
    expect(wrapper.findAll('strong').map((s) => s.text())).toContain(
      'The Service is not a broker, is not a financial advisor, and does not execute trades on your behalf.',
    );
  });

  it('Terms ปิดท้ายด้วยหัวข้อ AI Disclaimer ที่มี id ให้ลิงก์ลึก', () => {
    useLanguageStore().setLanguage('en');
    const section = mountPage('terms').get('#ai-disclaimer');

    expect(section.text()).toContain('AI Disclaimer');
    expect(section.text()).toContain('Not financial advice.');
  });

  it('เปิดด้วย #ai-disclaimer -> เลื่อนไปที่หัวข้อนั้น', async () => {
    hash = '#ai-disclaimer';
    mountPage('terms');
    await flushPromises();

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('เปิดโดยไม่มี hash -> ไม่เลื่อน', async () => {
    mountPage('terms');
    await flushPromises();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('Privacy ไม่มีหัวข้อ AI Disclaimer และมีลิงก์ฟุตเตอร์ไปทั้งสองหน้า', () => {
    useLanguageStore().setLanguage('en');
    const wrapper = mountPage('privacy');

    expect(wrapper.find('#ai-disclaimer').exists()).toBe(false);
    expect(linkTo(wrapper, 'footer-terms')).toBe('/terms');
    expect(linkTo(wrapper, 'footer-privacy')).toBe('/privacy');
  });
});

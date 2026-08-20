/**
 * หน้าแรกสาธารณะ — หน้าเดียวในแอปที่คนยังไม่ล็อกอินเห็น
 *
 * จุดที่พังเงียบได้ง่ายที่สุดของหน้าขายของคือ "ตัวเลขราคาไม่ตรงกับที่เก็บเงินจริง"
 * แบบ (mockup) วาดไว้ที่ ฿299 ซึ่งไม่มีอยู่ในแพ็กที่ขายจริงเลย เทสชุดนี้จึงล็อกไว้ว่า
 * ราคาบนหน้าแรกต้องมาจาก billing.constants ชุดเดียวกับหน้า Upgrade เสมอ
 */
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { Dark } from 'quasar';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  FREE_TIER_MAX_PORTFOLIOS,
  TIER_DISPLAY_NAMES,
  TIER_PRICE_THB,
} from 'src/constants/billing.constants';
import { LOGIN_ROUTE } from 'src/constants/workspace.constants';
import { useLanguageStore } from 'stores/LanguageStore';

import LandingPage from './LandingPage.vue';

const PRO_TIER = 'PACK_279' as const;

/** อ่าน prop `to` ของปุ่มที่ผูก RouterLink ผ่าน data-test */
function routeTarget(wrapper: VueWrapper, testId: string): unknown {
  const link = wrapper.getComponent(`[data-test="${testId}"]`) as unknown as {
    props(name: string): unknown;
  };
  return link.props('to');
}

function mountPage(): VueWrapper {
  return mount(LandingPage, {
    global: {
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

describe('LandingPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    Dark.set(false);
  });

  it('ราคาแพ็กที่โชว์มาจาก billing.constants ไม่ใช่ตัวเลขที่ hardcode ไว้ในแบบ', () => {
    const wrapper = mountPage();
    const pro = wrapper.get('[data-test="landing-price-pro"]').text();

    expect(pro).toContain(String(TIER_PRICE_THB[PRO_TIER]));
    expect(pro).toContain(TIER_DISPLAY_NAMES[PRO_TIER]);

    // ฿299 ของแบบไม่ตรงกับแพ็กไหนเลย — ถ้าโผล่มาแปลว่ามีคนเอาค่าจากแบบมาใส่ตรงๆ
    expect(wrapper.text()).not.toContain('฿299');
  });

  it('โควตาพอร์ตของแพ็กฟรีอ่านจากค่าคงที่เดียวกับที่ระบบใช้บังคับ', () => {
    expect(mountPage().text()).toContain(`${FREE_TIER_MAX_PORTFOLIOS} พอร์ต`);
  });

  it('ปุ่ม CTA ทุกตัวพาไปสมัครสมาชิก และมีทางเข้าสู่ระบบให้คนที่มีบัญชีแล้ว', () => {
    const wrapper = mountPage();

    for (const cta of ['landing-cta-header', 'landing-cta-hero', 'landing-cta-banner']) {
      expect(routeTarget(wrapper, cta), cta).toBe('/Register');
    }

    expect(routeTarget(wrapper, 'landing-login')).toBe(LOGIN_ROUTE);
  });

  it('ปุ่ม TH/EN เปลี่ยนภาษาผ่าน LanguageStore ตัวเดียวกับที่ MainLayout ใช้', async () => {
    const wrapper = mountPage();
    const language = useLanguageStore();

    await wrapper.get('[data-test="landing-lang-en"]').trigger('click');
    expect(language.currentLanguage).toBe('en');

    await wrapper.get('[data-test="landing-lang-th"]').trigger('click');
    expect(language.currentLanguage).toBe('th');
  });

  it('สลับธีมแล้วค่าถูกจำลง localStorage คีย์เดียวกับ MainLayout (ค่าจึงติดไปหลังล็อกอิน)', async () => {
    const wrapper = mountPage();

    await wrapper.get('[data-test="landing-theme-toggle"]').trigger('click');

    expect(Dark.isActive).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
  });
});

/**
 * BottomNavBar — dock ลอยล่างที่มาแทน q-drawer ซ้าย
 *
 * ที่นี่คุมรายการเมนูเองผ่านการ mock useWorkspace เพื่อให้ทดสอบเคสที่ยังไม่มีจริง
 * ในโปรดักชันได้ (ลิงก์ที่ตั้ง paid: true) — MainLayout.nav.spec.ts ดูฝั่งที่ผูกกับ
 * WORKSPACE_NAV_LINKS จริงอยู่แล้ว
 */
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceNavLink } from 'src/constants/workspace.constants';
import { useUserStore } from 'stores/UserStore';
import BottomNavBar from './BottomNavBar.vue';

const routerPush = vi.fn();

vi.mock('vue-router', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    useRouter: () => ({ push: routerPush }),
    useRoute: () => ({ path: '/Dashboard', query: {}, meta: {} }),
    // stub router-link เป็น <a> ธรรมดา จะได้ไม่ต้องตั้ง router จริงทั้งตัว
    RouterLink: defineComponent({
      name: 'RouterLink',
      props: { to: { type: String, default: '' } },
      setup: (props, { slots, attrs }) => () => h('a', { ...attrs, href: props.to }, slots.default?.()),
    }),
  };
});

const navLinks = vi.hoisted(() => ({ value: [] as WorkspaceNavLink[] }));

vi.mock('src/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    navLinks: { value: navLinks.value },
    meta: { value: { label: 'Forex', icon: 'candlestick_chart', color: 'deep-purple-5' } },
  }),
}));

const LINKS: WorkspaceNavLink[] = [
  { title: 'Dashboard', icon: 'space_dashboard', link: '/Dashboard', primary: true },
  { title: 'Journal', icon: 'edit_note', link: '/Journal', primary: true },
  { title: 'Classroom', icon: 'school', link: '/Classroom' },
  { title: 'Coach Room', icon: 'record_voice_over', link: '/Coach', paid: true },
];

function mountNav() {
  return mount(BottomNavBar, { attachTo: document.body });
}

/** เปิดชีต More แล้วคืน element ทั้งหมดในนั้น (q-menu teleport ไป body) */
async function openSheet(wrapper: ReturnType<typeof mountNav>) {
  await wrapper.find('[data-test="bottom-nav-more"]').trigger('click');
  await nextTick();
  await nextTick();
  return Array.from(document.querySelectorAll('[data-test="bottom-nav-sheet-item"]'));
}

describe('BottomNavBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    vi.clearAllMocks();
    navLinks.value = LINKS;
  });

  it('โชว์เฉพาะลิงก์ที่ตั้ง primary ไว้บน dock', () => {
    const wrapper = mountNav();

    const titles = wrapper
      .findAll('[data-test="bottom-nav-item"] .bottom-nav-label')
      .map((node) => node.text().trim());

    expect(titles).toEqual(['Dashboard', 'Journal']);
  });

  it('ตัวที่เหลืออยู่ในชีต More ครบ ไม่มีเมนูไหนกดไม่ถึง', async () => {
    const wrapper = mountNav();
    const items = await openSheet(wrapper);

    const titles = items.map((node) =>
      (node.querySelector('.bottom-nav-grid-label')?.textContent ?? '').trim(),
    );

    expect(titles).toEqual(['Classroom', 'Coach Room']);
  });

  it('ลิงก์ที่ตั้ง paid ไว้ ผู้ใช้แพ็กฟรีเห็นเป็นปุ่มล็อก ไม่ใช่ลิงก์', async () => {
    const userStore = useUserStore();
    userStore.profile = null; // แพ็กฟรี
    expect(userStore.isPaidUser).toBe(false);

    const wrapper = mountNav();
    const items = await openSheet(wrapper);
    const coach = items.find((node) => node.textContent?.includes('Coach Room'));

    expect(coach?.getAttribute('data-locked')).toBe('true');
    expect(coach?.tagName).toBe('BUTTON');
    expect(coach?.querySelector('.bottom-nav-lock'), 'ต้องมีไอคอนกุญแจ').not.toBeNull();
    expect(coach?.className).toContain('bottom-nav-grid-item--locked');
  });

  it('กดเมนูที่ล็อก -> เด้งไปหน้าอัปเกรด ไม่ใช่หน้าเป้าหมาย', async () => {
    const userStore = useUserStore();
    userStore.profile = null;

    const wrapper = mountNav();
    const items = await openSheet(wrapper);
    const coach = items.find((node) => node.textContent?.includes('Coach Room'));

    (coach as HTMLButtonElement).click();
    await nextTick();

    expect(routerPush).toHaveBeenCalledWith('/Upgrade');
    expect(routerPush).not.toHaveBeenCalledWith('/Coach');
  });

  it('ผู้ใช้แบบเสียเงินเห็นเมนูเดียวกันเป็นลิงก์ปกติ ไม่มีกุญแจ', async () => {
    const userStore = useUserStore();
    userStore.profile = {
      id: 1,
      username: 'paid',
      full_name: 'Paid User',
      email: 'paid@wisenancial.app',
      role: 'USER',
      subscription_tier: 'PACK_279',
    } as unknown as typeof userStore.profile;

    expect(userStore.isPaidUser).toBe(true);

    const wrapper = mountNav();
    const items = await openSheet(wrapper);
    const coach = items.find((node) => node.textContent?.includes('Coach Room'));

    expect(coach?.getAttribute('data-locked')).toBeNull();
    expect(coach?.querySelector('.bottom-nav-lock')).toBeNull();
  });

  it('ปุ่ม Leaderboard/Missions ในชีต ส่ง event ออกไปให้ MainLayout เปิด dialog', async () => {
    const wrapper = mountNav();
    await openSheet(wrapper);

    (document.querySelector('[data-test="bottom-nav-leaderboard"]') as HTMLElement).click();
    await nextTick();
    (document.querySelector('[data-test="bottom-nav-missions"]') as HTMLElement).click();
    await nextTick();

    expect(wrapper.emitted('open-leaderboard')).toHaveLength(1);
    expect(wrapper.emitted('open-missions')).toHaveLength(1);
  });

  it('เปลี่ยนชุดเมนู (สลับโหมด) แล้ว dock เปลี่ยนตาม', () => {
    const wrapper = mountNav();
    expect(
      wrapper.findAll('[data-test="bottom-nav-item"] .bottom-nav-label').map((n) => n.text()),
    ).toContain('Journal');

    navLinks.value = [
      { title: 'Dashboard', icon: 'space_dashboard', link: '/Dashboard', primary: true },
      { title: 'Stock Record', icon: 'edit_note', link: '/StockRecord', primary: true },
    ];
    // navLinks ที่ mock ไว้ไม่ reactive — mount ใหม่แทน เพราะสิ่งที่อยากยืนยันคือ
    // "dock อ่านจาก useWorkspace ทุกครั้ง" ไม่ได้ hardcode รายการไว้ในตัวเอง
    const next = mountNav();
    const titles = next
      .findAll('[data-test="bottom-nav-item"] .bottom-nav-label')
      .map((node) => node.text().trim());

    expect(titles).toEqual(['Dashboard', 'Stock Record']);
    expect(titles).not.toContain('Journal');
  });
});

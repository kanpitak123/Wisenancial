import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useBrokerConnectionStore } from 'stores/BrokerConnectionStore';
import PortfolioPage from './PortfolioPage.vue';
import type { Portfolio, PortfolioQuota, PortfolioType } from 'src/types/portfolio.types';
import type { BrokerConnection } from 'src/types/broker-connection.types';

// หน้านี้ไม่ได้เทส data-fetching — ตัด service ออกให้ mount ได้โดยไม่แตะ axios
vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(),
    getQuota: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const brokerList = vi.fn().mockResolvedValue([]);
vi.mock('src/services/broker-connection.service', () => ({
  brokerConnectionService: {
    list: (...args: unknown[]) => brokerList(...args),
    create: vi.fn(),
    get: vi.fn(),
    revoke: vi.fn(),
    rotateKey: vi.fn(),
    remove: vi.fn(),
  },
  getBrokerConnectionErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

// useWorkspace ดึง router เข้ามา ซึ่งเทสนี้ไม่ได้ติดตั้ง
vi.mock('src/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    meta: { value: { label: 'Stock', icon: 'trending_up', color: 'teal-5' } },
  }),
}));

// broker badge navigate ผ่าน useRouter().push() — เทสนี้ไม่ได้ติดตั้ง router จริง (แบบเดียวกับ
// WatchlistPage.spec.ts)
const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

function portfolioFixture(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 1,
    user_id: 1,
    name: 'Test Portfolio',
    initial_balance: 10000,
    current_balance: 10000,
    portfolio_type: 'TRADER',
    investor_cost_method: 'FIFO',
    currency: 'USD',
    icon: null,
    color: null,
    is_default: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function brokerConnectionFixture(overrides: Partial<BrokerConnection> = {}): BrokerConnection {
  return {
    id: 1,
    user_id: 1,
    portfolio_id: null,
    broker_type: 'MT5',
    external_account_id: null,
    broker_server: null,
    oauth_token_expires_at: null,
    status: 'ACTIVE',
    last_heartbeat_at: null,
    last_sync_at: null,
    last_snapshot_sequence: null,
    last_error_code: null,
    last_error_message: null,
    last_error_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function quota(max: number, trader: number, investor: number): PortfolioQuota {
  const used = trader + investor;

  return {
    max,
    used,
    remaining: Math.max(0, max - used),
    byType: { TRADER: trader, INVESTOR: investor },
  };
}

/**
 * mount หน้าโดยกำหนดโควต้าไว้ล่วงหน้า
 *
 * q-page ต้องอยู่ใต้ q-layout > q-page-container ไม่งั้น Quasar จะไม่ render อะไรเลย
 * ("QPage needs to be a deep child of QLayout")
 */
async function mountPage(preset: PortfolioQuota | null, activeType: PortfolioType = 'INVESTOR') {
  const store = usePortfolioStore();

  store.hasLoadedAll = true;
  store.quota = preset;
  store.activeType = activeType;

  // ใช้ render function ไม่ใช่ template string — vitest ใช้ Vue รุ่น runtime-only
  // ที่ compile template ตอนรันไม่ได้ และ q-* ก็ไม่ได้ถูก register แบบ global
  const wrapper = mount(
    {
      render: () => h(QLayout, () => [h(QPageContainer, () => [h(PortfolioPage)])]),
    },
    { attachTo: document.body },
  );

  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();

  return { wrapper, store };
}

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

describe('PortfolioPage — แถบโควต้า', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('โควต้าเหลือ -> โชว์ "ใช้ไป 2/3 พอร์ต" พร้อมแยกตามโหมด', async () => {
    const { wrapper } = await mountPage(quota(3, 1, 1));

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 2/3 พอร์ต');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 1');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Forex 1');
  });

  it('byType แสดงตัวเลขแยกโหมดถูกต้องเมื่อสัดส่วนไม่เท่ากัน', async () => {
    const { wrapper } = await mountPage(quota(5, 1, 3));

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 4/5 พอร์ต');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 3');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Forex 1');
  });

  it('โควต้าเหลือ -> ปุ่มสร้างพอร์ตกดได้ และไม่มีปุ่มอัปเกรด', async () => {
    const { wrapper } = await mountPage(quota(3, 1, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(false);
    expect(byTest(wrapper, 'quota-full-note').exists()).toBe(false);
  });

  it('โควต้าเต็ม -> ปุ่มสร้างพอร์ต disable', async () => {
    const { wrapper } = await mountPage(quota(3, 2, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
  });

  it('โควต้าเต็ม -> โชว์ปุ่มอัปเกรดและลิงก์ไป /Upgrade', async () => {
    const { wrapper } = await mountPage(quota(3, 3, 0));

    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(true);

    const note = byTest(wrapper, 'quota-full-note');

    expect(note.exists()).toBe(true);
    expect(note.text()).toContain('ใช้โควต้าครบแล้ว');
    expect(note.html()).toContain('/Upgrade');
  });

  it('โควต้าเต็ม -> ปุ่มถูก disable จนกดเปิด dialog ไม่ได้', async () => {
    const { wrapper } = await mountPage(quota(2, 1, 1));

    const button = byTest(wrapper, 'create-portfolio-btn');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-disabled')).toBe('true');

    await button.trigger('click');
    await wrapper.vm.$nextTick();

    // dialog ของ Quasar render ผ่าน portal — เช็คว่าไม่มี dialog โผล่ใน document
    expect(document.body.querySelector('.q-dialog')).toBeNull();
  });

  it('ยังโหลดโควต้าไม่เสร็จ (quota = null) -> ไม่ disable ปุ่มไว้ก่อน', async () => {
    const { wrapper } = await mountPage(null);

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(false);
    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 0 พอร์ต');
  });

  it('สร้างพอร์ตสำเร็จ -> แถบโควต้าขยับทันทีและปุ่มถูก disable เมื่อเต็ม', async () => {
    const { wrapper, store } = await mountPage(quota(3, 1, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();

    // จำลองผลของ createPortfolio() ที่ขยับตัวเลขในเครื่องทันที
    store.applyQuotaDelta('INVESTOR', 1);
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 3/3 พอร์ต');
    expect(byTest(wrapper, 'quota-breakdown').text()).toContain('Stock 2');
    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(true);
  });

  it('ลบพอร์ตแล้วโควต้าคืน -> ปุ่มกลับมากดได้', async () => {
    const { wrapper, store } = await mountPage(quota(2, 1, 1));

    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeDefined();

    store.applyQuotaDelta('TRADER', -1);
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'quota-label').text()).toContain('ใช้ไป 1/2 พอร์ต');
    expect(byTest(wrapper, 'create-portfolio-btn').attributes('disabled')).toBeUndefined();
    expect(byTest(wrapper, 'upgrade-btn').exists()).toBe(false);
  });
});

describe('PortfolioPage — broker connection badge (MT5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    brokerList.mockResolvedValue([]);
  });

  it('ไม่แสดงป้าย broker บนพอร์ตประเภท INVESTOR (MT5 ผูกได้แค่ Forex/TRADER)', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 1, portfolio_type: 'INVESTOR' })];

    const { wrapper } = await mountPage(quota(3, 0, 1), 'INVESTOR');

    expect(byTest(wrapper, 'broker-badge-1').exists()).toBe(false);
  });

  it('แสดงป้ายแบบยังไม่เชื่อมต่อ (muted) บนพอร์ต TRADER ที่ไม่มี connection ผูกอยู่', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 1, portfolio_type: 'TRADER' })];
    useBrokerConnectionStore().connections = [];

    const { wrapper } = await mountPage(quota(3, 1, 0), 'TRADER');

    const badge = byTest(wrapper, 'broker-badge-1');
    expect(badge.exists()).toBe(true);
    expect(badge.classes()).not.toContain('broker-badge--connected');
  });

  it('แสดงป้ายแบบเชื่อมต่อแล้วเมื่อมี connection ผูกกับ portfolio นี้อยู่', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 1, portfolio_type: 'TRADER' })];
    useBrokerConnectionStore().connections = [brokerConnectionFixture({ id: 9, portfolio_id: 1 })];

    const { wrapper } = await mountPage(quota(3, 1, 0), 'TRADER');

    const badge = byTest(wrapper, 'broker-badge-1');
    expect(badge.exists()).toBe(true);
    expect(badge.classes()).toContain('broker-badge--connected');
  });

  it('ไม่ถือว่าเชื่อมต่อถ้า connection ที่ผูกอยู่ถูก REVOKED ไปแล้ว', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 1, portfolio_type: 'TRADER' })];
    useBrokerConnectionStore().connections = [
      brokerConnectionFixture({ id: 9, portfolio_id: 1, status: 'REVOKED' }),
    ];

    const { wrapper } = await mountPage(quota(3, 1, 0), 'TRADER');

    expect(byTest(wrapper, 'broker-badge-1').classes()).not.toContain('broker-badge--connected');
  });

  it('กดป้ายแล้วเปิด ConnectMt5Wizard (แทนการเด้งไป /BrokerConnections ตรงๆ) โดยไม่ trigger selectPort', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 42, portfolio_type: 'TRADER' })];
    useBrokerConnectionStore().connections = [];

    const { wrapper } = await mountPage(quota(3, 1, 0), 'TRADER');
    const notifySpyBefore = store.activePortfolioId;

    await byTest(wrapper, 'broker-badge-42').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(new DOMWrapper(document.body.querySelector('[data-test="wizard-step-1"]')).exists()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    // @click.stop บนป้ายต้องกัน event ไม่ให้ไหลไปโดน @click ของการ์ด (selectPort)
    expect(store.activePortfolioId).toBe(notifySpyBefore);
  });

  it('ลิงก์ "จัดการขั้นสูง" ในตัว wizard พาไป /BrokerConnections พร้อม query portfolio_id ของพอร์ตนั้น', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 42, portfolio_type: 'TRADER' })];
    useBrokerConnectionStore().connections = [];

    const { wrapper } = await mountPage(quota(3, 1, 0), 'TRADER');

    await byTest(wrapper, 'broker-badge-42').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    await new DOMWrapper(document.body.querySelector('[data-test="wizard-manage-link"]')).trigger('click');

    expect(push).toHaveBeenCalledWith({
      path: '/BrokerConnections',
      query: { portfolio_id: '42' },
    });
  });

  it('ไม่ยิง loadConnections() ซ้ำถ้า broker connections โหลดมาแล้ว (มี connections อยู่ใน state ก่อน mount)', async () => {
    const store = usePortfolioStore();
    store.portfolios = [portfolioFixture({ id: 1, portfolio_type: 'TRADER' })];
    useBrokerConnectionStore().connections = [brokerConnectionFixture({ id: 9, portfolio_id: 1 })];

    await mountPage(quota(3, 1, 0), 'TRADER');

    expect(brokerList).not.toHaveBeenCalled();
  });
});

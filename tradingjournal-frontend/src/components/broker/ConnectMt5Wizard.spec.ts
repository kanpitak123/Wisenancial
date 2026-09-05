import { DOMWrapper, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useBrokerConnectionStore } from 'stores/BrokerConnectionStore';
import ConnectMt5Wizard from './ConnectMt5Wizard.vue';
import type { BrokerConnection } from 'src/types/broker-connection.types';
import type { Portfolio } from 'src/types/portfolio.types';
import type * as QuasarModule from 'quasar';

const list = vi.fn();
const create = vi.fn();
const get = vi.fn();
const rotateKey = vi.fn();

vi.mock('src/services/broker-connection.service', () => ({
  brokerConnectionService: {
    list: (...args: unknown[]) => list(...args),
    create: (...args: unknown[]) => create(...args),
    get: (...args: unknown[]) => get(...args),
    revoke: vi.fn(),
    rotateKey: (...args: unknown[]) => rotateKey(...args),
    remove: vi.fn(),
  },
  getBrokerConnectionErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: vi.fn().mockResolvedValue([]),
    getQuota: vi.fn(),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const notify = vi.fn();
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof QuasarModule>();
  return { ...actual, useQuasar: () => ({ notify }) };
});

function portfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 42,
    user_id: 1,
    name: 'Forex Main',
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

function connection(overrides: Partial<BrokerConnection> = {}): BrokerConnection {
  return {
    id: 7,
    user_id: 1,
    portfolio_id: 42,
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

const byBody = (name: string) => new DOMWrapper(document.body.querySelector(`[data-test="${name}"]`));

let clipboardWriteText: ReturnType<typeof vi.fn>;

async function mountWizard(portfolioId: number | null = 42) {
  const wrapper = mount(ConnectMt5Wizard, {
    props: { modelValue: false, portfolioId },
    attachTo: document.body,
  });

  await wrapper.setProps({ modelValue: true });
  await vi.advanceTimersByTimeAsync(0);
  await wrapper.vm.$nextTick();

  return wrapper;
}

describe('ConnectMt5Wizard', () => {
  beforeEach(() => {
    // QDialog teleports into document.body and its leave-transition depends on real
    // rAF/timers — under fake timers that transition never resolves, so a previous
    // test's dialog DOM can linger past its own wrapper.unmount(). Force a clean slate
    // every test instead of relying on that cleanup finishing in time.
    document.body.innerHTML = '';
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    // default: store.connections ควรเป็น [] เสมอถ้า test ไม่ได้ตั้งค่าอื่น — ไม่งั้น
    // BrokerConnectionStore.loadConnections() จะ set connections เป็น undefined (จาก
    // `await list()` ที่ไม่มี resolved value) แล้วพัง .find()/spread ทุกจุดที่ตามมา
    list.mockResolvedValue([]);

    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });

    usePortfolioStore().portfolios = [portfolio()];
    useBrokerConnectionStore().connections = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no existing connection for the portfolio -> starts at step 1 with the portfolio pre-filled', async () => {
    const wrapper = await mountWizard(42);

    expect(byBody('wizard-step-1').exists()).toBe(true);
    expect(byBody('wizard-create-btn').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('no portfolio in context and none selected -> create button stays disabled', async () => {
    usePortfolioStore().portfolios = [];
    const wrapper = await mountWizard(null);

    expect(byBody('wizard-create-btn').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('creating a connection reveals the API key once and moves to step 2', async () => {
    create.mockResolvedValue({ connection: connection(), apiKey: 'wsb_fresh_key' });
    const wrapper = await mountWizard(42);

    await byBody('wizard-create-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(create).toHaveBeenCalledWith({ broker_type: 'MT5', portfolio_id: 42 });
    expect(byBody('wizard-step-2').exists()).toBe(true);
    wrapper.unmount();
  });

  it('an existing connection for the portfolio -> resumes straight at step 5, not step 1', async () => {
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42 })];
    get.mockResolvedValue(connection({ id: 9, portfolio_id: 42 }));

    const wrapper = await mountWizard(42);

    expect(byBody('wizard-step-5').exists()).toBe(true);
    expect(byBody('wizard-step-1').exists()).toBe(false);
    wrapper.unmount();
  });

  it('resumes from a stored step in localStorage instead of the step-5 default', async () => {
    localStorage.setItem('mt5_wizard_step_9', '3');
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42 })];

    const wrapper = await mountWizard(42);

    expect(byBody('wizard-step-3').exists()).toBe(true);
    wrapper.unmount();
  });

  it('step 2 links directly to the .ex5 download and copies the Experts folder path', async () => {
    create.mockResolvedValue({ connection: connection(), apiKey: 'wsb_fresh_key' });
    const wrapper = await mountWizard(42);
    await byBody('wizard-create-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(byBody('wizard-download-ea-btn').attributes('href')).toBe('/downloads/WisenancialMT5EA.ex5');

    await byBody('wizard-copy-path-btn').trigger('click');
    expect(clipboardWriteText).toHaveBeenCalledWith('MQL5\\Experts');
    wrapper.unmount();
  });

  it('step 3 shows the exact WebRequest URL to whitelist with a working copy button', async () => {
    create.mockResolvedValue({ connection: connection(), apiKey: 'wsb_fresh_key' });
    const wrapper = await mountWizard(42);
    await byBody('wizard-create-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    await byBody('wizard-next-btn').trigger('click'); // step 2 -> 3

    const url = byBody('wizard-webrequest-url').text();
    expect(url).toBe('http://localhost:3000');

    await byBody('wizard-copy-url-btn').trigger('click');
    expect(clipboardWriteText).toHaveBeenCalledWith('http://localhost:3000');
    wrapper.unmount();
  });

  it('step 4 shows the freshly-revealed API key with a one-time warning banner', async () => {
    create.mockResolvedValue({ connection: connection(), apiKey: 'wsb_fresh_key' });
    const wrapper = await mountWizard(42);
    await byBody('wizard-create-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    await byBody('wizard-next-btn').trigger('click'); // 2 -> 3
    await byBody('wizard-next-btn').trigger('click'); // 3 -> 4

    expect(byBody('wizard-one-time-key-banner').exists()).toBe(true);
    expect(byBody('wizard-api-key-value').text()).toBe('wsb_fresh_key');
    wrapper.unmount();
  });

  it('step 4 on a resumed connection (key unknown) offers "generate a new key" instead of showing one', async () => {
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42 })];
    localStorage.setItem('mt5_wizard_step_9', '4');
    rotateKey.mockResolvedValue({ connection: connection({ id: 9, portfolio_id: 42 }), apiKey: 'wsb_rotated' });

    const wrapper = await mountWizard(42);

    expect(byBody('wizard-key-unknown-banner').exists()).toBe(true);
    expect(byBody('wizard-api-key-value').exists()).toBe(false);

    await byBody('wizard-generate-key-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(rotateKey).toHaveBeenCalledWith(9);
    expect(byBody('wizard-api-key-value').text()).toBe('wsb_rotated');
    wrapper.unmount();
  });

  it('step 5 polls the connection and shows the waiting state with no heartbeat yet', async () => {
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42 })];
    get.mockResolvedValue(connection({ id: 9, portfolio_id: 42 }));

    const wrapper = await mountWizard(42);
    expect(byBody('wizard-waiting-banner').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(get).toHaveBeenCalledWith(9);
    wrapper.unmount();
  });

  it('step 5 shows a troubleshooting checklist after 2 minutes of waiting with no error', async () => {
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42 })];
    get.mockResolvedValue(connection({ id: 9, portfolio_id: 42 }));

    const wrapper = await mountWizard(42);
    expect(byBody('wizard-troubleshooting').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(120_000);
    await wrapper.vm.$nextTick();

    expect(byBody('wizard-troubleshooting').exists()).toBe(true);
    wrapper.unmount();
  });

  it('step 5 shows the connected state once external_account_id + last_sync_at are set', async () => {
    useBrokerConnectionStore().connections = [
      connection({
        id: 9,
        portfolio_id: 42,
        external_account_id: '555444',
        broker_server: 'Broker-Live-01',
        last_heartbeat_at: '2026-09-06T00:00:00Z',
        last_sync_at: '2026-09-06T00:00:00Z',
      }),
    ];

    const wrapper = await mountWizard(42);

    expect(byBody('wizard-connected-banner').text()).toContain('555444');
    expect(byBody('wizard-connected-banner').text()).toContain('Broker-Live-01');
    wrapper.unmount();
  });

  it('step 5 shows the specific last_error reason instead of an indefinite spinner', async () => {
    useBrokerConnectionStore().connections = [
      connection({
        id: 9,
        portfolio_id: 42,
        last_error_code: 'ACCOUNT_MISMATCH',
        last_error_message: 'accountLogin ไม่ตรงกับที่ pin ไว้',
      }),
    ];

    const wrapper = await mountWizard(42);

    expect(byBody('wizard-error-banner').text()).toContain('บัญชี MT5 ที่ EA ต่ออยู่ไม่ตรงกับบัญชีที่เคยเชื่อมกับ API key นี้ครั้งแรก');
    expect(byBody('wizard-error-banner').text()).toContain('accountLogin ไม่ตรงกับที่ pin ไว้');
    wrapper.unmount();
  });

  it('step 5 on a REVOKED connection offers "generate a new key" and returns to step 4', async () => {
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42, status: 'REVOKED' })];
    rotateKey.mockResolvedValue({
      connection: connection({ id: 9, portfolio_id: 42, status: 'ACTIVE' }),
      apiKey: 'wsb_rotated',
    });

    const wrapper = await mountWizard(42);
    expect(byBody('wizard-invalid-key-banner').exists()).toBe(true);

    await byBody('wizard-generate-key-from-error-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(rotateKey).toHaveBeenCalledWith(9);
    expect(byBody('wizard-step-4').exists()).toBe(true);
    expect(byBody('wizard-api-key-value').text()).toBe('wsb_rotated');
    wrapper.unmount();
  });

  it('the manual "check now" button re-fetches immediately without waiting for the poll interval', async () => {
    useBrokerConnectionStore().connections = [connection({ id: 9, portfolio_id: 42 })];
    get.mockResolvedValue(connection({ id: 9, portfolio_id: 42 }));

    const wrapper = await mountWizard(42);
    get.mockClear();

    await byBody('wizard-check-now-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(get).toHaveBeenCalledWith(9);
    wrapper.unmount();
  });

  it('"จัดการขั้นสูง" closes the wizard and emits manage', async () => {
    const wrapper = await mountWizard(42);

    await byBody('wizard-manage-link').trigger('click');

    expect(wrapper.emitted('manage')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
});

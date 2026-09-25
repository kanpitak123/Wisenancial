import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Mt5CloudConnectorCard from './Mt5CloudConnectorCard.vue';
import type * as QuasarModule from 'quasar';

const listRecords = vi.fn();
const listDeployLog = vi.fn();
const connect = vi.fn();
const sync = vi.fn();
const getStatus = vi.fn();
const getAccount = vi.fn();
const getPositions = vi.fn();
const getDeals = vi.fn();
const disconnect = vi.fn();

vi.mock('src/services/mt5-cloud-connector.service', () => ({
  mt5CloudConnectorService: {
    listRecords: (...args: unknown[]) => listRecords(...args),
    listDeployLog: (...args: unknown[]) => listDeployLog(...args),
    connect: (...args: unknown[]) => connect(...args),
    sync: (...args: unknown[]) => sync(...args),
    getStatus: (...args: unknown[]) => getStatus(...args),
    getAccount: (...args: unknown[]) => getAccount(...args),
    getPositions: (...args: unknown[]) => getPositions(...args),
    getDeals: (...args: unknown[]) => getDeals(...args),
    disconnect: (...args: unknown[]) => disconnect(...args),
  },
  getMt5CloudConnectorErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const notify = vi.fn();
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof QuasarModule>();
  return { ...actual, useQuasar: () => ({ notify }) };
});

// data-test on q-input lands directly on the native <input> (not a wrapping label), so
// byTest() alone is the input element — no extra .find('input') needed.
const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

const ACCOUNT_SNAPSHOT = {
  broker: 'Exness Technologies Ltd',
  currency: 'USD',
  balance: 1000200,
  equity: 863516,
  margin: 101497.76,
  freeMargin: 762018.24,
  marginLevel: 850.77,
  leverage: 500,
  credit: 0,
};

async function mountCard() {
  const wrapper = mount(Mt5CloudConnectorCard, { attachTo: document.body });
  await vi.advanceTimersByTimeAsync(0);
  await wrapper.vm.$nextTick();
  return wrapper;
}

async function fillAndConsent(wrapper: VueWrapper) {
  await byTest(wrapper, 'cloud-login').setValue('414307761');
  await byTest(wrapper, 'cloud-investor-password').setValue('Tester@123');
  await byTest(wrapper, 'consent-checkbox').trigger('click');
}

describe('Mt5CloudConnectorCard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useFakeTimers();

    listRecords.mockResolvedValue([]);
    listDeployLog.mockResolvedValue([]);
    getPositions.mockResolvedValue([]);
    getDeals.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('picking a broker preset pre-fills the server field, and it stays editable', async () => {
    const wrapper = await mountCard();

    // Default preset is Exness — server should already be pre-filled on mount.
    const serverInput = byTest(wrapper, 'cloud-server');
    expect((serverInput.element as HTMLInputElement).value).toBe('Exness-MT5Trial');

    await serverInput.setValue('MyCustomServer-01');
    expect((serverInput.element as HTMLInputElement).value).toBe('MyCustomServer-01');
  });

  it('disables the connect button until login, password, server, and consent are all filled', async () => {
    const wrapper = await mountCard();

    const btn = byTest(wrapper, 'cloud-connect-btn');
    expect(btn.attributes('disabled')).toBeDefined();

    await byTest(wrapper, 'cloud-login').setValue('414307761');
    await byTest(wrapper, 'cloud-investor-password').setValue('Tester@123');
    expect(btn.attributes('disabled')).toBeDefined();

    await byTest(wrapper, 'consent-checkbox').trigger('click');
    await wrapper.vm.$nextTick();

    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('connect -> polls status until CONNECTED -> loads account/positions/deals', async () => {
    connect.mockResolvedValue({ kind: 'CLOUD', ref: 'ref-1' });
    getStatus
      .mockResolvedValueOnce({ state: 'CONNECTING', checkedAt: new Date().toISOString() })
      .mockResolvedValueOnce({ state: 'CONNECTED', checkedAt: new Date().toISOString() });
    getAccount.mockResolvedValue(ACCOUNT_SNAPSHOT);

    const wrapper = await mountCard();
    await fillAndConsent(wrapper);
    await byTest(wrapper, 'cloud-connect-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(connect).toHaveBeenCalledWith('414307761', 'Tester@123', 'Exness-MT5Trial', true);
    expect(getStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await wrapper.vm.$nextTick();

    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(getAccount).toHaveBeenCalledWith('ref-1');
    expect(wrapper.text()).toContain('1000200.00');
  });

  it('an existing single record auto-activates on mount via sync(auto)', async () => {
    listRecords.mockResolvedValue([
      {
        id: 'ref-existing',
        login: '414307761',
        server: 'Exness-MT5Trial6',
        metaApiAccountId: 'meta-1',
        deployState: 'UNDEPLOYED',
        createdAt: new Date().toISOString(),
        connectedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
    ]);
    sync.mockResolvedValue({ state: 'CONNECTED', redeployed: true });
    getAccount.mockResolvedValue(ACCOUNT_SNAPSHOT);

    await mountCard();

    expect(sync).toHaveBeenCalledWith('ref-existing', 'auto');
    expect(getAccount).toHaveBeenCalledWith('ref-existing');
  });

  it('manual refresh button calls sync with trigger "manual"', async () => {
    connect.mockResolvedValue({ kind: 'CLOUD', ref: 'ref-1' });
    getStatus.mockResolvedValue({ state: 'CONNECTED', checkedAt: new Date().toISOString() });
    getAccount.mockResolvedValue(ACCOUNT_SNAPSHOT);
    sync.mockResolvedValue({ state: 'CONNECTED', redeployed: false });

    const wrapper = await mountCard();
    await fillAndConsent(wrapper);
    await byTest(wrapper, 'cloud-connect-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    await wrapper.vm.$nextTick();

    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('รีเฟรช'));
    await refreshBtn?.trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(sync).toHaveBeenCalledWith('ref-1', 'manual');
  });

  it('disconnect calls the deterministic disconnect path and resets to the connect form', async () => {
    connect.mockResolvedValue({ kind: 'CLOUD', ref: 'ref-1' });
    getStatus.mockResolvedValue({ state: 'CONNECTED', checkedAt: new Date().toISOString() });
    getAccount.mockResolvedValue(ACCOUNT_SNAPSHOT);
    disconnect.mockResolvedValue(undefined);

    const wrapper = await mountCard();
    await fillAndConsent(wrapper);
    await byTest(wrapper, 'cloud-connect-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    await wrapper.vm.$nextTick();

    const disconnectBtn = wrapper.findAll('button').find((b) => b.text().includes('ยกเลิกการเชื่อมต่อ'));
    await disconnectBtn?.trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    await wrapper.vm.$nextTick();

    expect(disconnect).toHaveBeenCalledWith('ref-1');
    expect(byTest(wrapper, 'cloud-connect-btn').exists()).toBe(true);
  });

  it('stops polling on unmount — no further sync/status calls after the component is gone', async () => {
    connect.mockResolvedValue({ kind: 'CLOUD', ref: 'ref-1' });
    getStatus.mockResolvedValue({ state: 'CONNECTED', checkedAt: new Date().toISOString() });
    getAccount.mockResolvedValue(ACCOUNT_SNAPSHOT);
    sync.mockResolvedValue({ state: 'CONNECTED', redeployed: false });

    const wrapper = await mountCard();
    await fillAndConsent(wrapper);
    await byTest(wrapper, 'cloud-connect-btn').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    const syncCallsBeforeUnmount = sync.mock.calls.length;

    wrapper.unmount();

    // Advance well past the 60s keep-alive poll interval — this is the actual
    // mechanism behind "closing the tab lets the backend idle-undeploy": if polling
    // didn't stop, sync() would keep getting called here.
    await vi.advanceTimersByTimeAsync(180_000);

    expect(sync.mock.calls.length).toBe(syncCallsBeforeUnmount);
  });
});

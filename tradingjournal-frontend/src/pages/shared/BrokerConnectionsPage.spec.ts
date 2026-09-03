import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrokerConnectionStore } from 'stores/BrokerConnectionStore';
import BrokerConnectionsPage from './BrokerConnectionsPage.vue';
import type { BrokerConnection } from 'src/types/broker-connection.types';
import type * as QuasarModule from 'quasar';

const list = vi.fn();
const create = vi.fn();
const revoke = vi.fn();
const rotateKey = vi.fn();
const remove = vi.fn();

vi.mock('src/services/broker-connection.service', () => ({
  brokerConnectionService: {
    list: (...args: unknown[]) => list(...args),
    create: (...args: unknown[]) => create(...args),
    revoke: (...args: unknown[]) => revoke(...args),
    rotateKey: (...args: unknown[]) => rotateKey(...args),
    remove: (...args: unknown[]) => remove(...args),
  },
  getBrokerConnectionErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const getAll = vi.fn();
const getQuota = vi.fn();

vi.mock('src/services/portfolio.service', () => ({
  portfolioService: {
    getAll: (...args: unknown[]) => getAll(...args),
    getQuota: (...args: unknown[]) => getQuota(...args),
  },
  getPortfolioErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const socketConnect = vi.fn();
const socketDisconnect = vi.fn();

vi.mock('src/services/broker-sync-socket.service', () => ({
  brokerSyncSocketService: {
    connect: (...args: unknown[]) => socketConnect(...args),
    disconnect: (...args: unknown[]) => socketDisconnect(...args),
    disconnectListeners: vi.fn(),
  },
}));

// isMockEnabled() would otherwise no-op connectSocket() depending on how Vitest's
// import.meta.env happens to resolve — force it deterministic instead of relying on
// that, same reasoning as mocking every other real dependency in this file.
vi.mock('src/mocks/mock.config', () => ({ isMockEnabled: () => false }));

// PortfolioPage.vue's broker badge navigates here with ?portfolio_id=<id> — mutable so
// individual tests can set it before mounting (แบบเดียวกับ WatchlistPage.spec.ts)
let routeQuery: Record<string, string> = {};
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/BrokerConnections', query: routeQuery, meta: {} }),
}));

// happy-dom ไม่มี scrollIntoView จริง — stub ไว้เป็น bound function อ้างอิงตรงๆ (ไม่ผ่าน
// Element.prototype.scrollIntoView ที่ eslint unbound-method ฟ้อง)
let scrollIntoViewMock = vi.fn();

// Full control over $q.dialog/$q.notify without fighting Quasar's real dialog DOM/portal
// rendering in happy-dom — no existing test in this repo exercises $q.dialog(), so this
// establishes the pattern rather than reusing one.
const notify = vi.fn();
const dialogHandlers: { onOk?: (() => void) | undefined } = {};
const dialog = vi.fn(() => {
  const chain = {
    onOk: (cb: () => void) => {
      dialogHandlers.onOk = cb;
      return chain;
    },
    onCancel: () => chain,
    onDismiss: () => chain,
  };
  return chain;
});

vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof QuasarModule>();
  return {
    ...actual,
    useQuasar: () => ({ notify, dialog }),
  };
});

function connection(overrides: Partial<BrokerConnection> = {}): BrokerConnection {
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
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

async function mountPage() {
  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(BrokerConnectionsPage)])]) },
    { attachTo: document.body },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();

  return wrapper;
}

describe('BrokerConnectionsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    dialogHandlers.onOk = undefined;
    routeQuery = {};
    scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    list.mockResolvedValue([]);
    getAll.mockResolvedValue([]);
    getQuota.mockResolvedValue({ used: { TRADER: 0, INVESTOR: 0 }, limit: { TRADER: 5, INVESTOR: 5 } });
  });

  it('mounts and shows the page title', async () => {
    const wrapper = await mountPage();

    expect(wrapper.exists()).toBe(true);
    expect(byTest(wrapper, 'broker-connections-title').text()).toContain('Broker Connections');
  });

  it('shows the empty state when there are no connections', async () => {
    const wrapper = await mountPage();

    expect(byTest(wrapper, 'connections-empty').exists()).toBe(true);
    expect(byTest(wrapper, 'connections-list').exists()).toBe(false);
  });

  it('lists existing connections with status and broker type', async () => {
    list.mockResolvedValue([connection({ id: 7, status: 'ACTIVE' }), connection({ id: 8, status: 'REVOKED' })]);

    const wrapper = await mountPage();

    expect(byTest(wrapper, 'connections-list').exists()).toBe(true);
    expect(byTest(wrapper, 'connection-7').exists()).toBe(true);
    expect(byTest(wrapper, 'connection-8').exists()).toBe(true);
    expect(byTest(wrapper, 'connection-7').text()).toContain('MT5');
  });

  it('creating a connection reveals the API key exactly once, in a dismissible banner', async () => {
    create.mockResolvedValue({
      connection: connection({ id: 9 }),
      apiKey: 'wsb_plaintext_key_shown_once',
    });

    const wrapper = await mountPage();
    expect(byTest(wrapper, 'api-key-banner').exists()).toBe(false);

    await byTest(wrapper, 'create-connection-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ broker_type: 'MT5' }));
    expect(byTest(wrapper, 'api-key-banner').exists()).toBe(true);
    expect(byTest(wrapper, 'api-key-value').text()).toBe('wsb_plaintext_key_shown_once');

    // dismiss -> banner gone, key never re-appears anywhere in the store either
    await byTest(wrapper, 'dismiss-api-key').trigger('click');
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'api-key-banner').exists()).toBe(false);
    expect(useBrokerConnectionStore().revealedApiKey).toBeNull();
  });

  it('copy button writes the revealed key to the clipboard', async () => {
    create.mockResolvedValue({ connection: connection({ id: 9 }), apiKey: 'wsb_copy_me' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const wrapper = await mountPage();
    await byTest(wrapper, 'create-connection-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    await byTest(wrapper, 'copy-api-key').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeText).toHaveBeenCalledWith('wsb_copy_me');
  });

  it('revoke asks for confirmation via $q.dialog before calling the API', async () => {
    list.mockResolvedValue([connection({ id: 7, status: 'ACTIVE' })]);
    revoke.mockResolvedValue(connection({ id: 7, status: 'REVOKED' }));

    const wrapper = await mountPage();
    await byTest(wrapper, 'revoke-btn').trigger('click');

    expect(dialog).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled(); // not called until the dialog is confirmed

    dialogHandlers.onOk?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(revoke).toHaveBeenCalledWith(7);
  });

  it('rotate-key asks for confirmation and reveals the new key once confirmed', async () => {
    list.mockResolvedValue([connection({ id: 7, status: 'ACTIVE' })]);
    rotateKey.mockResolvedValue({ connection: connection({ id: 7 }), apiKey: 'wsb_rotated_key' });

    const wrapper = await mountPage();
    await byTest(wrapper, 'rotate-key-btn').trigger('click');

    expect(rotateKey).not.toHaveBeenCalled();

    dialogHandlers.onOk?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(rotateKey).toHaveBeenCalledWith(7);
    expect(byTest(wrapper, 'api-key-value').text()).toBe('wsb_rotated_key');
  });

  it('delete asks for confirmation and removes the connection from the list once confirmed', async () => {
    list.mockResolvedValue([connection({ id: 7 })]);
    remove.mockResolvedValue({ message: 'ok' });

    const wrapper = await mountPage();
    expect(byTest(wrapper, 'connection-7').exists()).toBe(true);

    await byTest(wrapper, 'delete-btn').trigger('click');
    expect(remove).not.toHaveBeenCalled();

    dialogHandlers.onOk?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(remove).toHaveBeenCalledWith(7);
    expect(byTest(wrapper, 'connection-7').exists()).toBe(false);
  });

  it('a failed create does not crash the page and surfaces an error notification', async () => {
    create.mockRejectedValue(new Error('network down'));

    const wrapper = await mountPage();
    await byTest(wrapper, 'create-connection-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.exists()).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'negative' }));
    expect(byTest(wrapper, 'api-key-banner').exists()).toBe(false);
  });

  it('connects the realtime socket on mount and disconnects it on unmount', async () => {
    const wrapper = await mountPage();

    expect(socketConnect).toHaveBeenCalledTimes(1);
    expect(socketConnect).toHaveBeenCalledWith(expect.objectContaining({ onSyncUpdate: expect.any(Function) }));
    expect(socketDisconnect).not.toHaveBeenCalled();

    wrapper.unmount();

    expect(socketDisconnect).toHaveBeenCalledTimes(1);
  });

  it('an mt5_sync_update event triggers a refetch of the connections list, not a manual merge', async () => {
    list.mockResolvedValueOnce([]).mockResolvedValueOnce([connection({ id: 42 })]);

    const wrapper = await mountPage();
    expect(list).toHaveBeenCalledTimes(1);
    expect(byTest(wrapper, 'connection-42').exists()).toBe(false);

    const onSyncUpdate = socketConnect.mock.calls[0]?.[0]?.onSyncUpdate as (event: unknown) => void;
    onSyncUpdate({ connectionId: 42, eventType: 'DEALS', portfolioId: 3, appliedDealsCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(list).toHaveBeenCalledTimes(2);
    expect(byTest(wrapper, 'connection-42').exists()).toBe(true);
  });

  it('?portfolio_id=<id> ที่ยังไม่มี connection ผูกอยู่ -> pre-select portfolio นั้นในฟอร์มสร้าง connection', async () => {
    routeQuery = { portfolio_id: '42' };
    getAll.mockResolvedValue([{ id: 42, name: 'Forex Main', portfolio_type: 'TRADER' }]);
    create.mockResolvedValue({ connection: connection({ id: 9, portfolio_id: 42 }), apiKey: 'wsb_x' });

    const wrapper = await mountPage();
    await byTest(wrapper, 'create-connection-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ portfolio_id: 42 }));
  });

  it('?portfolio_id=<id> ที่มี connection ผูกอยู่แล้ว -> scroll ไปหา connection card นั้น (ไม่ยุ่งกับฟอร์มสร้าง)', async () => {
    routeQuery = { portfolio_id: '42' };
    list.mockResolvedValue([connection({ id: 9, portfolio_id: 42 }), connection({ id: 10, portfolio_id: 1 })]);

    const wrapper = await mountPage();

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // ไม่ถูก pre-select เข้าฟอร์มสร้าง เพราะ portfolio นี้มี connection อยู่แล้ว ไม่ใช่กรณีต้องสร้างใหม่
    // (selectedPortfolioId ยังเป็นค่าเริ่มต้น null -> create() ไม่ส่ง portfolio_id ไปเลย)
    create.mockResolvedValue({ connection: connection({ id: 11 }), apiKey: 'wsb_y' });
    await byTest(wrapper, 'create-connection-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(create).toHaveBeenCalledWith({ broker_type: 'MT5' });
  });

  it('?portfolio_id ของ connection ที่ถูก REVOKED ไปแล้ว -> ถือว่ายังไม่เชื่อมต่อ, pre-select แทนที่จะ scroll', async () => {
    routeQuery = { portfolio_id: '42' };
    list.mockResolvedValue([connection({ id: 9, portfolio_id: 42, status: 'REVOKED' })]);
    getAll.mockResolvedValue([{ id: 42, name: 'Forex Main', portfolio_type: 'TRADER' }]);
    create.mockResolvedValue({ connection: connection({ id: 12, portfolio_id: 42 }), apiKey: 'wsb_z' });

    const wrapper = await mountPage();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    await byTest(wrapper, 'create-connection-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ portfolio_id: 42 }));
  });
});

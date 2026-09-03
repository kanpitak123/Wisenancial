import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortfolioStore } from 'stores/PortfolioStore';
import JournalPage from './JournalPage.vue';
import type { Portfolio } from 'src/types/portfolio.types';
import type { Trade } from 'src/types/trade.types';
import type * as QuasarModule from 'quasar';

const getByPortfolio = vi.fn().mockResolvedValue([]);
const updateTrade = vi.fn();
const removeTrade = vi.fn();
const importTrades = vi.fn();

vi.mock('src/services/trade.service', () => ({
  tradeService: {
    getByPortfolio: (...args: unknown[]) => getByPortfolio(...args),
    getActive: vi.fn().mockResolvedValue([]),
    update: (...args: unknown[]) => updateTrade(...args),
    remove: (...args: unknown[]) => removeTrade(...args),
    importTrades: (...args: unknown[]) => importTrades(...args),
    createOpen: vi.fn(),
    createClosed: vi.fn(),
    close: vi.fn(),
    calculatePnl: vi.fn(),
    leaderboard: vi.fn().mockResolvedValue([]),
  },
  getTradeErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

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

vi.mock('src/services/records.service', () => ({
  recordsService: {
    getAll: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn(),
    createManual: vi.fn(),
  },
  getRecordsErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

const notify = vi.fn();
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<typeof QuasarModule>();
  return {
    ...actual,
    useQuasar: () => ({ notify, dark: { isActive: false } }),
  };
});

function portfolioFixture(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 1,
    user_id: 1,
    name: 'Forex Main',
    initial_balance: 10000,
    current_balance: 10500,
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

function tradeFixture(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    user_id: 1,
    portfolio_id: 1,
    import_id: null,
    broker: null,
    account_id: null,
    ticket_id: null,
    source: 'MANUAL',
    pair: 'XAUUSD',
    trade_type: 'BUY',
    volume: 1,
    open_price: 2350.5,
    close_price: 2360.5,
    stop_loss: null,
    take_profit: null,
    commission: 0,
    swap: 0,
    pnl: 100,
    result_status: 'WIN',
    opened_at: '2026-09-01T08:00:00Z',
    closed_at: '2026-09-01T09:00:00Z',
    timeframe: null,
    trend: null,
    strategy: null,
    emotion: null,
    entry_reason: null,
    note: null,
    asset_name: null,
    rsi: null,
    macd: null,
    target_points: null,
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-01T09:00:00Z',
    ...overrides,
  };
}

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

/**
 * q-dialog render ผ่าน teleport เข้า document.body โดยตรง (sibling ของ wrapper.element
 * ไม่ใช่ลูกของมัน) — wrapper.find() มองไม่เห็น ต้อง query จาก document.body ตรงๆ แล้ว
 * ห่อกลับเป็น DOMWrapper ถึงจะ .trigger()/.setValue() ได้ (แบบเดียวกับที่
 * BrokerConnectionsPage.spec.ts เลี่ยงด้วยการ mock $q.dialog() ทั้งก้อนแทน — แต่ dialog
 * ในหน้านี้เป็น <q-dialog> จริงที่ผูกกับฟอร์ม ต้องเทสของจริง)
 */
const byBody = (name: string) => new DOMWrapper(document.body.querySelector(`[data-test="${name}"]`));

async function mountPage() {
  const portStore = usePortfolioStore();
  portStore.portfolios = [portfolioFixture()];
  portStore.activeType = 'TRADER';
  portStore.activePortfolioIds = { TRADER: 1, INVESTOR: null };

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(JournalPage)])]) },
    { attachTo: document.body },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();

  return wrapper;
}

describe('JournalPage — Import CSV vs Sync MT5', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    getByPortfolio.mockResolvedValue([]);
  });

  it('แยกปุ่ม "Import from CSV" กับ "Sync MT5" ออกจากกันชัดเจน (ไม่มี "Import Broker" แบบเดิมที่กำกวมแล้ว)', async () => {
    const wrapper = await mountPage();

    expect(byTest(wrapper, 'import-csv-btn').exists()).toBe(true);
    expect(byTest(wrapper, 'import-csv-btn').text()).toContain('Import from CSV');
    expect(byTest(wrapper, 'sync-mt5-btn').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Import Broker');
  });

  it('กด "Sync MT5" พาไป /BrokerConnections พร้อม portfolio_id ของพอร์ตที่ active อยู่', async () => {
    const wrapper = await mountPage();

    await byTest(wrapper, 'sync-mt5-btn').trigger('click');

    expect(push).toHaveBeenCalledWith({
      path: '/BrokerConnections',
      query: { portfolio_id: '1' },
    });
  });

  it('"Import from CSV" ยังเปิด dialog นำเข้า CSV เดิมได้ตามปกติ', async () => {
    const wrapper = await mountPage();

    await byTest(wrapper, 'import-csv-btn').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Import from CSV');
  });
});

describe('JournalPage — edit / annotate a trade', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('คลิกแถวไม้ manual เปิด edit dialog โดยไม่มีแบนเนอร์ synced', async () => {
    getByPortfolio.mockResolvedValue([tradeFixture({ id: 1, source: 'MANUAL' })]);
    const wrapper = await mountPage();

    await byTest(wrapper, 'trade-row-1').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Edit Trade');
    expect(document.body.querySelector('[data-test="synced-banner"]')).toBeNull();
  });

  it('คลิกแถวไม้ MT5_SYNC เปิด edit dialog พร้อมแบนเนอร์บอกว่า sync มาจาก MT5', async () => {
    getByPortfolio.mockResolvedValue([
      tradeFixture({ id: 2, source: 'MT5_SYNC', broker: 'MT5', ticket_id: '12345' }),
    ]);
    const wrapper = await mountPage();

    await byTest(wrapper, 'trade-row-2').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-test="synced-banner"]')).not.toBeNull();
  });

  it('ปุ่มแก้ไข (edit icon) เปิด dialog เดียวกันได้โดยไม่ trigger การคลิกซ้อนสองครั้ง', async () => {
    getByPortfolio.mockResolvedValue([tradeFixture({ id: 3 })]);
    const wrapper = await mountPage();

    await byTest(wrapper, 'edit-trade-btn-3').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Edit Trade');
  });

  it('บันทึกการแก้ไขส่งเฉพาะ field บันทึก/risk annotation ไป ไม่ส่ง field การเงินของไม้', async () => {
    getByPortfolio.mockResolvedValue([
      tradeFixture({ id: 4, source: 'MT5_SYNC', result_status: 'WIN', strategy: null, note: null }),
    ]);
    updateTrade.mockResolvedValue(tradeFixture({ id: 4, strategy: 'breakout', note: 'clean entry' }));

    const wrapper = await mountPage();
    await byTest(wrapper, 'trade-row-4').trigger('click');
    await wrapper.vm.$nextTick();

    const noteEl = document.body.querySelector('[data-test="edit-note-input"]');
    expect(noteEl).not.toBeNull();
    await new DOMWrapper(noteEl).setValue('clean entry');

    await byBody('save-edit-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updateTrade).toHaveBeenCalledTimes(1);
    const [, payload] = updateTrade.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toHaveProperty('note', 'clean entry');
    expect(payload).not.toHaveProperty('pair');
    expect(payload).not.toHaveProperty('volume');
    expect(payload).not.toHaveProperty('open_price');
    expect(payload).not.toHaveProperty('trade_type');
  });

  it('บันทึกสำเร็จแล้วปิด dialog และแจ้งเตือนสำเร็จ', async () => {
    getByPortfolio.mockResolvedValue([tradeFixture({ id: 5 })]);
    updateTrade.mockResolvedValue(tradeFixture({ id: 5, strategy: 'breakout' }));

    const wrapper = await mountPage();
    await byTest(wrapper, 'trade-row-5').trigger('click');
    await wrapper.vm.$nextTick();

    await byBody('save-edit-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'positive' }));
  });

  it('บันทึกไม่สำเร็จ -> แจ้งเตือน error และไม่ทำให้หน้าพัง', async () => {
    getByPortfolio.mockResolvedValue([tradeFixture({ id: 6 })]);
    updateTrade.mockRejectedValue(new Error('network down'));

    const wrapper = await mountPage();
    await byTest(wrapper, 'trade-row-6').trigger('click');
    await wrapper.vm.$nextTick();

    await byBody('save-edit-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.exists()).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'negative' }));
  });
});

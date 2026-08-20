import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QLayout, QPageContainer } from 'quasar';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import StockRecordPage from './StockRecordPage.vue';
import type { InvestorSale, StockPurchase } from 'src/types/investor-portfolio.types';
import type { Portfolio } from 'src/types/portfolio.types';

const buy = vi.fn();
const sell = vi.fn();
const getSales = vi.fn();
const getDashboard = vi.fn();
const getTimeline = vi.fn();
const getPerformance = vi.fn();
const getPurchases = vi.fn();
const downloadCsv = vi.fn();
const updatePurchase = vi.fn();
const removePurchase = vi.fn();

// ช่องสัญลักษณ์ใช้ StockSymbolPicker ซึ่งดึงรายชื่อหุ้นผ่าน api.get('/stocks')
// ถ้าไม่ mock เทสจะยิงเน็ตจริง (ผ่านบ้างไม่ผ่านบ้างแล้วแต่ backend เปิดอยู่ไหม)
vi.mock('boot/axios', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('src/services/investor-portfolio.service', () => ({
  investorPortfolioService: {
    buy: (...args: unknown[]) => buy(...args),
    sell: (...args: unknown[]) => sell(...args),
    getSales: (...args: unknown[]) => getSales(...args),
    getDashboard: (...args: unknown[]) => getDashboard(...args),
    getTimeline: (...args: unknown[]) => getTimeline(...args),
    getPerformance: (...args: unknown[]) => getPerformance(...args),
  },
}));

vi.mock('src/services/stock-purchases.service', () => ({
  stockPurchasesService: {
    getAll: (...args: unknown[]) => getPurchases(...args),
    getOne: vi.fn(),
    update: (...args: unknown[]) => updatePurchase(...args),
    remove: (...args: unknown[]) => removePurchase(...args),
  },
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

// export จริงเขียนไฟล์ลงดิสก์ — ดัก downloadCsv ไว้ แต่ยังให้ build CSV ของจริงทำงาน
vi.mock('src/utils/csv-export', async () => {
  const actual = await vi.importActual('src/utils/csv-export');

  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsv(...args) };
});

function purchase(overrides: Partial<StockPurchase> = {}): StockPurchase {
  return {
    id: 1,
    portfolio_id: 2,
    stock_symbol: 'PTT.BK',
    stock_name: 'PTT',
    shares_count: 100,
    remaining_shares: 100,
    purchase_price: 35,
    total_amount: 3500,
    fees: 5,
    currency: 'THB',
    purchase_reason: null,
    expectation: null,
    target_price: null,
    stop_loss: null,
    strategy: null,
    emotion: null,
    notes: null,
    folder_name: 'หุ้นปันผล',
    status: 'OPEN',
    sold_price: null,
    sold_date: null,
    closed_at: null,
    purchase_date: '2026-03-15T00:00:00.000Z',
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

function sale(overrides: Partial<InvestorSale> = {}): InvestorSale {
  return {
    id: 1,
    portfolio_id: 2,
    stock_symbol: 'AAPL',
    shares_count: 5,
    sold_price: 210,
    cost_basis: 900,
    realized_pnl: 150,
    cost_method: 'FIFO',
    sold_date: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

const investorPortfolio = {
  id: 2,
  user_id: 1,
  name: 'Long-Term Stock',
  initial_balance: 500000,
  current_balance: 400000,
  portfolio_type: 'INVESTOR',
  investor_cost_method: 'FIFO',
  currency: 'THB',
  icon: null,
  color: null,
  is_default: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} as unknown as Portfolio;

const byTest = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mountPage(options: { purchases?: StockPurchase[]; sales?: InvestorSale[] } = {}) {
  getPurchases.mockResolvedValue(options.purchases ?? [purchase()]);
  getSales.mockResolvedValue({ data: options.sales ?? [] });
  getDashboard.mockResolvedValue({ data: { summary: null, holdings: [], recent_activity: [] } });
  getTimeline.mockResolvedValue({ data: [] });
  getPerformance.mockResolvedValue({ data: [] });

  const portfolioStore = usePortfolioStore();

  portfolioStore.portfolios = [investorPortfolio];
  portfolioStore.activeType = 'INVESTOR';
  portfolioStore.activePortfolioIds.INVESTOR = 2;

  const wrapper = mount(
    { render: () => h(QLayout, () => [h(QPageContainer, () => [h(StockRecordPage)])]) },
    { attachTo: document.body },
  );

  await flush();
  await wrapper.vm.$nextTick();

  return { wrapper, store: useInvestorPortfolioStore() };
}

describe('StockRecordPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('mount ได้และแสดงแท็บทั้งสอง', async () => {
    const { wrapper } = await mountPage();

    expect(byTest(wrapper, 'tab-open').exists()).toBe(true);
    expect(byTest(wrapper, 'tab-closed').exists()).toBe(true);
  });

  it('ไม่มีพอร์ตลงทุน -> เตือนแทนที่จะโชว์ตาราง', async () => {
    const portfolioStore = usePortfolioStore();

    portfolioStore.portfolios = [];
    portfolioStore.activePortfolioIds.INVESTOR = null;

    const wrapper = mount(
      { render: () => h(QLayout, () => [h(QPageContainer, () => [h(StockRecordPage)])]) },
      { attachTo: document.body },
    );

    await flush();
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'no-portfolio').exists()).toBe(true);
    expect(byTest(wrapper, 'panel-open').exists()).toBe(false);
  });

  it('แสดง lot ที่ถืออยู่ จัดกลุ่มตามโฟลเดอร์', async () => {
    const { wrapper } = await mountPage({
      purchases: [
        purchase({ id: 1, folder_name: 'หุ้นปันผล' }),
        purchase({ id: 2, stock_symbol: 'AAPL', folder_name: 'เติบโต' }),
        purchase({ id: 3, stock_symbol: 'NVDA', folder_name: null }),
      ],
    });

    expect(byTest(wrapper, 'folder-หุ้นปันผล').exists()).toBe(true);
    expect(byTest(wrapper, 'folder-เติบโต').exists()).toBe(true);
    expect(byTest(wrapper, 'folder-none').exists()).toBe(true);
    expect(byTest(wrapper, 'folder-none').text()).toContain('ไม่ได้จัดโฟลเดอร์');
  });

  it('กรองตามโฟลเดอร์ได้', async () => {
    const { wrapper } = await mountPage({
      purchases: [
        purchase({ id: 1, folder_name: 'หุ้นปันผล' }),
        purchase({ id: 2, stock_symbol: 'AAPL', folder_name: 'เติบโต' }),
      ],
    });

    const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
      folderFilter: string;
    };

    vm.folderFilter = 'เติบโต';
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'folder-เติบโต').exists()).toBe(true);
    expect(byTest(wrapper, 'folder-หุ้นปันผล').exists()).toBe(false);
  });

  it('กรอง "ไม่ได้จัดโฟลเดอร์" ได้', async () => {
    const { wrapper } = await mountPage({
      purchases: [
        purchase({ id: 1, folder_name: 'หุ้นปันผล' }),
        purchase({ id: 2, stock_symbol: 'NVDA', folder_name: null }),
      ],
    });

    const vm = wrapper.findComponent(StockRecordPage).vm as unknown as { folderFilter: string };

    vm.folderFilter = '__NONE__';
    await wrapper.vm.$nextTick();

    expect(byTest(wrapper, 'folder-none').exists()).toBe(true);
    expect(byTest(wrapper, 'folder-หุ้นปันผล').exists()).toBe(false);
  });

  it('ไม่มี lot -> empty state', async () => {
    const { wrapper } = await mountPage({ purchases: [] });

    expect(byTest(wrapper, 'open-empty').exists()).toBe(true);
  });

  it('แสดง target/stop เมื่อมี และขีดเมื่อไม่มี', async () => {
    const { wrapper } = await mountPage({
      purchases: [purchase({ id: 1, target_price: 44, stop_loss: 30 })],
    });

    const row = byTest(wrapper, 'purchase-1');

    expect(row.text()).toContain('44.00');
    expect(row.text()).toContain('30.00');
  });

  // ── calculatedShares ────────────────────────────────────────────────────────
  describe('calculatedShares', () => {
    const vmOf = (wrapper: VueWrapper) =>
      wrapper.findComponent(StockRecordPage).vm as unknown as {
        buyForm: {
          purchase_price: number | null;
          total_amount: number | null;
          broker_fee_percent: number | null;
          shares_count: number | null;
        };
        calculatedShares: number | null;
        buyNetValue: number;
        buyFeeAmount: number;
      };

    it('คำนวณจำนวนหุ้นจากยอดเงิน + ราคา + ค่าธรรมเนียม', async () => {
      const { wrapper } = await mountPage();
      const vm = vmOf(wrapper);

      vm.buyForm.purchase_price = 100;
      vm.buyForm.total_amount = 10100;
      vm.buyForm.broker_fee_percent = 1;
      await wrapper.vm.$nextTick();

      // 10100 / (100 * 1.01) = 100
      expect(vm.calculatedShares).toBe(100);
    });

    it('ค่าธรรมเนียม 0 -> หารตรงๆ', async () => {
      const { wrapper } = await mountPage();
      const vm = vmOf(wrapper);

      vm.buyForm.purchase_price = 50;
      vm.buyForm.total_amount = 5000;
      vm.buyForm.broker_fee_percent = 0;
      await wrapper.vm.$nextTick();

      expect(vm.calculatedShares).toBe(100);
    });

    it('ข้อมูลไม่ครบ -> คืน null', async () => {
      const { wrapper } = await mountPage();
      const vm = vmOf(wrapper);

      vm.buyForm.purchase_price = 100;
      vm.buyForm.total_amount = null;
      await wrapper.vm.$nextTick();

      expect(vm.calculatedShares).toBeNull();
    });

    it('เติมจำนวนหุ้นในฟอร์มให้อัตโนมัติ และคำนวณมูลค่าสุทธิ/ค่าธรรมเนียม', async () => {
      const { wrapper } = await mountPage();
      const vm = vmOf(wrapper);

      vm.buyForm.purchase_price = 100;
      vm.buyForm.total_amount = 10100;
      vm.buyForm.broker_fee_percent = 1;
      await wrapper.vm.$nextTick();

      expect(vm.buyForm.shares_count).toBe(100);
      expect(vm.buyNetValue).toBe(10000);
      expect(vm.buyFeeAmount).toBe(100);
    });
  });

  // ── flow ซื้อ ───────────────────────────────────────────────────────────────
  describe('บันทึกการซื้อ', () => {
    const openBuy = async (wrapper: VueWrapper) => {
      await byTest(wrapper, 'open-buy').trigger('click');
      await wrapper.vm.$nextTick();

      return wrapper.findComponent(StockRecordPage).vm as unknown as {
        buyForm: Record<string, unknown>;
        buyErrors: Record<string, string>;
        submitBuy: () => Promise<void>;
      };
    };

    it('ส่ง payload ครบรวม target/stop/folder', async () => {
      buy.mockResolvedValue({ data: { success: true } });

      const { wrapper } = await mountPage();
      const vm = await openBuy(wrapper);

      Object.assign(vm.buyForm, {
        stock_symbol: 'aapl',
        stock_name: 'Apple',
        purchase_price: 200,
        shares_count: 10,
        target_price: 250,
        stop_loss: 180,
        folder_name: 'เติบโต',
        strategy: 'growth',
      });

      await vm.submitBuy();
      await flush();

      expect(buy).toHaveBeenCalledTimes(1);

      const payload = buy.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(payload.stock_symbol).toBe('AAPL');
      expect(payload.shares_count).toBe(10);
      expect(payload.purchase_price).toBe(200);
      expect(payload.target_price).toBe(250);
      expect(payload.stop_loss).toBe(180);
      expect(payload.folder_name).toBe('เติบโต');
      expect(payload.strategy).toBe('growth');
    });

    it('ไม่กรอกสัญลักษณ์/ราคา/จำนวน -> ไม่ยิง API', async () => {
      const { wrapper } = await mountPage();
      const vm = await openBuy(wrapper);

      await vm.submitBuy();

      expect(buy).not.toHaveBeenCalled();
      expect(vm.buyErrors.stock_symbol).toBeTruthy();
      expect(vm.buyErrors.purchase_price).toBeTruthy();
    });

    it('เป้าหมายต่ำกว่าราคาซื้อ -> error ไม่ยิง API', async () => {
      const { wrapper } = await mountPage();
      const vm = await openBuy(wrapper);

      Object.assign(vm.buyForm, {
        stock_symbol: 'AAPL',
        purchase_price: 200,
        shares_count: 1,
        target_price: 150,
      });

      await vm.submitBuy();

      expect(buy).not.toHaveBeenCalled();
      expect(vm.buyErrors.target_price).toBeTruthy();
    });

    it('จุดตัดขาดทุนสูงกว่าราคาซื้อ -> error', async () => {
      const { wrapper } = await mountPage();
      const vm = await openBuy(wrapper);

      Object.assign(vm.buyForm, {
        stock_symbol: 'AAPL',
        purchase_price: 200,
        shares_count: 1,
        stop_loss: 240,
      });

      await vm.submitBuy();

      expect(buy).not.toHaveBeenCalled();
      expect(vm.buyErrors.stop_loss).toBeTruthy();
    });

    it('ฟิลด์ที่ปล่อยว่าง -> ไม่ถูกส่งไปใน payload', async () => {
      buy.mockResolvedValue({ data: { success: true } });

      const { wrapper } = await mountPage();
      const vm = await openBuy(wrapper);

      Object.assign(vm.buyForm, {
        stock_symbol: 'AAPL',
        purchase_price: 200,
        shares_count: 10,
      });

      await vm.submitBuy();
      await flush();

      const payload = buy.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(payload).not.toHaveProperty('folder_name');
      expect(payload).not.toHaveProperty('target_price');
      expect(payload).not.toHaveProperty('notes');
    });
  });

  // ── flow ขาย ────────────────────────────────────────────────────────────────
  describe('บันทึกการขาย', () => {
    it('เปิดฟอร์มขายแล้วเติมจำนวนคงเหลือให้อัตโนมัติ', async () => {
      const { wrapper } = await mountPage({
        purchases: [purchase({ id: 7, remaining_shares: 42, purchase_price: 12 })],
      });

      await byTest(wrapper, 'sell-7').trigger('click');
      await wrapper.vm.$nextTick();

      const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
        sellForm: { shares_count: number | null; sold_price: number | null };
      };

      expect(vm.sellForm.shares_count).toBe(42);
      expect(vm.sellForm.sold_price).toBe(12);
    });

    it('ส่ง payload ขายถูกต้อง', async () => {
      sell.mockResolvedValue({ data: { success: true } });

      const { wrapper } = await mountPage({
        purchases: [purchase({ id: 7, stock_symbol: 'PTT.BK', remaining_shares: 42 })],
      });

      await byTest(wrapper, 'sell-7').trigger('click');
      await wrapper.vm.$nextTick();

      const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
        sellForm: Record<string, unknown>;
        submitSell: () => Promise<void>;
      };

      Object.assign(vm.sellForm, { shares_count: 10, sold_price: 40, fees: 2, cost_method: 'LIFO' });

      await vm.submitSell();
      await flush();

      const payload = sell.mock.calls[0]?.[1] as Record<string, unknown>;

      expect(payload.stock_symbol).toBe('PTT.BK');
      expect(payload.shares_count).toBe(10);
      expect(payload.sold_price).toBe(40);
      expect(payload.cost_method).toBe('LIFO');
    });

    it('ขายเกินจำนวนที่ถือ -> error ไม่ยิง API', async () => {
      const { wrapper } = await mountPage({
        purchases: [purchase({ id: 7, remaining_shares: 5 })],
      });

      await byTest(wrapper, 'sell-7').trigger('click');
      await wrapper.vm.$nextTick();

      const vm = wrapper.findComponent(StockRecordPage).vm as unknown as {
        sellForm: Record<string, unknown>;
        sellErrors: Record<string, string>;
        submitSell: () => Promise<void>;
      };

      Object.assign(vm.sellForm, { shares_count: 50, sold_price: 40 });

      await vm.submitSell();

      expect(sell).not.toHaveBeenCalled();
      expect(vm.sellErrors.shares_count).toContain('5');
    });
  });

  // ── ประวัติการขาย ───────────────────────────────────────────────────────────
  it('แท็บประวัติการขายแสดงรายการพร้อมกำไรที่รับรู้', async () => {
    const { wrapper } = await mountPage({ sales: [sale({ id: 3, realized_pnl: 150 })] });

    expect(byTest(wrapper, 'sale-3').exists()).toBe(true);
    expect(byTest(wrapper, 'sale-3').text()).toContain('AAPL');
    expect(byTest(wrapper, 'sale-3').text()).toContain('150.00');
  });

  it('ไม่มีประวัติการขาย -> empty state', async () => {
    const { wrapper } = await mountPage({ sales: [] });

    expect(byTest(wrapper, 'closed-empty').exists()).toBe(true);
  });

  // ── export CSV ──────────────────────────────────────────────────────────────
  describe('export CSV', () => {
    const exportVm = (wrapper: VueWrapper) =>
      wrapper.findComponent(StockRecordPage).vm as unknown as {
        exportType: 'holdings' | 'realized';
        exportYear: number | 'ALL';
        exportRows: StockPurchase[];
        exportSales: InvestorSale[];
        runExport: () => void;
      };

    it('export holdings -> ตั้งชื่อไฟล์และมีข้อมูล lot', async () => {
      const { wrapper } = await mountPage({
        purchases: [purchase({ id: 1, stock_symbol: 'PTT.BK' })],
      });

      const vm = exportVm(wrapper);

      vm.exportType = 'holdings';
      vm.runExport();

      expect(downloadCsv).toHaveBeenCalledTimes(1);

      const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

      expect(filename).toContain('holdings-');
      expect(filename.endsWith('.csv')).toBe(true);
      expect(csv).toContain('"PTT.BK"');
      expect(csv).toContain('"Symbol"');
    });

    it('export realized -> ใช้ข้อมูลการขาย', async () => {
      const { wrapper } = await mountPage({ sales: [sale({ stock_symbol: 'AAPL' })] });

      const vm = exportVm(wrapper);

      vm.exportType = 'realized';
      vm.runExport();

      const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

      expect(filename).toContain('realized-pnl-');
      expect(csv).toContain('"Realized P/L"');
      expect(csv).toContain('"AAPL"');
    });

    it('กรองตามปีได้', async () => {
      const { wrapper } = await mountPage({
        purchases: [
          purchase({ id: 1, purchase_date: '2026-03-15T00:00:00.000Z' }),
          purchase({ id: 2, purchase_date: '2025-03-15T00:00:00.000Z' }),
        ],
      });

      const vm = exportVm(wrapper);

      expect(vm.exportRows).toHaveLength(2);

      vm.exportYear = 2026;
      await wrapper.vm.$nextTick();

      expect(vm.exportRows).toHaveLength(1);
    });

    it('ไม่มีข้อมูลในปีที่เลือก -> ไม่ดาวน์โหลด', async () => {
      const { wrapper } = await mountPage({
        purchases: [purchase({ purchase_date: '2026-03-15T00:00:00.000Z' })],
      });

      const vm = exportVm(wrapper);

      vm.exportYear = 1999;
      await wrapper.vm.$nextTick();
      vm.runExport();

      expect(downloadCsv).not.toHaveBeenCalled();
    });
  });

  it('store โหลด lot ดิบมาจาก stock-purchases service', async () => {
    const { store } = await mountPage({ purchases: [purchase({ id: 11 })] });

    expect(getPurchases).toHaveBeenCalledWith(2);
    expect(store.purchases).toHaveLength(1);
    expect(store.openPurchases).toHaveLength(1);
    expect(store.folders).toEqual(['หุ้นปันผล']);
  });

  // ── แก้ไข / ลบ lot ──────────────────────────────────────────────────────────
  describe('แก้ไขและลบรายการซื้อ', () => {
    /** เปิดฟอร์มแก้ไขแล้วอ่าน state ภายในของหน้า */
    const recordVm = (wrapper: VueWrapper) =>
      wrapper.findComponent(StockRecordPage).vm as unknown as {
        openEditDialog: (row: StockPurchase) => void;
        submitEdit: () => Promise<void>;
        submitDelete: () => Promise<void>;
        confirmDelete: (row: StockPurchase) => void;
        editForm: {
          target_price: number | null;
          stop_loss: number | null;
          notes: string;
          folder_name: string;
        };
        editEnableAlerts: boolean;
        canDelete: (row: StockPurchase) => boolean;
        soldShares: (row: StockPurchase) => number;
      };

    it('lot ที่ยังไม่เคยขาย -> ปุ่มลบกดได้', async () => {
      const row = purchase({ id: 5, shares_count: 100, remaining_shares: 100 });
      const { wrapper } = await mountPage({ purchases: [row] });

      expect(recordVm(wrapper).canDelete(row)).toBe(true);
      expect(wrapper.find('[data-test="delete-5"]').attributes('disabled')).toBeUndefined();
    });

    it('lot ที่ขายไปแล้วบางส่วน -> ปุ่มลบถูกปิดตั้งแต่แรก ไม่ต้องยิงไปโดน 409', async () => {
      const row = purchase({ id: 6, shares_count: 100, remaining_shares: 40 });
      const { wrapper } = await mountPage({ purchases: [row] });

      expect(recordVm(wrapper).soldShares(row)).toBe(60);
      expect(recordVm(wrapper).canDelete(row)).toBe(false);
      expect(wrapper.find('[data-test="delete-6"]').attributes('disabled')).toBeDefined();
    });

    it('เปิดฟอร์มแก้ไขแล้วสวิตช์แจ้งเตือนถูกคำนวณย้อนจาก TP/SL ที่มีอยู่', async () => {
      // enable_alerts ไม่ใช่คอลัมน์ใน DB — ต้อง derive จากข้อมูลจริงทุกครั้งที่เปิดฟอร์ม
      const withTp = purchase({ id: 7, target_price: 80, stop_loss: null });
      const { wrapper } = await mountPage({ purchases: [withTp] });
      const vm = recordVm(wrapper);

      vm.openEditDialog(withTp);
      await wrapper.vm.$nextTick();

      expect(vm.editEnableAlerts).toBe(true);
    });

    it('lot ที่ไม่มี TP/SL เลย -> สวิตช์ปิดอยู่', async () => {
      const plain = purchase({ id: 8, target_price: null, stop_loss: null });
      const { wrapper } = await mountPage({ purchases: [plain] });
      const vm = recordVm(wrapper);

      vm.openEditDialog(plain);
      await wrapper.vm.$nextTick();

      expect(vm.editEnableAlerts).toBe(false);
    });

    it('ปิดสวิตช์แจ้งเตือน -> TP/SL ถูกล้าง ไม่ใช่ซ่อนไว้เฉยๆ', async () => {
      // ถ้าแค่ซ่อน ค่าที่ผู้ใช้คิดว่าเอาออกแล้วจะถูกส่งไปบันทึกต่อโดยไม่รู้ตัว
      const withTp = purchase({ id: 9, target_price: 80, stop_loss: 30 });
      const { wrapper } = await mountPage({ purchases: [withTp] });
      const vm = recordVm(wrapper);

      vm.openEditDialog(withTp);
      await wrapper.vm.$nextTick();

      vm.editEnableAlerts = false;
      await wrapper.vm.$nextTick();

      expect(vm.editForm.target_price).toBeNull();
      expect(vm.editForm.stop_loss).toBeNull();
    });

    it('บันทึกการแก้ไข -> ส่งเฉพาะข้อมูลประกอบ ไม่มีราคา/จำนวนหุ้นติดไปด้วย', async () => {
      const row = purchase({ id: 10, target_price: 80, stop_loss: 30 });
      const { wrapper } = await mountPage({ purchases: [row] });
      const vm = recordVm(wrapper);

      updatePurchase.mockResolvedValue(row);
      getPurchases.mockResolvedValue([row]);

      vm.openEditDialog(row);
      await wrapper.vm.$nextTick();

      vm.editForm.notes = 'ถือยาว';
      await vm.submitEdit();

      expect(updatePurchase).toHaveBeenCalledTimes(1);

      const [id, payload] = updatePurchase.mock.calls[0] as [number, Record<string, unknown>];

      expect(id).toBe(10);
      expect(payload.notes).toBe('ถือยาว');
      // สองค่านี้เป็นฐานคิดต้นทุนที่รายการขายอ้างอิงอยู่ ห้ามหลุดไปกับ payload
      expect(payload).not.toHaveProperty('purchase_price');
      expect(payload).not.toHaveProperty('shares_count');
    });

    it('ปิดสวิตช์แล้วบันทึก -> ส่ง null ไปล้าง TP/SL จริงๆ', async () => {
      const row = purchase({ id: 12, target_price: 80, stop_loss: 30 });
      const { wrapper } = await mountPage({ purchases: [row] });
      const vm = recordVm(wrapper);

      updatePurchase.mockResolvedValue(row);
      getPurchases.mockResolvedValue([row]);

      vm.openEditDialog(row);
      await wrapper.vm.$nextTick();

      vm.editEnableAlerts = false;
      await wrapper.vm.$nextTick();
      await vm.submitEdit();

      const [, payload] = updatePurchase.mock.calls[0] as [number, Record<string, unknown>];

      expect(payload.target_price).toBeNull();
      expect(payload.stop_loss).toBeNull();
    });

    it('ยืนยันลบ -> ยิง remove ด้วย id ของ lot นั้น', async () => {
      const row = purchase({ id: 13, shares_count: 100, remaining_shares: 100 });
      const { wrapper } = await mountPage({ purchases: [row] });
      const vm = recordVm(wrapper);

      removePurchase.mockResolvedValue({ message: 'ok', id: 13 });
      getPurchases.mockResolvedValue([]);

      vm.confirmDelete(row);
      await wrapper.vm.$nextTick();
      await vm.submitDelete();

      expect(removePurchase).toHaveBeenCalledWith(13);
    });
  });
});

<script setup lang="ts">
/**
 * บันทึกการซื้อ/ขายหุ้น (โหมด Stock)
 *
 * ก่อนหน้านี้โหมด Stock ไม่มีหน้าบันทึกเลย ทั้งที่ backend/service/store พร้อมอยู่แล้ว
 * (POST /investor/portfolios/:id/stocks/buy|sell + InvestorPortfolioStore.buy()/sell())
 * แต่ไม่มี UI ตัวไหนเรียกใช้
 *
 * ยกดีไซน์ตาราง/ฟอร์ม/สูตร calculatedShares มาจาก RecordPage.vue ของโปรเจกต์เก่า
 * แต่ตัดส่วนที่เป็นข้อมูลปลอมทิ้ง (todayReturn = unrealized * 0.12, MOCK_DOMESTIC_SPLIT,
 * createMockBuyDate) และไม่ทำ KPI/allocation/returns ซ้ำ เพราะ DashboardPage กับ
 * AnalyticsPage ทำไปแล้วด้วยข้อมูลจริงจาก backend
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { buildHoldingsCsv, buildRealizedPnlCsv, downloadCsv } from 'src/utils/csv-export';
import StockSymbolPicker from 'components/stocks/StockSymbolPicker.vue';
import type { StockCatalogItem } from 'src/composables/useStockCatalog';
import type { InvestorSale, StockPurchase } from 'src/types/investor-portfolio.types';

const $q = useQuasar();
const store = useInvestorPortfolioStore();
const portfolioStore = usePortfolioStore();
const { safeLoad } = useSafeLoad();

const recordTab = ref<'open' | 'closed'>('open');

const activePortfolio = computed(() => portfolioStore.activeInvestorPortfolio);

const portfolioCurrency = computed(() => activePortfolio.value?.currency ?? 'USD');

const load = async () => {
  const id = activePortfolio.value?.id;

  if (id === undefined) return;

  await safeLoad(() => store.load(id), 'โหลดรายการหุ้นไม่สำเร็จ');
};

onMounted(async () => {
  if (portfolioStore.portfolios.length === 0) {
    await safeLoad(() => portfolioStore.loadPortfolios(), 'โหลดพอร์ตโฟลิโอไม่สำเร็จ');
  }

  if (store.portfolioId !== (activePortfolio.value?.id ?? null)) {
    await load();
  }
});

watch(() => activePortfolio.value?.id, () => void load());

// ── ตัวเลข ────────────────────────────────────────────────────────────────────
const round2 = (value: number) => Number(value.toFixed(2));
const round4 = (value: number) => Number(value.toFixed(4));

const money = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const shares = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-GB') : '—';

// ตัวย่อบน badge หน้าสัญลักษณ์หุ้นตามแบบ (NVDA -> NV) — ตัดจากสัญลักษณ์ที่มีอยู่แล้ว
const symbolInitials = (symbol: string | null | undefined) =>
  (symbol ?? '—').slice(0, 2).toUpperCase();

// ── โฟลเดอร์ + การจัดกลุ่ม ────────────────────────────────────────────────────
const folderFilter = ref<string>('ALL');

const folderOptions = computed(() => [
  { label: 'ทุกโฟลเดอร์', value: 'ALL' },
  ...store.folders.map((name) => ({ label: name, value: name })),
  { label: 'ไม่ได้จัดโฟลเดอร์', value: '__NONE__' },
]);

const visiblePurchases = computed(() => {
  const rows = store.openPurchases;

  if (folderFilter.value === 'ALL') return rows;
  if (folderFilter.value === '__NONE__') return rows.filter((row) => !row.folder_name);

  return rows.filter((row) => row.folder_name === folderFilter.value);
});

/** จัดกลุ่มตามโฟลเดอร์ เรียงให้ "ไม่ได้จัดโฟลเดอร์" อยู่ท้ายสุด */
const groupedPurchases = computed(() => {
  const groups = new Map<string, StockPurchase[]>();

  for (const purchase of visiblePurchases.value) {
    const key = purchase.folder_name ?? '';
    const bucket = groups.get(key);

    if (bucket) {
      bucket.push(purchase);
    } else {
      groups.set(key, [purchase]);
    }
  }

  return [...groups.entries()]
    .map(([folder, items]) => ({
      folder,
      label: folder || 'ไม่ได้จัดโฟลเดอร์',
      items,
      totalCost: round2(items.reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0)),
    }))
    .sort((a, b) => {
      if (!a.folder) return 1;
      if (!b.folder) return -1;
      return a.folder.localeCompare(b.folder);
    });
});

// ── ฟอร์มซื้อ ─────────────────────────────────────────────────────────────────
const todayInput = () => new Date().toISOString().slice(0, 10);

const createBuyForm = () => ({
  stock_symbol: '',
  stock_name: '',
  purchase_price: null as number | null,
  total_amount: null as number | null,
  shares_count: null as number | null,
  broker_fee_percent: 0 as number | null,
  currency: portfolioCurrency.value,
  purchase_date: todayInput(),
  folder_name: '',
  target_price: null as number | null,
  stop_loss: null as number | null,
  strategy: '',
  emotion: '',
  purchase_reason: '',
  expectation: '',
  notes: '',
});

const buyDialog = ref(false);
const buyForm = ref(createBuyForm());
const buyErrors = ref<Record<string, string>>({});

/** เลือกหุ้นจาก dropdown แล้วเติมชื่อบริษัทให้เลย ถ้าผู้ใช้ยังไม่ได้พิมพ์เอง */
const onBuySymbolSelected = (item: StockCatalogItem) => {
  if (!buyForm.value.stock_name.trim()) {
    buyForm.value.stock_name = item.name;
  }
};

const openBuyDialog = () => {
  buyForm.value = createBuyForm();
  buyErrors.value = {};
  buyDialog.value = true;
};

/**
 * คำนวณจำนวนหุ้นจากยอดเงินที่ตั้งใจใช้ + ราคา + % ค่าธรรมเนียมโบรก
 * สูตรเดียวกับ RecordPage เดิม: shares = budget / (price * (1 + fee%))
 */
const calculatedShares = computed(() => {
  const price = Number(buyForm.value.purchase_price);
  const budget = Number(buyForm.value.total_amount);
  const feePercent = Number(buyForm.value.broker_fee_percent) || 0;

  if (!price || price <= 0 || !budget || budget <= 0) {
    return null;
  }

  return round4(budget / (price * (1 + feePercent / 100)));
});

// กรอกยอดเงินรวมแล้วให้จำนวนหุ้นเติมเองอัตโนมัติ
watch(calculatedShares, (next) => {
  if (next !== null) {
    buyForm.value.shares_count = next;
  }
});

const buyNetValue = computed(() => {
  const count = Number(buyForm.value.shares_count);
  const price = Number(buyForm.value.purchase_price);

  return !count || !price ? 0 : round2(count * price);
});

const buyFeeAmount = computed(() => {
  const budget = Number(buyForm.value.total_amount);

  return !budget || !buyNetValue.value ? 0 : round2(Math.max(0, budget - buyNetValue.value));
});

const validateBuy = () => {
  const errors: Record<string, string> = {};
  const form = buyForm.value;

  if (!form.stock_symbol.trim()) errors.stock_symbol = 'กรุณากรอกสัญลักษณ์หุ้น';
  if (!form.purchase_price || form.purchase_price <= 0) errors.purchase_price = 'ราคาต้องมากกว่า 0';
  if (!form.shares_count || form.shares_count <= 0) errors.shares_count = 'จำนวนหุ้นต้องมากกว่า 0';

  if (form.target_price !== null && form.purchase_price && form.target_price <= form.purchase_price) {
    errors.target_price = 'ราคาเป้าหมายควรสูงกว่าราคาซื้อ';
  }

  if (form.stop_loss !== null && form.purchase_price && form.stop_loss >= form.purchase_price) {
    errors.stop_loss = 'จุดตัดขาดทุนควรต่ำกว่าราคาซื้อ';
  }

  buyErrors.value = errors;

  return Object.keys(errors).length === 0;
};

const submitBuy = async () => {
  if (!validateBuy()) return;

  const form = buyForm.value;

  try {
    await store.buy({
      stock_symbol: form.stock_symbol.trim().toUpperCase(),
      shares_count: Number(form.shares_count),
      purchase_price: Number(form.purchase_price),
      fees: buyFeeAmount.value,
      currency: form.currency,
      purchase_date: form.purchase_date,
      ...(form.stock_name.trim() ? { stock_name: form.stock_name.trim() } : {}),
      ...(form.folder_name.trim() ? { folder_name: form.folder_name.trim() } : {}),
      ...(form.target_price !== null ? { target_price: Number(form.target_price) } : {}),
      ...(form.stop_loss !== null ? { stop_loss: Number(form.stop_loss) } : {}),
      ...(form.strategy ? { strategy: form.strategy } : {}),
      ...(form.emotion ? { emotion: form.emotion } : {}),
      ...(form.purchase_reason.trim() ? { purchase_reason: form.purchase_reason.trim() } : {}),
      ...(form.expectation.trim() ? { expectation: form.expectation.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    });

    buyDialog.value = false;
    $q.notify({ type: 'positive', message: 'บันทึกการซื้อแล้ว', position: 'top' });
  } catch {
    $q.notify({
      type: 'negative',
      message: store.error ?? 'บันทึกการซื้อไม่สำเร็จ',
      position: 'top',
      timeout: 5000,
    });
  }
};

// ── ฟอร์มขาย ──────────────────────────────────────────────────────────────────
const sellDialog = ref(false);
const sellTarget = ref<StockPurchase | null>(null);
const sellErrors = ref<Record<string, string>>({});

const sellForm = ref({
  shares_count: null as number | null,
  sold_price: null as number | null,
  fees: 0 as number | null,
  cost_method: 'FIFO' as 'FIFO' | 'LIFO' | 'AVERAGE',
  sold_date: todayInput(),
  notes: '',
});

const openSellDialog = (purchase: StockPurchase) => {
  sellTarget.value = purchase;
  sellErrors.value = {};
  sellForm.value = {
    shares_count: Number(purchase.remaining_shares),
    sold_price: Number(purchase.purchase_price),
    fees: 0,
    cost_method: 'FIFO',
    sold_date: todayInput(),
    notes: '',
  };
  sellDialog.value = true;
};

const maxSellShares = computed(() => Number(sellTarget.value?.remaining_shares ?? 0));

const sellProceeds = computed(() => {
  const count = Number(sellForm.value.shares_count);
  const price = Number(sellForm.value.sold_price);

  return !count || !price ? 0 : round2(count * price - Number(sellForm.value.fees ?? 0));
});

const validateSell = () => {
  const errors: Record<string, string> = {};
  const form = sellForm.value;

  if (!form.shares_count || form.shares_count <= 0) {
    errors.shares_count = 'จำนวนหุ้นต้องมากกว่า 0';
  } else if (form.shares_count > maxSellShares.value) {
    errors.shares_count = `ขายได้ไม่เกิน ${maxSellShares.value} หุ้น`;
  }

  if (!form.sold_price || form.sold_price <= 0) errors.sold_price = 'ราคาขายต้องมากกว่า 0';

  sellErrors.value = errors;

  return Object.keys(errors).length === 0;
};

const submitSell = async () => {
  if (!sellTarget.value || !validateSell()) return;

  try {
    await store.sell({
      stock_symbol: sellTarget.value.stock_symbol,
      shares_count: Number(sellForm.value.shares_count),
      sold_price: Number(sellForm.value.sold_price),
      fees: Number(sellForm.value.fees ?? 0),
      cost_method: sellForm.value.cost_method,
      sold_date: sellForm.value.sold_date,
      ...(sellForm.value.notes.trim() ? { notes: sellForm.value.notes.trim() } : {}),
    });

    sellDialog.value = false;
    $q.notify({ type: 'positive', message: 'บันทึกการขายแล้ว', position: 'top' });
  } catch {
    $q.notify({
      type: 'negative',
      message: store.error ?? 'บันทึกการขายไม่สำเร็จ',
      position: 'top',
      timeout: 5000,
    });
  }
};

// ── Export CSV ────────────────────────────────────────────────────────────────
const exportDialog = ref(false);
const exportType = ref<'holdings' | 'realized'>('holdings');
const exportYear = ref<number | 'ALL'>('ALL');

const availableYears = computed(() => {
  const years = new Set<number>();

  for (const sale of store.sales) {
    years.add(new Date(sale.sold_date).getFullYear());
  }

  for (const purchase of store.openPurchases) {
    years.add(new Date(purchase.purchase_date).getFullYear());
  }

  return [...years].sort((a, b) => b - a);
});

const yearOptions = computed(() => [
  { label: 'ทุกปี', value: 'ALL' as const },
  ...availableYears.value.map((year) => ({ label: String(year), value: year })),
]);

const inSelectedYear = (iso: string) =>
  exportYear.value === 'ALL' || new Date(iso).getFullYear() === exportYear.value;

const exportRows = computed<StockPurchase[]>(() =>
  store.openPurchases.filter((row) => inSelectedYear(row.purchase_date)),
);

const exportSales = computed<InvestorSale[]>(() =>
  store.sales.filter((row) => inSelectedYear(row.sold_date)),
);

const openExportDialog = () => {
  exportType.value = 'holdings';
  exportYear.value = 'ALL';
  exportDialog.value = true;
};

const runExport = () => {
  const suffix = exportYear.value === 'ALL' ? 'all' : String(exportYear.value);
  const portfolioName = (activePortfolio.value?.name ?? 'portfolio')
    .toLowerCase()
    .replace(/\s+/g, '-');

  if (exportType.value === 'holdings') {
    if (exportRows.value.length === 0) {
      $q.notify({ type: 'warning', message: 'ไม่มีข้อมูลให้ export', position: 'top' });
      return;
    }

    downloadCsv(
      `holdings-${portfolioName}-${suffix}.csv`,
      buildHoldingsCsv(exportRows.value, portfolioCurrency.value),
    );
  } else {
    if (exportSales.value.length === 0) {
      $q.notify({ type: 'warning', message: 'ไม่มีข้อมูลให้ export', position: 'top' });
      return;
    }

    downloadCsv(
      `realized-pnl-${portfolioName}-${suffix}.csv`,
      buildRealizedPnlCsv(exportSales.value, portfolioCurrency.value),
    );
  }

  exportDialog.value = false;
  $q.notify({ type: 'positive', message: 'ดาวน์โหลดไฟล์ CSV แล้ว', position: 'top' });
};

// ── ตัวเลือกฟอร์ม ─────────────────────────────────────────────────────────────
const strategyOptions = ['value', 'growth', 'dividend', 'dca', 'momentum', 'turnaround'];
const emotionOptions = ['confident', 'normal', 'fear', 'greed', 'fomo', 'bored'];
const costMethodOptions = ['FIFO', 'LIFO', 'AVERAGE'];
</script>

<template>
  <q-page class="stock-record-page q-pa-md q-pa-sm-lg">
    <!-- ── Header ────────────────────────────────────────────────────────────── -->
    <div class="row items-end justify-between q-mb-lg q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none text-main tracking-tight">
          บันทึกการลงทุน
        </h1>
        <div class="text-subtitle2 text-muted q-mt-xs">
          {{ activePortfolio?.name ?? 'ยังไม่ได้เลือกพอร์ต' }}
        </div>
      </div>

      <div class="row q-gutter-sm">
        <q-btn
          flat
          dense
          no-caps
          icon="download"
          label="Export CSV"
          data-test="open-export"
          :disable="!activePortfolio"
          @click="openExportDialog"
        />
        <q-btn
          unelevated
          no-caps
          icon="add"
          label="ซื้อหุ้น"
          class="btn-primary-gradient text-white text-weight-bold"
          data-test="open-buy"
          :disable="!activePortfolio"
          @click="openBuyDialog"
        />
      </div>
    </div>

    <q-banner v-if="!activePortfolio" class="record-banner" data-test="no-portfolio">
      <template v-slot:avatar><q-icon name="warning" size="sm" /></template>
      กรุณาสร้างหรือเลือกพอร์ตลงทุนก่อนจึงจะบันทึกรายการได้
    </q-banner>

    <template v-else>
      <!-- ── Tabs ───────────────────────────────────────────────────────────── -->
      <q-tabs
        v-model="recordTab"
        dense
        no-caps
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="record-tabs q-mb-md"
      >
        <q-tab name="open" data-test="tab-open">
          ถือครองอยู่
          <span class="tab-count">{{ store.openPurchases.length }}</span>
        </q-tab>
        <q-tab name="closed" data-test="tab-closed">
          ประวัติการขาย
          <span class="tab-count">{{ store.sales.length }}</span>
        </q-tab>
      </q-tabs>

      <!-- ── ถือครองอยู่ ─────────────────────────────────────────────────────── -->
      <div v-show="recordTab === 'open'" data-test="panel-open">
        <div class="row items-center q-mb-md">
          <q-select
            v-model="folderFilter"
            :options="folderOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            dense
            outlined
            label="โฟลเดอร์"
            style="min-width: 220px"
            data-test="folder-filter"
          />
        </div>

        <div v-if="groupedPurchases.length === 0" class="record-empty" data-test="open-empty">
          <q-icon name="inventory_2" size="40px" class="q-mb-sm" />
          <div class="text-subtitle1 text-weight-bolder">ยังไม่มีรายการถือครอง</div>
          <div class="text-body2 q-mt-xs">กด "ซื้อหุ้น" เพื่อบันทึกรายการแรก</div>
        </div>

        <q-card
          v-for="group in groupedPurchases"
          :key="group.folder || '__none__'"
          flat
          class="folder-card q-mb-md"
          :data-test="`folder-${group.folder || 'none'}`"
        >
          <div class="folder-head row items-center justify-between">
            <div class="row items-center">
              <q-icon name="folder" size="18px" class="q-mr-sm text-primary" />
              <span class="text-subtitle2 text-weight-bolder">{{ group.label }}</span>
              <q-badge class="q-ml-sm" color="grey-7" :label="group.items.length" />
            </div>
            <div class="text-caption text-muted">
              ต้นทุนรวม {{ money(group.totalCost) }} {{ portfolioCurrency }}
            </div>
          </div>

          <q-markup-table flat dense class="bg-transparent">
            <thead>
              <tr>
                <th class="text-left">หุ้น</th>
                <th class="text-right">คงเหลือ</th>
                <th class="text-right">ราคาซื้อ</th>
                <th class="text-right">ต้นทุนรวม</th>
                <th class="text-right">เป้าหมาย</th>
                <th class="text-right">ตัดขาดทุน</th>
                <th class="text-left">วันที่ซื้อ</th>
                <th class="text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.items" :key="row.id" :data-test="`purchase-${row.id}`">
                <td class="text-left">
                  <div class="hold-sym">
                    <span class="hold-badge">{{ symbolInitials(row.stock_symbol) }}</span>
                    <div>
                      <div class="hold-sym-text">{{ row.stock_symbol }}</div>
                      <div class="hold-name">{{ row.stock_name ?? '—' }}</div>
                    </div>
                  </div>
                </td>
                <td class="text-right num-cell">{{ shares(row.remaining_shares) }}</td>
                <td class="text-right num-cell">{{ money(row.purchase_price) }}</td>
                <td class="text-right text-weight-bold num-cell">{{ money(row.total_amount) }}</td>
                <td class="text-right text-positive num-cell">
                  {{ row.target_price === null ? '—' : money(row.target_price) }}
                </td>
                <td class="text-right text-negative num-cell">
                  {{ row.stop_loss === null ? '—' : money(row.stop_loss) }}
                </td>
                <td class="text-left text-muted">{{ formatDate(row.purchase_date) }}</td>
                <td class="text-right">
                  <q-btn
                    flat
                    dense
                    no-caps
                    size="sm"
                    color="negative"
                    label="ขาย"
                    :data-test="`sell-${row.id}`"
                    @click="openSellDialog(row)"
                  />
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card>
      </div>

      <!-- ── ประวัติการขาย ───────────────────────────────────────────────────── -->
      <div v-show="recordTab === 'closed'" data-test="panel-closed">
        <div v-if="store.sales.length === 0" class="record-empty" data-test="closed-empty">
          <q-icon name="history" size="40px" class="q-mb-sm" />
          <div class="text-subtitle1 text-weight-bolder">ยังไม่มีประวัติการขาย</div>
        </div>

        <q-card v-else flat class="folder-card">
          <q-markup-table flat dense class="bg-transparent">
            <thead>
              <tr>
                <th class="text-left">หุ้น</th>
                <th class="text-right">จำนวน</th>
                <th class="text-right">ราคาขาย</th>
                <th class="text-right">ต้นทุน</th>
                <th class="text-right">กำไร/ขาดทุน</th>
                <th class="text-left">วิธีคิดต้นทุน</th>
                <th class="text-left">วันที่ขาย</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sale in store.sales" :key="sale.id" :data-test="`sale-${sale.id}`">
                <td class="text-left">
                  <div class="hold-sym">
                    <span class="hold-badge">{{ symbolInitials(sale.stock_symbol) }}</span>
                    <span class="hold-sym-text">{{ sale.stock_symbol }}</span>
                  </div>
                </td>
                <td class="text-right num-cell">{{ shares(sale.shares_count) }}</td>
                <td class="text-right num-cell">{{ money(sale.sold_price) }}</td>
                <td class="text-right text-muted num-cell">{{ money(sale.cost_basis) }}</td>
                <td class="text-right">
                  <span
                    class="pl-chip"
                    :class="
                      Number(sale.realized_pnl ?? 0) >= 0 ? 'pl-chip--up' : 'pl-chip--down'
                    "
                  >
                    {{ Number(sale.realized_pnl ?? 0) >= 0 ? '+' : ''
                    }}{{ money(sale.realized_pnl) }}
                  </span>
                </td>
                <td class="text-left text-muted">{{ sale.cost_method ?? 'FIFO' }}</td>
                <td class="text-left text-muted">{{ formatDate(sale.sold_date) }}</td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card>
      </div>
    </template>

    <!-- ── Dialog ซื้อ ────────────────────────────────────────────────────────── -->
    <q-dialog v-model="buyDialog" persistent>
      <q-card class="record-dialog" style="width: 620px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bolder">บันทึกการซื้อหุ้น</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-gutter-sm">
          <div class="row q-col-gutter-sm">
            <!-- เดิมเป็นช่องพิมพ์เปล่า ต้องจำ ticker เอง -> ใช้ตัวค้นหาชุดเดียวกับ
                 Stock Terminal (ค้นได้ทั้งสัญลักษณ์และชื่อบริษัท) -->
            <StockSymbolPicker
              v-model="buyForm.stock_symbol"
              label="สัญลักษณ์ *"
              class="col-12 col-sm-4"
              data-test="buy-symbol"
              :error="!!buyErrors.stock_symbol"
              :error-message="buyErrors.stock_symbol ?? ''"
              @select="onBuySymbolSelected"
            />
            <q-input
              v-model="buyForm.stock_name"
              outlined
              dense
              label="ชื่อหุ้น"
              class="col-12 col-sm-5"
            />
            <q-input
              v-model="buyForm.purchase_date"
              outlined
              dense
              type="date"
              label="วันที่ซื้อ"
              class="col-12 col-sm-3"
            />
          </div>

          <div class="row q-col-gutter-sm">
            <q-input
              v-model.number="buyForm.purchase_price"
              outlined
              dense
              type="number"
              label="ราคาต่อหุ้น *"
              class="col-12 col-sm-4"
              data-test="buy-price"
              :error="!!buyErrors.purchase_price"
              :error-message="buyErrors.purchase_price"
            />
            <q-input
              v-model.number="buyForm.total_amount"
              outlined
              dense
              type="number"
              label="ยอดเงินที่จะใช้"
              class="col-12 col-sm-4"
              data-test="buy-total"
              hint="กรอกแล้วคำนวณจำนวนหุ้นให้อัตโนมัติ"
            />
            <q-input
              v-model.number="buyForm.broker_fee_percent"
              outlined
              dense
              type="number"
              label="ค่าธรรมเนียมโบรก (%)"
              class="col-12 col-sm-4"
              data-test="buy-fee-percent"
            />
          </div>

          <div class="row q-col-gutter-sm items-center">
            <q-input
              v-model.number="buyForm.shares_count"
              outlined
              dense
              type="number"
              label="จำนวนหุ้น *"
              class="col-12 col-sm-4"
              data-test="buy-shares"
              :error="!!buyErrors.shares_count"
              :error-message="buyErrors.shares_count"
            />
            <div class="col-12 col-sm-8 text-caption text-muted" data-test="buy-summary">
              มูลค่าสุทธิ {{ money(buyNetValue) }} · ค่าธรรมเนียม {{ money(buyFeeAmount) }}
              {{ portfolioCurrency }}
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <q-input
              v-model.number="buyForm.target_price"
              outlined
              dense
              type="number"
              label="ราคาเป้าหมาย"
              class="col-12 col-sm-4"
              data-test="buy-target"
              :error="!!buyErrors.target_price"
              :error-message="buyErrors.target_price"
            />
            <q-input
              v-model.number="buyForm.stop_loss"
              outlined
              dense
              type="number"
              label="จุดตัดขาดทุน"
              class="col-12 col-sm-4"
              data-test="buy-stop"
              :error="!!buyErrors.stop_loss"
              :error-message="buyErrors.stop_loss"
            />
            <q-select
              v-model="buyForm.folder_name"
              :options="store.folders"
              outlined
              dense
              use-input
              new-value-mode="add-unique"
              label="โฟลเดอร์"
              class="col-12 col-sm-4"
              data-test="buy-folder"
            />
          </div>

          <div class="row q-col-gutter-sm">
            <q-select
              v-model="buyForm.strategy"
              :options="strategyOptions"
              outlined
              dense
              clearable
              label="กลยุทธ์"
              class="col-12 col-sm-6"
            />
            <q-select
              v-model="buyForm.emotion"
              :options="emotionOptions"
              outlined
              dense
              clearable
              label="อารมณ์ตอนซื้อ"
              class="col-12 col-sm-6"
            />
          </div>

          <q-input
            v-model="buyForm.purchase_reason"
            outlined
            dense
            type="textarea"
            rows="2"
            label="เหตุผลที่ซื้อ"
          />
          <q-input
            v-model="buyForm.expectation"
            outlined
            dense
            type="textarea"
            rows="2"
            label="สิ่งที่คาดหวัง"
          />
          <q-input v-model="buyForm.notes" outlined dense type="textarea" rows="2" label="โน้ต" />
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat no-caps label="ยกเลิก" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="บันทึก"
            data-test="submit-buy"
            :loading="store.submitting"
            @click="submitBuy"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Dialog ขาย ────────────────────────────────────────────────────────── -->
    <q-dialog v-model="sellDialog" persistent>
      <q-card class="record-dialog" style="width: 480px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bolder">
            ขาย {{ sellTarget?.stock_symbol }}
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-gutter-sm">
          <div class="text-caption text-muted" data-test="sell-available">
            ถืออยู่ {{ shares(maxSellShares) }} หุ้น
          </div>

          <div class="row q-col-gutter-sm">
            <q-input
              v-model.number="sellForm.shares_count"
              outlined
              dense
              type="number"
              label="จำนวนหุ้นที่ขาย *"
              class="col-12 col-sm-6"
              data-test="sell-shares"
              :error="!!sellErrors.shares_count"
              :error-message="sellErrors.shares_count"
            />
            <q-input
              v-model.number="sellForm.sold_price"
              outlined
              dense
              type="number"
              label="ราคาขาย *"
              class="col-12 col-sm-6"
              data-test="sell-price"
              :error="!!sellErrors.sold_price"
              :error-message="sellErrors.sold_price"
            />
          </div>

          <div class="row q-col-gutter-sm">
            <q-input
              v-model.number="sellForm.fees"
              outlined
              dense
              type="number"
              label="ค่าธรรมเนียม"
              class="col-12 col-sm-4"
            />
            <q-select
              v-model="sellForm.cost_method"
              :options="costMethodOptions"
              outlined
              dense
              label="วิธีคิดต้นทุน"
              class="col-12 col-sm-4"
              data-test="sell-cost-method"
            />
            <q-input
              v-model="sellForm.sold_date"
              outlined
              dense
              type="date"
              label="วันที่ขาย"
              class="col-12 col-sm-4"
            />
          </div>

          <div class="text-caption text-muted" data-test="sell-proceeds">
            ได้รับสุทธิ {{ money(sellProceeds) }} {{ portfolioCurrency }}
          </div>

          <q-input v-model="sellForm.notes" outlined dense type="textarea" rows="2" label="โน้ต" />
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat no-caps label="ยกเลิก" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="negative"
            label="บันทึกการขาย"
            data-test="submit-sell"
            :loading="store.submitting"
            @click="submitSell"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Dialog export ─────────────────────────────────────────────────────── -->
    <q-dialog v-model="exportDialog">
      <q-card class="record-dialog" style="width: 420px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bolder">Export CSV</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <q-option-group
            v-model="exportType"
            :options="[
              { label: 'รายการถือครอง (Holdings)', value: 'holdings' },
              { label: 'กำไร/ขาดทุนที่รับรู้แล้ว (Realized P/L)', value: 'realized' },
            ]"
            data-test="export-type"
          />

          <q-select
            v-model="exportYear"
            :options="yearOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            outlined
            dense
            label="ช่วงปี"
            data-test="export-year"
          />

          <div class="text-caption text-muted" data-test="export-count">
            จะ export
            {{ exportType === 'holdings' ? exportRows.length : exportSales.length }} รายการ
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat no-caps label="ยกเลิก" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="ดาวน์โหลด"
            data-test="submit-export"
            @click="runExport"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
/* หน้านี้ประกาศ palette slate ทับ token teal/sage ของ app.scss เหมือนหน้าอื่น
   ก่อน rebrand — ค่าใน :root ของ mockup ตรงกับ app.scss เป๊ะ จึงยกกลับมาใช้ชุดกลาง */
.stock-record-page {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-card-soft: #f0f5f4;
  --border-color: #dae7e5;
  --text-main: #1b3636;
  --text-muted: #789191;
  --shadow-card: 0 1px 2px rgba(27, 54, 54, 0.04), 0 12px 32px -12px rgba(27, 54, 54, 0.1);

  --accent-400: #9bc5c0;
  --accent-500: #85b6b0;
  --accent-600: #64a6a0;
  --accent-800: #336160;
  --accent-900: #1b3636;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
}

.body--dark .stock-record-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
  --bg-card-soft: #282e2e;
  --border-color: #394141;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.2), 0 20px 44px -16px rgba(0, 0, 0, 0.55);
}

.text-main {
  color: var(--text-main);
}

.text-muted {
  color: var(--text-muted);
}

.record-tabs {
  border-bottom: 1px solid var(--border-color);
}

.folder-card {
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.folder-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

/* ตารางถือครอง/ประวัติขาย ใช้ทรง .hold-table ของแบบ — หัวตารางเล็กและห่าง
   แถวสูงขึ้นให้ badge สัญลักษณ์ 30px นั่งพอดี และแถวสุดท้ายไม่มีเส้นคั่นชนขอบการ์ด */
.folder-card :deep(thead th) {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 10px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}
.folder-card :deep(tbody td) {
  padding: 12px 10px;
  font-size: 12.5px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
.folder-card :deep(tbody tr:last-child td) {
  border-bottom: none;
}
.folder-card :deep(tbody tr:hover) {
  background: var(--bg-card-soft);
}

/* badge ตัวย่อสัญลักษณ์หน้าชื่อหุ้นตามแบบ — ช่วยกวาดตาหาแถวได้เร็วกว่าอ่านตัวอักษรล้วน */
.hold-sym {
  display: flex;
  align-items: center;
  gap: 9px;
}
.hold-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  color: var(--accent-800);
  flex-shrink: 0;
}
.body--dark .hold-badge {
  color: var(--accent-400);
}
.hold-sym-text {
  font-weight: 700;
  font-size: 13px;
}
.hold-name {
  font-size: 10.5px;
  color: var(--text-muted);
  font-weight: 600;
}

/* ตัวเลขในตารางใช้ความกว้างเท่ากันทุกหลัก คอลัมน์ตัวเลขจะได้ไม่เต้น */
.num-cell {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}

/* กำไร/ขาดทุนที่รับรู้แล้วในแบบเป็นชิปมีพื้นหลัง ไม่ใช่ตัวหนังสือสีเปล่า */
.pl-chip {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 6px;
}
.pl-chip--up {
  background: rgba(33, 186, 69, 0.14);
  color: #178230;
}
.pl-chip--down {
  background: rgba(193, 0, 21, 0.12);
  color: #c10015;
}
.body--dark .pl-chip--up {
  color: #4ade80;
}
.body--dark .pl-chip--down {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

/* จำนวนรายการข้างชื่อแท็บตามแบบ */
.tab-count {
  font-size: 10px;
  font-weight: 700;
  background: var(--bg-card-soft);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 999px;
  margin-left: 6px;
}
.record-tabs :deep(.q-tab--active) .tab-count {
  background: rgba(133, 182, 176, 0.18);
  color: var(--accent-800);
}
.body--dark .record-tabs :deep(.q-tab--active) .tab-count {
  color: var(--accent-400);
}

/* ปุ่มหลักในแบบเป็น gradient accent ชุดเดียวกับหน้า Portfolio */
.btn-primary-gradient {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  border-radius: 10px;
  padding: 0 16px;
  box-shadow: 0 2px 8px rgba(27, 54, 54, 0.2);
}

.record-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  color: var(--text-muted);
  text-align: center;
}

.record-banner {
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.record-dialog {
  background: var(--bg-card);
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useActivePositionStore } from 'stores/ActivePositionStore';
import { usePortfolioStore } from 'stores/PortfolioStore';

const $q = useQuasar();
const positionStore = useActivePositionStore();
const portStore = usePortfolioStore();

// ==========================================
// 🚀 Lifecycle & Data Fetching
// ==========================================
onMounted(() => {
  positionStore.fetchPositions();
});

// ==========================================
// 🗂️ Dropdown Options
// ==========================================
const pairOptions = [
  { label: 'Crypto', disable: true },
  { label: 'BTC/USD', value: 'BTC/USD' },
  { label: 'ETH/USD', value: 'ETH/USD' },
  { label: 'BNB/USD', value: 'BNB/USD' },
  { label: 'SOL/USD', value: 'SOL/USD' },
  { label: 'XRP/USD', value: 'XRP/USD' },
  { label: 'DOGE/USD', value: 'DOGE/USD' },
  { label: 'Forex', disable: true },
  { label: 'XAU/USD (Gold)', value: 'XAU/USD' },
  { label: 'EUR/USD', value: 'EUR/USD' },
  { label: 'GBP/USD', value: 'GBP/USD' },
  { label: 'USD/JPY', value: 'USD/JPY' },
  { label: 'USD/CHF', value: 'USD/CHF' },
  { label: 'Indices', disable: true },
  { label: 'US30', value: 'US30' },
  { label: 'NAS100', value: 'NAS100' },
  { label: 'SPX500', value: 'SPX500' },
];

// ==========================================
// 🗂️ Table Configurations
// ==========================================
const columns = [
  { name: 'pair', label: 'Asset / Pair', align: 'left' as const, field: 'pair', sortable: true },
  { name: 'trade_type', label: 'Side', align: 'center' as const, field: 'trade_type' },
  { name: 'volume', label: 'Lots', align: 'center' as const, field: 'volume' },
  { name: 'entry', label: 'Entry Price & Time', align: 'right' as const, field: 'open_price' },
  { name: 'current', label: 'Floating P/L', align: 'right' as const, field: 'currentPrice' },
  { name: 'actions', label: 'Actions', align: 'center' as const, field: 'actions' },
];

// ==========================================
// ➕ Add New Position Logic
// ==========================================
const showAddDialog = ref(false);
const isSubmitting = ref(false);

const getNowForInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const initialForm = {
  asset: '',
  trade_type: 'BUY' as 'BUY' | 'SELL',
  volume: null as number | null,
  entry_price: null as number | null,
  entry_date: getNowForInput(), // เก็บเวลาเข้า
  strategy: '',
};

const formData = ref({ ...initialForm });

const openAddDialog = () => {
  formData.value = { ...initialForm, entry_date: getNowForInput() };
  showAddDialog.value = true;
};

const submitAddPosition = async () => {
  isSubmitting.value = true;

  const currentPortfolioId =
    portStore.activePortfolio?.id ||
    (portStore.portfolios?.length > 0 ? portStore.portfolios[0].id : null);

  const success = await positionStore.addPosition({
    ...formData.value,
    portfolio_id: currentPortfolioId,
  } as any);

  if (success) {
    $q.notify({
      type: 'positive',
      message: 'Trade Executed & Monitoring Started',
      icon: 'rocket_launch',
    });
    showAddDialog.value = false;
  }
  isSubmitting.value = false;
};

// ==========================================
// 🔒 Close Position Logic (Finalize)
// ==========================================
const showCloseDialog = ref(false);
const tradeToClose = ref<any>(null);
const closeForm = ref({
  close_price: null as number | null,
  close_date: getNowForInput(), // เก็บเวลาปิด
  note: '',
});

const openCloseDialog = (row: any) => {
  tradeToClose.value = row;

  // 🟢 แก้ไขตรงนี้: แปลงค่าให้ปลอดภัยก่อนนำไปปัดเศษทศนิยม
  const currentP = Number(row.currentPrice);
  const openP = Number(row.open_price);

  closeForm.value = {
    close_price: !isNaN(currentP) ? Number(currentP.toFixed(2)) : openP,
    close_date: getNowForInput(),
    note: '',
  };
  showCloseDialog.value = true;
};

const submitClosePosition = async () => {
  if (!tradeToClose.value) return;

  const currentPortfolioId =
    portStore.activePortfolio?.id ||
    (portStore.portfolios?.length > 0 ? portStore.portfolios[0].id : null);

  const success = await positionStore.closePosition(tradeToClose.value.id, {
    close_price: Number(closeForm.value.close_price),
    close_date: new Date(closeForm.value.close_date).toISOString(),
    note: closeForm.value.note,
    portfolio_id: currentPortfolioId,
  });

  if (success) {
    $q.notify({
      type: 'positive',
      message: `Trade Closed: ${tradeToClose.value.pair} moved to Journal`,
      icon: 'check_circle',
    });
    // พอปิดสำเร็จ ข้อมูลในตารางจะเป็น _closed: true (จาก Store)
    showCloseDialog.value = false;
  }
};

// ==========================================
// 🎨 Helpers
// ==========================================
const formatPrice = (val: any) => {
  const num = Number(val);
  return isNaN(num)
    ? '0.00'
    : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
};

const formatTimeShort = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};
</script>

<template>
  <q-page class="active-page q-pa-md q-pa-sm-lg">
    <div class="row justify-between items-end q-mb-xl q-mt-xs header-section">
      <div>
        <div class="text-h4 text-weight-bolder text-main tracking-tight">Active Positions</div>
        <div class="text-subtitle2 text-muted q-mt-xs flex items-center">
          <q-icon name="sensors" class="q-mr-sm text-primary" size="xs" />
          Real-time monitoring and floating profit management
        </div>
      </div>
      <q-btn
        unelevated
        icon="add"
        label="Open New Trade"
        class="btn-primary-modern text-white text-weight-bold"
        @click="openAddDialog"
      />
    </div>

    <div class="row q-col-gutter-md q-mb-xl">
      <div
        class="col-6 col-sm-4"
        v-for="(val, label, index) in {
          'Active Trades': positionStore.totalPositions,
          'Buy Volume': positionStore.buyPositions.length,
          'Sell Volume': positionStore.sellPositions.length,
        }"
        :key="label"
      >
        <q-card class="dashboard-card stat-card q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-caption text-muted text-weight-bold text-uppercase tracking-wide">
              {{ label }}
            </div>
            <div
              class="icon-box"
              :class="
                index === 0
                  ? 'bg-icon-primary text-primary'
                  : index === 1
                    ? 'bg-icon-positive text-positive'
                    : 'bg-icon-negative text-negative'
              "
            >
              <q-icon
                :name="index === 0 ? 'layers' : index === 1 ? 'trending_up' : 'trending_down'"
                size="20px"
              />
            </div>
          </div>
          <div class="stat-val text-weight-bolder text-main tracking-tight">{{ val }}</div>
        </q-card>
      </div>
    </div>

    <q-card class="dashboard-card table-card overflow-hidden">
      <q-table
        :rows="positionStore.positions"
        :columns="columns"
        row-key="id"
        flat
        hide-pagination
        :loading="positionStore.isLoading"
        class="journal-table"
        :rows-per-page-options="[0]"
        no-data-label="No active positions found. Start by opening a new trade."
      >
        <template v-slot:body="props">
          <q-tr :props="props" :class="{ 'closed-row': props.row._closed }">
            <q-td key="pair" :props="props">
              <div class="text-weight-bolder text-main">{{ props.row.pair }}</div>
              <div class="text-caption text-muted" v-if="props.row.strategy">
                {{ props.row.strategy }}
              </div>
            </q-td>

            <q-td key="trade_type" :props="props">
              <q-badge
                :class="props.row.trade_type === 'BUY' ? 'chip-buy' : 'chip-sell'"
                class="text-weight-bold custom-chip"
                :outline="props.row._closed"
              >
                {{ props.row.trade_type }}
              </q-badge>
            </q-td>

            <q-td key="volume" :props="props">
              <div class="text-weight-bold">{{ props.row.volume }}</div>
            </q-td>

            <q-td key="entry" :props="props">
              <div class="text-weight-bold text-main">{{ formatPrice(props.row.open_price) }}</div>
              <div class="text-caption text-muted">
                {{ formatTimeShort(props.row.opened_at || props.row.entry_date) }}
              </div>
            </q-td>

            <q-td key="current" :props="props">
              <div v-if="props.row._closed" class="text-muted text-weight-bold text-uppercase">
                Closed
              </div>
              <div v-else>
                <div
                  class="text-weight-bolder"
                  :class="props.row.status === 'profit' ? 'text-positive' : 'text-negative'"
                >
                  {{ props.row.status === 'profit' ? '+' : ''
                  }}{{ formatPrice(props.row.currentPrice) }}
                </div>
                <div
                  class="text-caption"
                  :class="props.row.status === 'profit' ? 'text-positive' : 'text-negative'"
                >
                  <q-icon
                    :name="props.row.status === 'profit' ? 'arrow_upward' : 'arrow_downward'"
                    size="10px"
                  />
                  Floating
                </div>
              </div>
            </q-td>

            <q-td key="actions" :props="props">
              <q-icon v-if="props.row._closed" name="lock" color="grey-5" size="sm" />
              <q-btn
                v-else
                unelevated
                round
                color="positive"
                icon="check_circle"
                size="sm"
                class="btn-action-success"
                @click="openCloseDialog(props.row)"
              >
                <q-tooltip class="bg-positive">Close Position & Journal</q-tooltip>
              </q-btn>
            </q-td>
          </q-tr>
        </template>
      </q-table>
    </q-card>

    <q-dialog v-model="showAddDialog" persistent>
      <q-card class="dialog-card popup-card q-pa-sm" style="width: 700px; max-width: 95vw">
        <q-card-section class="row items-center justify-between header-divider q-pb-md">
          <div class="text-h6 text-weight-bold text-main flex items-center">
            <q-icon name="add_chart" class="q-mr-sm text-primary" size="sm" />
            Execute New Trade
          </div>
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-form @submit="submitAddPosition">
          <q-card-section class="q-pt-md">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-8">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">Asset / Pair *</div>
                <q-select
                  class="rounded-input"
                  outlined
                  dense
                  v-model="formData.asset"
                  :options="pairOptions"
                  emit-value
                  map-options
                  placeholder="Select Asset"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>
              <div class="col-12 col-sm-4">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">Side *</div>
                <q-select
                  class="rounded-input"
                  outlined
                  dense
                  v-model="formData.trade_type"
                  :options="['BUY', 'SELL']"
                />
              </div>

              <div class="col-12 col-sm-4">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">
                  Lot Size (Volume) *
                </div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model.number="formData.volume"
                  type="number"
                  step="0.01"
                  placeholder="0.10"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>
              <div class="col-12 col-sm-4">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">Entry Price *</div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model.number="formData.entry_price"
                  type="number"
                  step="any"
                  placeholder="2030.50"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>
              <div class="col-12 col-sm-4">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">Entry Time *</div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model="formData.entry_date"
                  type="datetime-local"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>

              <div class="col-12">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">
                  Strategy / Reason
                </div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model="formData.strategy"
                  type="textarea"
                  rows="2"
                  placeholder="Why are you taking this trade?"
                />
              </div>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md q-pt-sm">
            <q-btn
              flat
              label="Cancel"
              v-close-popup
              class="btn-ghost-modern q-px-md text-weight-medium"
            />
            <q-btn
              unelevated
              label="Execute Trade"
              icon="bolt"
              class="btn-primary-modern text-white text-weight-bold q-px-xl"
              type="submit"
              :loading="isSubmitting"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showCloseDialog" persistent>
      <q-card class="dialog-card popup-card q-pa-sm" style="width: 450px; max-width: 95vw">
        <q-card-section class="row items-center justify-between header-divider q-pb-md">
          <div class="text-h6 text-weight-bold text-main flex items-center">
            <q-icon name="verified" class="q-mr-sm text-positive" size="sm" />
            Close: {{ tradeToClose?.pair }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-form @submit="submitClosePosition">
          <q-card-section class="q-pt-md">
            <div class="row q-col-gutter-md">
              <div class="col-12">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">
                  Actual Exit Price *
                </div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model.number="closeForm.close_price"
                  type="number"
                  step="any"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>
              <div class="col-12">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">Exit Time *</div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model="closeForm.close_date"
                  type="datetime-local"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>
              <div class="col-12">
                <div class="text-caption text-muted text-weight-bold q-mb-xs">Lessons / Notes</div>
                <q-input
                  class="rounded-input"
                  outlined
                  dense
                  v-model="closeForm.note"
                  type="textarea"
                  rows="3"
                  placeholder="What happened with this trade?"
                />
              </div>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md q-pt-sm">
            <q-btn
              flat
              label="Back"
              v-close-popup
              class="btn-ghost-modern q-px-md text-weight-medium"
            />
            <q-btn
              unelevated
              label="Close & Move to Journal"
              icon="check"
              class="btn-success-modern text-white text-weight-bold q-px-lg"
              type="submit"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
/* ==========================================================
   CSS Variables & Themes
========================================================== */
.active-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.03);
  --shadow-hover: 0 10px 25px -5px rgba(0, 0, 0, 0.08);

  --bg-icon-primary: #eff6ff;
  --bg-icon-positive: #f0fdf4;
  --bg-icon-negative: #fef2f2;
  --bg-dialog: #ffffff;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
}

.body--dark .active-page {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --bg-card-soft: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #23314b;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.3);
  --shadow-hover: 0 10px 20px -3px rgba(0, 0, 0, 0.5);

  --bg-icon-primary: rgba(59, 130, 246, 0.15);
  --bg-icon-positive: rgba(34, 197, 94, 0.15);
  --bg-icon-negative: rgba(239, 68, 68, 0.15);
  --bg-dialog: #1a2540;
}

/* ==========================================================
   Layout & Cards
========================================================== */
.dashboard-card {
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
}

.dialog-card {
  background: var(--bg-dialog) !important;
  border-radius: 20px;
}

.stat-val {
  font-size: 2rem;
  line-height: 2.5rem;
}

.icon-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-positive {
  background-color: var(--bg-icon-positive);
}
.bg-icon-negative {
  background-color: var(--bg-icon-negative);
}

/* ==========================================================
   Buttons (Modern Gradients)
========================================================== */
.btn-primary-modern {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  border-radius: 10px;
  padding: 0 20px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
  transition: all 0.2s ease;
}
.btn-primary-modern:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.45) !important;
}

.btn-success-modern {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 10px;
  padding: 0 20px;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
}

.btn-ghost-modern {
  background: transparent;
  color: var(--text-muted);
  border-radius: 10px;
}
.btn-action-success {
  box-shadow: 0 2px 5px rgba(34, 197, 94, 0.3);
}

/* ==========================================================
   Table (เหมือนหน้า Journal) & Rows
========================================================== */
.journal-table {
  background: var(--bg-card);
  border-radius: 16px;
}
.journal-table :deep(th) {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 2px solid var(--border-color);
  padding: 16px;
}
.journal-table :deep(td) {
  font-size: 14px;
  font-weight: 500;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}
.journal-table :deep(tbody tr) {
  transition:
    background-color 0.2s ease,
    opacity 0.3s ease;
}
.journal-table :deep(tbody tr:hover) {
  background-color: var(--bg-card-soft);
}

/* 🟢 Style สำหรับไม้ที่ปิดแล้ว (ทำให้เป็นสีเทาๆ เบลอๆ) */
.closed-row {
  opacity: 0.55;
  background-color: var(--bg-card-soft) !important;
  filter: grayscale(80%);
  pointer-events: none; /* ปิดไม่ให้กดปุ่มซ้ำได้อีก */
}

.rounded-input :deep(.q-field__control) {
  border-radius: 10px !important;
}

/* ==========================================================
   Chips & Badges
========================================================== */
.custom-chip {
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
}
.chip-buy {
  background-color: var(--bg-icon-positive);
  color: #16a34a;
}
.chip-sell {
  background-color: var(--bg-icon-negative);
  color: #dc2626;
}

.header-divider {
  border-bottom: 1px solid var(--border-color);
}
.tracking-tight {
  letter-spacing: -0.02em;
}
.tracking-wide {
  letter-spacing: 0.05em;
}
</style>

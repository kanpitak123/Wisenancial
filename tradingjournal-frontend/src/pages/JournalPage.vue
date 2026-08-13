<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import { useJournalStore, type Trade } from 'stores/JournalStore';
import { useTradeStore } from 'stores/TradeStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useGlobalFilterStore } from 'stores/GlobalFilterStore';

const $q = useQuasar();
const store = useJournalStore();
const tradeStore = useTradeStore();
const portStore = usePortfolioStore();
const filterStore = useGlobalFilterStore();

// ==========================================
// Dialog State
// ==========================================
const showTradeDialog = ref(false);
const showBalanceDialog = ref(false);
const showImportDialog = ref(false); // เพิ่มสำหรับ Dialog นำเข้าข้อมูล

onMounted(async () => {
  if (portStore.portfolios.length === 0) {
    await portStore.loadPortfolios();
  }
  const activePort = portStore.activePortfolio;
  if (activePort) {
    // 🟢 เปลี่ยนมาเรียก fetchTrades จาก TradeStore เพื่อยิง API จริง
    await tradeStore.fetchTrades(activePort.id);
  }
});

const completedTrades = computed(() => {
  // กรองเอาเฉพาะไม้ที่สถานะไม่ใช่ OPEN มาแสดงในหน้าประวัติ
  return tradeStore.journalTrades.filter((trade: any) => trade.result_status !== 'OPEN');
});
// ==========================================
// Dropdown Options
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

const strategyOptions = [
  'breakout',
  'pullback',
  'reversal',
  'trendfollow',
  'smcict',
  'scalping',
  'indicatorsignal',
  'newtrades',
];
const trendOptions = ['uptrend', 'downtrend', 'sideway'];
const emotionOptions = ['confident', 'normal', 'fear', 'greed', 'revenge', 'bored'];
const entryReasonOptions = ['Support', 'Resistance', 'MA Cross', 'RSI', 'Pattern'];
const brokerOptions = [{ label: 'Exness', value: 'EXNESS' }]; // ตัวเลือกโบรกเกอร์

// ==========================================
// Forms
// ==========================================
// ฟังก์ชันสร้างเวลาปัจจุบันให้อยู่ในฟอร์แมตของ datetime-local input (YYYY-MM-DDTHH:mm)
const getNowForInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const tradeForm = ref({
  pair: null as string | null,
  trade_type: 'BUY' as 'BUY' | 'SELL',
  result_status: 'WIN' as 'WIN' | 'LOSS',
  pnl: null as number | null,
  strategy: null as string | null,
  trend: null as string | null,
  emotion: null as string | null,
  entry_reason: null as string | null,
  volume: null as number | null, // เพิ่ม Lots
  open_price: null as number | null, // เพิ่มราคาเปิด
  close_price: null as number | null, // เพิ่มราคาปิด
  note: null as string | null, // เพิ่มบันทึกโน้ต
  opened_at: getNowForInput(), // เพิ่มเวลาเปิด
  closed_at: getNowForInput(), // เพิ่มเวลาปิด
});

const moneyForm = ref({
  type: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAW',
  amount: null as number | null,
});

const importForm = ref({
  broker: 'EXNESS',
  accountId: '',
  file: null as File | null,
});

// ==========================================
// Utils & Actions
// ==========================================
// ฟังก์ชันเลือกแสดงเวลา สำหรับรองรับข้อมูลที่มาจากทั้งการกรอกมือและจากโบรกเกอร์
const getDisplayDate = (trade: Record<string, any>) => {
  return trade.closed_at || trade.opened_at || trade.date || '';
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const formatSummaryValue = (key: string, val: string | number) => {
  const num = Number(val);
  if (isNaN(num)) return val;

  const lowerKey = key.toLowerCase();

  if (lowerKey.includes('pnl')) {
    const formattedNum = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return num >= 0 ? `+$${formattedNum}` : `-$${formattedNum}`;
  }

  if (lowerKey.includes('growth')) {
    const formattedNum = Math.abs(num).toFixed(2);
    return num >= 0 ? `+${formattedNum}%` : `-${formattedNum}%`;
  }

  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const addTrade = () => {
  if (tradeForm.value.pair && tradeForm.value.pnl !== null) {
    const finalPnl =
      tradeForm.value.result_status === 'LOSS'
        ? -Math.abs(tradeForm.value.pnl)
        : Math.abs(tradeForm.value.pnl);

    void store.addTrade({
      pair: tradeForm.value.pair,
      trade_type: tradeForm.value.trade_type,
      result_status: tradeForm.value.result_status,
      pnl: finalPnl,
      strategy: tradeForm.value.strategy,
      trend: tradeForm.value.trend,
      emotion: tradeForm.value.emotion,
      entry_reason: tradeForm.value.entry_reason,
      volume: tradeForm.value.volume,
      open_price: tradeForm.value.open_price,
      close_price: tradeForm.value.close_price,
      note: tradeForm.value.note,
      opened_at: tradeForm.value.opened_at
        ? new Date(tradeForm.value.opened_at).toISOString()
        : null,
      closed_at: tradeForm.value.closed_at
        ? new Date(tradeForm.value.closed_at).toISOString()
        : null,
      date: new Date().toISOString(),
    });

    $q.notify({ type: 'positive', message: 'Trade saved successfully' });

    // Reset Form
    tradeForm.value = {
      pair: null,
      trade_type: 'BUY',
      result_status: 'WIN',
      pnl: null,
      strategy: null,
      trend: null,
      emotion: null,
      entry_reason: null,
      volume: null,
      open_price: null,
      close_price: null,
      note: null,
      opened_at: getNowForInput(),
      closed_at: getNowForInput(),
    };

    // Close Dialog
    showTradeDialog.value = false;
  } else {
    $q.notify({ type: 'warning', message: 'Please fill in required fields' });
  }
};

const addMoney = () => {
  if (moneyForm.value.amount) {
    void store.addMoney(moneyForm.value.type, moneyForm.value.amount);
    moneyForm.value.amount = null;
    $q.notify({ type: 'positive', message: 'Transaction saved successfully' });
    showBalanceDialog.value = false;
  }
};

const submitImport = async () => {
  if (!importForm.value.file) {
    $q.notify({ type: 'warning', message: 'กรุณาเลือกไฟล์ประวัติการเทรด (.csv)' });
    return;
  }
  if (!importForm.value.accountId) {
    $q.notify({ type: 'warning', message: 'กรุณากรอก Account ID (เลขบัญชี)' });
    return;
  }

  const formData = new FormData();
  formData.append('file', importForm.value.file);
  formData.append('broker', importForm.value.broker);
  formData.append('accountId', importForm.value.accountId);

  try {
    const res = await (
      store as { importBrokerTrades: (d: FormData) => Promise<any> }
    ).importBrokerTrades(formData);
    $q.notify({
      type: 'positive',
      message: `นำเข้าสำเร็จ! ${res?.inserted_or_skipped || 0} รายการ`,
      position: 'top',
    });
    importForm.value.file = null;
    importForm.value.accountId = '';
    showImportDialog.value = false;
  } catch (err: any) {
    $q.notify({
      type: 'negative',
      message: err.message || 'เกิดข้อผิดพลาดในการนำเข้า',
      position: 'top',
    });
  }
};

const deleteDialog = ref(false);
const tradeToDelete = ref<Trade | null>(null);

const confirmDelete = (row: Trade) => {
  tradeToDelete.value = row;
  deleteDialog.value = true;
};

const submitDelete = () => {
  if (!tradeToDelete.value) return;
  const row = tradeToDelete.value;
  deleteDialog.value = false;
  tradeStore
    .deleteTrade(row.id)
    .then(() => {
      void store.removeTrade(row.id);
      $q.notify({ type: 'positive', message: 'Deleted successfully', position: 'top' });
    })
    .catch((err) => {
      console.error('Deletion failed:', err);
      $q.notify({ type: 'negative', message: 'Deletion failed', position: 'top' });
    });
};

const filteredTrades = computed(() => {
  const start = filterStore.apiStartDate; // รูปแบบ YYYY-MM-DD
  const end = filterStore.apiEndDate; // รูปแบบ YYYY-MM-DD

  return store.trades.filter((trade) => {
    const tradeDateStr = getDisplayDate(trade);
    if (!tradeDateStr) return false;

    // ตัดข้อความเอาแค่ปี-เดือน-วัน (YYYY-MM-DD) มาเทียบกันตรงๆ แบบ String
    const tradeDateYMD = tradeDateStr.slice(0, 10);
    return tradeDateYMD >= start && tradeDateYMD <= end;
  });
});
</script>

<template>
  <q-page class="journal-page q-pa-md q-pa-sm-lg">
    <div class="row justify-between items-end q-mb-xl q-mt-xs header-section">
      <div>
        <div class="text-h4 text-weight-bolder text-main tracking-tight">Trading Journal</div>
        <div
          v-if="portStore.activePortfolio"
          class="text-subtitle2 text-muted q-mt-sm flex items-center"
        >
          <q-icon name="folder_open" class="q-mr-sm" size="xs" />
          Active Portfolio:
          <span class="text-primary text-weight-bold q-ml-xs">{{
            portStore.activePortfolio.name
          }}</span>
        </div>
      </div>

      <div class="row q-gutter-sm q-mt-md q-mt-sm-none">
        <q-btn
          unelevated
          icon="account_balance_wallet"
          label="Manage Balance"
          class="btn-outline-modern text-weight-semibold"
          @click="showBalanceDialog = true"
        />
        <q-btn
          unelevated
          icon="upload_file"
          label="Import Broker"
          class="btn-outline-modern text-weight-semibold"
          @click="showImportDialog = true"
        />
        <q-btn
          unelevated
          icon="add"
          label="New Trade"
          class="btn-primary-modern text-white text-weight-bold"
          @click="showTradeDialog = true"
        />
      </div>
    </div>

    <div class="row q-col-gutter-md q-mb-xl">
      <div class="col-6 col-sm-6 col-md-3" v-for="(value, key, index) in store.summary" :key="key">
        <q-card class="dashboard-card stat-card h-full q-pa-md flex column justify-between">
          <div class="row items-center justify-between q-mb-md">
            <div class="text-caption text-muted text-weight-bold text-uppercase tracking-wide">
              {{ key }}
            </div>
            <div
              class="icon-box"
              :class="
                index === 0
                  ? 'bg-icon-primary text-primary'
                  : index === 1
                    ? 'bg-icon-purple text-purple-4'
                    : index === 2
                      ? Number(value) < 0
                        ? 'bg-icon-negative text-negative'
                        : 'bg-icon-positive text-positive'
                      : Number(value) < 0
                        ? 'bg-icon-negative text-negative'
                        : 'bg-icon-warning text-warning'
              "
            >
              <q-icon
                :name="
                  index === 0
                    ? 'account_balance_wallet'
                    : index === 1
                      ? 'account_balance'
                      : index === 2
                        ? Number(value) < 0
                          ? 'trending_down'
                          : 'trending_up'
                        : 'insights'
                "
                size="20px"
              />
            </div>
          </div>
          <div>
            <div
              class="stat-val text-weight-bolder tracking-tight"
              :class="
                index === 0 || index === 1
                  ? 'text-main'
                  : index === 2
                    ? Number(value) < 0
                      ? 'text-negative'
                      : 'text-positive'
                    : Number(value) < 0
                      ? 'text-negative'
                      : 'text-warning'
              "
            >
              {{ formatSummaryValue(String(key), value) }}
            </div>
          </div>
        </q-card>
      </div>
    </div>

    <div class="text-h6 text-weight-bold text-main q-mb-md flex items-center">
      <q-icon name="history" class="q-mr-sm" size="sm" color="primary" />
      Recent Trades
    </div>

    <div v-if="filteredTrades.length === 0" class="flex flex-center q-py-xl column text-muted">
      <q-icon name="receipt_long" size="4em" class="q-mb-md opacity-50" />
      <div class="text-h6">No trades found</div>
      <div class="text-caption">Start journaling your trades by clicking 'New Trade'</div>
    </div>

    <div v-else class="row q-col-gutter-sm">
      <div v-for="trade in filteredTrades" :key="trade.id" class="col-12">
        <q-card class="dashboard-card list-card q-pa-sm q-pa-md-md">
          <div class="row items-center no-wrap q-gutter-sm">
            <div
              class="date-box bg-card-soft text-center rounded-borders q-pa-sm"
              style="min-width: 52px; flex-shrink: 0"
            >
              <div
                class="text-caption text-weight-bold text-main"
                style="font-size: 15px; line-height: 1.2"
              >
                {{ formatDate(getDisplayDate(trade)).split(' ')[0] }}
              </div>
              <div class="text-caption text-muted" style="font-size: 10px; line-height: 1.3">
                {{ formatDate(getDisplayDate(trade)).split(' ')[1] }}
              </div>
              <div class="text-caption text-muted" style="font-size: 10px; line-height: 1.3">
                {{ formatDate(getDisplayDate(trade)).split(' ')[2] }}
              </div>
              <div class="text-caption text-muted q-mt-xs" style="font-size: 10px">
                {{ formatTime(getDisplayDate(trade)) }}
              </div>
            </div>

            <div class="col" style="min-width: 0">
              <div class="text-subtitle1 text-weight-bold text-main flex items-center">
                {{ trade.pair }}
                <q-chip
                  size="xs"
                  class="q-ml-sm text-weight-bold custom-chip"
                  :class="
                    trade.trade_type === 'BUY' || trade.trade_type === 'DEPOSIT'
                      ? 'chip-buy'
                      : 'chip-sell'
                  "
                >
                  {{ trade.trade_type }}
                </q-chip>
              </div>
              <div class="row q-gutter-xs q-mt-xs items-center trade-tags-wrap">
                <template v-if="trade.trade_type === 'BUY' || trade.trade_type === 'SELL'">
                  <span v-if="trade.strategy" class="trade-tag trade-tag--strategy">
                    <q-icon name="track_changes" size="10px" class="q-mr-xs" />{{ trade.strategy }}
                  </span>
                  <span v-if="trade.trend" class="trade-tag trade-tag--trend">
                    <q-icon
                      :name="
                        trade.trend === 'uptrend'
                          ? 'trending_up'
                          : trade.trend === 'downtrend'
                            ? 'trending_down'
                            : 'trending_flat'
                      "
                      size="10px"
                      class="q-mr-xs"
                    />{{ trade.trend }}
                  </span>
                  <span v-if="trade.emotion" class="trade-tag trade-tag--emotion">
                    <q-icon name="psychology" size="10px" class="q-mr-xs" />{{ trade.emotion }}
                  </span>
                  <span v-if="trade.entry_reason" class="trade-tag trade-tag--reason">
                    <q-icon name="push_pin" size="10px" class="q-mr-xs" />{{ trade.entry_reason }}
                  </span>
                </template>
                <template v-else>
                  <span class="text-caption text-muted opacity-80">Balance Management</span>
                </template>
              </div>
            </div>

            <div class="row items-center q-gutter-xs" style="flex-shrink: 0">
              <div
                class="text-h6 text-weight-bolder tracking-tight text-right pnl-text"
                :class="Number(trade.pnl) >= 0 ? 'text-positive' : 'text-negative'"
              >
                {{ Number(trade.pnl) >= 0 ? '+' : '' }}${{ Number(trade.pnl).toFixed(2) }}
              </div>
              <q-btn
                flat
                round
                color="grey-5"
                icon="delete_outline"
                size="sm"
                @click="confirmDelete(trade)"
              >
                <q-tooltip class="bg-negative">Delete</q-tooltip>
              </q-btn>
            </div>
          </div>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="showTradeDialog" persistent>
      <q-card class="dialog-card popup-card q-pa-sm" style="width: 800px; max-width: 95vw">
        <q-card-section class="row items-center justify-between header-divider q-pb-md">
          <div class="text-h6 text-weight-bold text-main flex items-center">
            <q-icon name="add_task" class="q-mr-sm text-primary" size="sm" />
            Add New Trade
          </div>
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Type</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.trade_type"
                :options="['BUY', 'SELL']"
                :dark="$q.dark.isActive"
              >
                <template v-slot:selected-item="scope">
                  <div
                    class="flex items-center text-weight-bold"
                    :class="scope.opt === 'BUY' ? 'text-positive' : 'text-negative'"
                  >
                    <q-icon
                      :name="'fiber_manual_record'"
                      :color="scope.opt === 'BUY' ? 'positive' : 'negative'"
                      size="xs"
                      class="q-mr-xs"
                    />
                    {{ scope.opt }}
                  </div>
                </template>
              </q-select>
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Pair</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.pair"
                :options="pairOptions"
                emit-value
                map-options
                placeholder="Select Pair"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Result</div>
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-btn
                    :unelevated="tradeForm.result_status === 'WIN'"
                    :outline="tradeForm.result_status !== 'WIN'"
                    dense
                    class="full-width rounded-borders text-weight-bold"
                    label="WIN"
                    :color="tradeForm.result_status === 'WIN' ? 'positive' : 'grey'"
                    @click="tradeForm.result_status = 'WIN'"
                  />
                </div>
                <div class="col-6">
                  <q-btn
                    :unelevated="tradeForm.result_status === 'LOSS'"
                    :outline="tradeForm.result_status !== 'LOSS'"
                    dense
                    class="full-width rounded-borders text-weight-bold"
                    label="LOSS"
                    :color="tradeForm.result_status === 'LOSS' ? 'negative' : 'grey'"
                    @click="tradeForm.result_status = 'LOSS'"
                  />
                </div>
              </div>
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Amount / PnL ($)</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model.number="tradeForm.pnl"
                type="number"
                min="0"
                placeholder="e.g. 50"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Open Time</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.opened_at"
                type="datetime-local"
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-3 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Close Time</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.closed_at"
                type="datetime-local"
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Lot Size</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model.number="tradeForm.volume"
                type="number"
                step="0.01"
                placeholder="e.g. 0.01"
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Open Price</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model.number="tradeForm.open_price"
                type="number"
                step="any"
                placeholder="e.g. 2000"
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Close Price</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model.number="tradeForm.close_price"
                type="number"
                step="any"
                placeholder="e.g. 2010"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Strategy</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.strategy"
                :options="strategyOptions"
                placeholder="Select"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Trend</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.trend"
                :options="trendOptions"
                placeholder="Select"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Emotion</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.emotion"
                :options="emotionOptions"
                placeholder="Select"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Entry Reason</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.entry_reason"
                :options="entryReasonOptions"
                placeholder="Select"
                :dark="$q.dark.isActive"
              />
            </div>

            <div class="col-12 q-mt-sm">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Note</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model="tradeForm.note"
                type="textarea"
                rows="2"
                placeholder="Enter notes..."
                :dark="$q.dark.isActive"
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
            label="Save Trade"
            icon="save"
            class="btn-primary-modern text-white text-weight-bold q-px-xl"
            @click="addTrade"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showBalanceDialog" persistent>
      <q-card class="dialog-card popup-card q-pa-sm" style="width: 500px; max-width: 95vw">
        <q-card-section class="row items-center justify-between header-divider q-pb-md">
          <div class="text-h6 text-weight-bold text-main flex items-center">
            <q-icon name="account_balance_wallet" class="q-mr-sm text-primary" size="sm" />
            Manage Balance
          </div>
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Type</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="moneyForm.type"
                :options="['DEPOSIT', 'WITHDRAW']"
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Amount ($)</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model.number="moneyForm.amount"
                type="number"
                min="0"
                placeholder="e.g. 100"
                :dark="$q.dark.isActive"
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
            label="Confirm"
            icon="check"
            class="btn-success-modern text-white text-weight-bold q-px-lg"
            @click="addMoney"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showImportDialog" persistent>
      <q-card class="dialog-card popup-card q-pa-sm" style="width: 450px; max-width: 95vw">
        <q-card-section class="row items-center justify-between header-divider q-pb-md">
          <div class="text-h6 text-weight-bold text-main flex items-center">
            <q-icon name="upload_file" class="q-mr-sm text-primary" size="sm" />
            Import from Broker
          </div>
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="row q-col-gutter-md">
            <div class="col-12">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Broker</div>
              <q-select
                class="rounded-input"
                outlined
                dense
                v-model="importForm.broker"
                :options="brokerOptions"
                emit-value
                map-options
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">Account ID</div>
              <q-input
                class="rounded-input"
                outlined
                dense
                v-model="importForm.accountId"
                placeholder="Enter account number"
                :dark="$q.dark.isActive"
              />
            </div>
            <div class="col-12">
              <div class="text-caption text-muted text-weight-bold q-mb-xs">CSV File</div>
              <q-file
                class="rounded-input"
                outlined
                dense
                v-model="importForm.file"
                label="Select CSV file"
                accept=".csv"
                clearable
                :dark="$q.dark.isActive"
              >
                <template v-slot:prepend>
                  <q-icon name="attach_file" />
                </template>
              </q-file>
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
            label="Import"
            icon="upload"
            class="btn-primary-modern text-white text-weight-bold q-px-lg"
            @click="submitImport"
            :loading="(store as any).isImporting"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteDialog" persistent>
      <q-card class="dialog-card popup-card" style="width: 420px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none q-pt-lg q-px-lg">
          <div class="row items-center">
            <div class="icon-box bg-icon-negative text-negative q-mr-sm">
              <q-icon name="delete_outline" size="18px" />
            </div>
            <div class="text-subtitle1 text-weight-bolder text-negative">Delete Trade</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pa-lg q-pt-md">
          <div class="text-body2 text-main q-mb-xs">
            Are you sure you want to delete the trade record for
            <span class="text-weight-bolder">{{ tradeToDelete?.pair }}</span
            >?
          </div>
          <div class="text-caption text-muted q-mt-sm">This action cannot be undone.</div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-lg q-pt-sm">
          <q-btn flat label="Cancel" v-close-popup class="btn-ghost-modern text-weight-medium" />
          <q-btn
            unelevated
            label="Delete"
            icon="delete_outline"
            class="btn-danger-modern text-white text-weight-bold"
            @click="submitDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
/* ==========================================================
   CSS Variables (Matched with Dashboard)
========================================================== */
.journal-page {
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
  --bg-icon-warning: #fffbeb;
  --bg-icon-negative: #fef2f2;
  --bg-icon-purple: #faf5ff;

  /* Dialog */
  --bg-dialog: #ffffff;
  --border-dialog: #e2e8f0;

  /* Trade Tags */
  --tag-strategy-bg: #eff6ff;
  --tag-strategy-color: #2563eb;
  --tag-strategy-border: #bfdbfe;
  --tag-trend-bg: #f0fdf4;
  --tag-trend-color: #16a34a;
  --tag-trend-border: #bbf7d0;
  --tag-emotion-bg: #fffbeb;
  --tag-emotion-color: #d97706;
  --tag-emotion-border: #fde68a;
  --tag-reason-bg: #fdf4ff;
  --tag-reason-color: #9333ea;
  --tag-reason-border: #e9d5ff;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  transition: all 0.3s ease;
}

.body--dark .journal-page {
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
  --bg-icon-warning: rgba(245, 158, 11, 0.15);
  --bg-icon-negative: rgba(239, 68, 68, 0.15);
  --bg-icon-purple: rgba(168, 85, 247, 0.15);

  /* Dialog dark */
  --bg-dialog: #1a2540;
  --border-dialog: #2a3a58;

  /* Trade Tags dark */
  --tag-strategy-bg: rgba(37, 99, 235, 0.15);
  --tag-strategy-color: #93c5fd;
  --tag-strategy-border: rgba(37, 99, 235, 0.3);
  --tag-trend-bg: rgba(22, 163, 74, 0.15);
  --tag-trend-color: #86efac;
  --tag-trend-border: rgba(22, 163, 74, 0.3);
  --tag-emotion-bg: rgba(217, 119, 6, 0.15);
  --tag-emotion-color: #fcd34d;
  --tag-emotion-border: rgba(217, 119, 6, 0.3);
  --tag-reason-bg: rgba(147, 51, 234, 0.15);
  --tag-reason-color: #d8b4fe;
  --tag-reason-border: rgba(147, 51, 234, 0.3);
}

/* ==========================================================
   Typography & Utilities
========================================================== */
.text-main {
  color: var(--text-main);
}
.text-muted {
  color: var(--text-muted);
}
.bg-card {
  background: var(--bg-card);
}
.bg-card-soft {
  background: var(--bg-card-soft);
}
.tracking-tight {
  letter-spacing: -0.02em;
}
.tracking-wide {
  letter-spacing: 0.05em;
}
.h-full {
  height: 100%;
}

/* ==========================================================
   Cards & Layouts
========================================================== */
.dashboard-card {
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

/* Dialog card — solid background, never transparent */
.dialog-card {
  background: var(--bg-dialog) !important;
  border-radius: 20px;
  box-shadow:
    0 24px 60px -10px rgba(0, 0, 0, 0.25),
    0 0 0 1px var(--border-dialog);
  border: 1px solid var(--border-dialog);
}

.popup-card {
  border-radius: 20px;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
}

.list-card {
  border-radius: 12px;
  margin-bottom: 4px;
}
.list-card:hover {
  border-color: var(--q-primary);
  box-shadow: var(--shadow-hover);
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
.bg-icon-warning {
  background-color: var(--bg-icon-warning);
}
.bg-icon-negative {
  background-color: var(--bg-icon-negative);
}
.bg-icon-purple {
  background-color: var(--bg-icon-purple);
}

.stat-val {
  font-size: 2.125rem;
  line-height: 2.5rem;
}
.header-divider {
  border-bottom: 1px solid var(--border-color);
}

/* ==========================================================
   Input / Select Border Radius
========================================================== */
.rounded-input :deep(.q-field__control) {
  border-radius: 10px !important;
  transition: all 0.3s ease;
}
.rounded-input :deep(.q-field__control:hover) {
  border-color: var(--q-primary);
}

/* ==========================================================
   Modern Buttons
========================================================== */

/* Primary — blue gradient */
.btn-primary-modern {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  border-radius: 10px;
  padding: 0 20px;
  height: 40px;
  font-size: 13px;
  letter-spacing: 0.01em;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
  transition: all 0.2s ease;
}
.btn-primary-modern:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.45) !important;
}
.btn-primary-modern:active {
  transform: translateY(0);
}

/* Success — green gradient */
.btn-success-modern {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 10px;
  padding: 0 20px;
  height: 40px;
  font-size: 13px;
  letter-spacing: 0.01em;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
  transition: all 0.2s ease;
}
.btn-success-modern:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.45) !important;
}
.btn-success-modern:active {
  transform: translateY(0);
}

/* Outline — for Manage Balance */
.btn-outline-modern {
  background: var(--bg-card);
  color: var(--text-main);
  border-radius: 10px;
  padding: 0 16px;
  height: 40px;
  font-size: 13px;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
}
.btn-outline-modern:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.15) !important;
  transform: translateY(-1px);
}
.btn-outline-modern:active {
  transform: translateY(0);
}

/* Ghost — Cancel */
.btn-ghost-modern {
  background: transparent;
  color: var(--text-muted);
  border-radius: 10px;
  padding: 0 16px;
  height: 38px;
  font-size: 13px;
  transition: all 0.2s ease;
}
.btn-ghost-modern:hover {
  background: var(--bg-card-soft);
  color: var(--text-main);
}

/* ==========================================================
   Trade Tags (replacing emoji badges)
========================================================== */
.trade-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
  text-transform: capitalize;
  white-space: nowrap;
  transition: opacity 0.2s;
}
.trade-tag--strategy {
  background: var(--tag-strategy-bg);
  color: var(--tag-strategy-color);
  border-color: var(--tag-strategy-border);
}
.trade-tag--trend {
  background: var(--tag-trend-bg);
  color: var(--tag-trend-color);
  border-color: var(--tag-trend-border);
}
.trade-tag--emotion {
  background: var(--tag-emotion-bg);
  color: var(--tag-emotion-color);
  border-color: var(--tag-emotion-border);
}
.trade-tag--reason {
  background: var(--tag-reason-bg);
  color: var(--tag-reason-color);
  border-color: var(--tag-reason-border);
}

/* Danger button for delete dialog */
.btn-danger-modern {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  border-radius: 10px;
  padding: 0 20px;
  height: 40px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
  transition: all 0.2s ease;
}
.btn-danger-modern:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.45) !important;
}

.btn-gradient-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.btn-gradient-positive {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

/* Chips */
.custom-chip {
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 10px;
}
.chip-buy {
  background-color: var(--bg-icon-positive);
  color: var(--q-positive);
}
.chip-sell {
  background-color: var(--bg-icon-negative);
  color: var(--q-negative);
}

/* Responsive */
@media (max-width: 599px) {
  .stat-val {
    font-size: 1.5rem;
    line-height: 1.75rem;
  }

  .trade-tags-wrap {
    flex-wrap: wrap;
  }

  .pnl-text {
    font-size: 1rem !important;
    line-height: 1.25rem !important;
  }

  .date-box {
    min-width: 44px !important;
  }
}
</style>

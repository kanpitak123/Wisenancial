<script setup lang="ts">
/**
 * Real, gated-beta "เชื่อมต่อด้วยรหัสผ่านนักลงทุน" option on BrokerConnectionsPage.vue —
 * see docs/mt5-investor-password-spike.md, "Beta graduation work". Only mounted by the
 * parent page after `mt5CloudConnectorService.betaStatus()` returns `{enabled: true}` —
 * this component does not check that itself.
 *
 * On-demand deploy lifecycle: the MetaApi account is only meant to be "deployed"
 * (billed hourly by MetaApi) while this view is actively open and polling. Polling
 * starts on mount/connect and stops on unmount — that stop is what lets the backend's
 * idle reaper undeploy the account a few minutes after the tab is closed or navigated
 * away from. See tradingjournal-backend/src/mt5-cloud-spike/deploy-idle.constants.ts.
 *
 * Never touches ConnectMt5Wizard.vue or the EA flow — this is a parallel option, not a
 * replacement.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { WsCard } from 'src/components/ui';
import {
  MT5_BROKER_PRESETS,
  MT5_CLOUD_CONNECTOR_CONSENT_TEXT_DRAFT,
  MT5_CLOUD_CONNECTOR_POLL_INTERVAL_MS,
} from 'src/constants/mt5-cloud-connector.constants';
import {
  getMt5CloudConnectorErrorMessage,
  mt5CloudConnectorService,
  type Mt5CloudAccountSnapshot,
  type Mt5CloudDeal,
  type Mt5CloudDeployLogEntry,
  type Mt5CloudPosition,
  type Mt5CloudRecord,
  type Mt5CloudStatus,
} from 'src/services/mt5-cloud-connector.service';

const $q = useQuasar();

const CONNECTING_POLL_MS = 5000;

// Form state
const selectedBroker = ref(MT5_BROKER_PRESETS[0]!.value);
const login = ref('');
const investorPassword = ref('');
const server = ref('');
const consentAccepted = ref(false);
const connecting = ref(false);
const connectError = ref<string | null>(null);

// Existing records (persist across idle-undeploy — no need to re-enter credentials)
const records = ref<Mt5CloudRecord[]>([]);
const loadingRecords = ref(false);

// Active session
const active = ref<string | null>(null);
const status = ref<Mt5CloudStatus | null>(null);
const account = ref<Mt5CloudAccountSnapshot | null>(null);
const positions = ref<Mt5CloudPosition[]>([]);
const deals = ref<Mt5CloudDeal[]>([]);
const dataError = ref<string | null>(null);
const loadingData = ref(false);
const waitingSince = ref<number | null>(null);

// Audit log (collapsible)
const showDeployLog = ref(false);
const deployLog = ref<Mt5CloudDeployLogEntry[]>([]);
const loadingDeployLog = ref(false);

let connectingPollHandle: ReturnType<typeof setInterval> | null = null;
let keepAlivePollHandle: ReturnType<typeof setInterval> | null = null;

function onBrokerChange() {
  const preset = MT5_BROKER_PRESETS.find((p) => p.value === selectedBroker.value);
  server.value = preset?.serverPattern ?? '';
}

function stopAllPolling() {
  if (connectingPollHandle) {
    clearInterval(connectingPollHandle);
    connectingPollHandle = null;
  }
  if (keepAlivePollHandle) {
    clearInterval(keepAlivePollHandle);
    keepAlivePollHandle = null;
  }
}

async function refreshRecords() {
  loadingRecords.value = true;
  try {
    records.value = await mt5CloudConnectorService.listRecords();
  } catch {
    // Non-fatal — the connect form still works even if listing existing records fails.
  } finally {
    loadingRecords.value = false;
  }
}

async function loadAccountData() {
  if (!active.value) return;

  loadingData.value = true;
  dataError.value = null;
  try {
    const [accountResult, positionsResult, dealsResult] = await Promise.all([
      mt5CloudConnectorService.getAccount(active.value),
      mt5CloudConnectorService.getPositions(active.value),
      mt5CloudConnectorService.getDeals(active.value, 30),
    ]);
    account.value = accountResult;
    positions.value = positionsResult;
    deals.value = dealsResult;
  } catch (error) {
    dataError.value = getMt5CloudConnectorErrorMessage(error);
  } finally {
    loadingData.value = false;
  }
}

function startKeepAlivePolling() {
  if (keepAlivePollHandle) return;
  keepAlivePollHandle = setInterval(() => void ensureSyncedAndLoaded('auto'), MT5_CLOUD_CONNECTOR_POLL_INTERVAL_MS);
}

async function pollWhileConnecting() {
  if (!active.value) return;

  try {
    const result = await mt5CloudConnectorService.getStatus(active.value);
    status.value = result;

    if (result.state === 'CONNECTED') {
      if (connectingPollHandle) {
        clearInterval(connectingPollHandle);
        connectingPollHandle = null;
      }
      await loadAccountData();
      startKeepAlivePolling();
    } else if (result.state === 'ERROR') {
      if (connectingPollHandle) {
        clearInterval(connectingPollHandle);
        connectingPollHandle = null;
      }
    }
  } catch (error) {
    dataError.value = getMt5CloudConnectorErrorMessage(error);
    if (connectingPollHandle) {
      clearInterval(connectingPollHandle);
      connectingPollHandle = null;
    }
  }
}

/** Ensures the account is deployed (redeploying on demand if it went idle), then loads
 * fresh data once connected. `trigger` is forwarded to the backend's deploy log. */
async function ensureSyncedAndLoaded(trigger: 'manual' | 'auto') {
  if (!active.value) return;

  try {
    const result = await mt5CloudConnectorService.sync(active.value, trigger);
    status.value = { state: result.state, checkedAt: new Date().toISOString() };

    if (result.state === 'CONNECTED') {
      await loadAccountData();
      return;
    }

    // Went idle/undeployed (or never came up) — switch to fast polling until it's back.
    if (keepAlivePollHandle) {
      clearInterval(keepAlivePollHandle);
      keepAlivePollHandle = null;
    }
    waitingSince.value = Date.now();
    if (!connectingPollHandle) {
      connectingPollHandle = setInterval(() => void pollWhileConnecting(), CONNECTING_POLL_MS);
    }
    await pollWhileConnecting();
  } catch (error) {
    dataError.value = getMt5CloudConnectorErrorMessage(error);
  }
}

/** Activates a record (fresh connect, or picking an existing one from the list) and
 * starts the polling that keeps it alive while this view stays open. */
async function activate(recordId: string, triggerSync: 'manual' | 'auto' | null) {
  stopAllPolling();
  active.value = recordId;
  status.value = null;
  account.value = null;
  positions.value = [];
  deals.value = [];
  dataError.value = null;
  showDeployLog.value = false;

  if (triggerSync) {
    await ensureSyncedAndLoaded(triggerSync);
    return;
  }

  // Fresh connect() already fired deploy() on the backend — just watch it come up.
  waitingSince.value = Date.now();
  connectingPollHandle = setInterval(() => void pollWhileConnecting(), CONNECTING_POLL_MS);
  await pollWhileConnecting();
}

async function submitConnect() {
  if (!login.value || !investorPassword.value || !server.value || !consentAccepted.value) return;

  connectError.value = null;
  connecting.value = true;
  try {
    const handle = await mt5CloudConnectorService.connect(
      login.value,
      investorPassword.value,
      server.value,
      consentAccepted.value,
    );
    login.value = '';
    investorPassword.value = '';
    void refreshRecords();
    await activate(handle.ref, null);
  } catch (error) {
    connectError.value = getMt5CloudConnectorErrorMessage(error);
  } finally {
    connecting.value = false;
  }
}

function viewRecord(record: Mt5CloudRecord) {
  void activate(record.id, 'auto');
}

async function manualRefresh() {
  await ensureSyncedAndLoaded('manual');
}

async function disconnectActive() {
  if (!active.value) return;

  try {
    await mt5CloudConnectorService.disconnect(active.value);
    $q.notify({ type: 'positive', message: 'ยกเลิกการเชื่อมต่อแล้ว', position: 'top' });
  } catch (error) {
    $q.notify({ type: 'negative', message: getMt5CloudConnectorErrorMessage(error), position: 'top' });
  } finally {
    stopAllPolling();
    active.value = null;
    status.value = null;
    account.value = null;
    positions.value = [];
    deals.value = [];
    void refreshRecords();
  }
}

async function toggleDeployLog() {
  showDeployLog.value = !showDeployLog.value;
  if (!showDeployLog.value || !active.value) return;

  loadingDeployLog.value = true;
  try {
    const all = await mt5CloudConnectorService.listDeployLog();
    deployLog.value = all.filter((entry) => entry.recordId === active.value).slice(0, 20);
  } catch {
    deployLog.value = [];
  } finally {
    loadingDeployLog.value = false;
  }
}

function statusColor(state: string | undefined) {
  switch (state) {
    case 'CONNECTED':
      return 'positive';
    case 'CONNECTING':
      return 'warning';
    case 'ERROR':
      return 'negative';
    default:
      return 'grey';
  }
}

function fmt(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : value.toFixed(2);
}

function waitingSeconds() {
  return waitingSince.value ? Math.floor((Date.now() - waitingSince.value) / 1000) : 0;
}

onMounted(async () => {
  onBrokerChange();
  await refreshRecords();

  // Only one record realistically expected for a single beta user — auto-open it so
  // "opening the page again" is itself what redeploys on demand, per spec.
  if (records.value.length === 1 && records.value[0]) {
    await activate(records.value[0].id, 'auto');
  }
});

onBeforeUnmount(() => {
  // This is the actual mechanism behind "closed/navigated away -> idle-undeploy": once
  // polling stops, the backend's lastActivityAt goes stale and the idle reaper takes it
  // from there. No explicit "page closed" signal needed or sent.
  stopAllPolling();
});
</script>

<template>
  <WsCard tone="solid" class="cloud-connector-card">
    <h2 class="section-title">เชื่อมต่อด้วยรหัสผ่านนักลงทุน (ไม่ต้องติดตั้ง EA)</h2>
    <q-banner class="bg-orange-1 text-orange-10 q-mb-md" rounded dense>
      ฟีเจอร์เบต้าแบบจำกัดสิทธิ์ — เห็นเฉพาะบัญชีที่เปิดให้ทดสอบ ยังไม่เปิดใช้งานทั่วไป
      บัญชี MetaApi จะถูก deploy เฉพาะตอนที่หน้านี้เปิดอยู่/มีการ refresh เท่านั้น เพื่อคุมค่าใช้จ่าย
    </q-banner>

    <div v-if="loadingRecords" class="row justify-center q-my-md">
      <q-spinner color="primary" size="28px" />
    </div>

    <template v-else>
      <div v-if="records.length && !active" class="existing-records q-mb-md">
        <div class="text-subtitle2 q-mb-sm">การเชื่อมต่อที่มีอยู่</div>
        <q-list dense bordered separator class="rounded-borders">
          <q-item v-for="record in records" :key="record.id" clickable @click="viewRecord(record)">
            <q-item-section>
              <q-item-label>{{ record.login }} @ {{ record.server }}</q-item-label>
              <q-item-label caption>
                {{ record.deployState === 'DEPLOYED' ? 'กำลัง deploy อยู่' : 'idle (ยังไม่ deploy)' }}
                · เชื่อมต่อล่าสุด {{ record.connectedAt ? new Date(record.connectedAt).toLocaleString('th-TH') : 'ยังไม่เคย' }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <div v-if="!active" class="connect-form">
        <q-select
          v-model="selectedBroker"
          :options="MT5_BROKER_PRESETS"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          label="โบรกเกอร์ (ใช้เดาชื่อ server เริ่มต้นเท่านั้น)"
          outlined
          dense
          class="q-mb-sm"
          data-test="broker-preset-select"
          @update:model-value="onBrokerChange"
        />
        <q-input v-model="login" label="MT5 login (เลขบัญชี)" outlined dense class="q-mb-sm" data-test="cloud-login" />
        <q-input
          v-model="investorPassword"
          label="Investor password"
          type="password"
          outlined
          dense
          class="q-mb-sm"
          data-test="cloud-investor-password"
        />
        <q-input
          v-model="server"
          label="Server (แก้ไขได้เสมอ — ชื่อ server จริงต่างกันไปตามบัญชี)"
          outlined
          dense
          class="q-mb-md"
          data-test="cloud-server"
        />

        <q-banner class="bg-grey-2 q-mb-sm consent-banner" rounded dense>
          <div class="row items-start no-wrap">
            <q-checkbox v-model="consentAccepted" dense data-test="consent-checkbox" />
            <div class="q-ml-sm consent-text">
              <q-badge color="orange" outline class="q-mb-xs">ฉบับร่าง — รอทีมกฎหมายอนุมัติ (DRAFT)</q-badge>
              <div>{{ MT5_CLOUD_CONNECTOR_CONSENT_TEXT_DRAFT }}</div>
            </div>
          </div>
        </q-banner>

        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="add_link"
          label="เชื่อมต่อผ่าน MetaApi"
          :loading="connecting"
          :disable="!login || !investorPassword || !server || !consentAccepted"
          data-test="cloud-connect-btn"
          @click="submitConnect"
        />

        <q-banner v-if="connectError" class="bg-negative text-white q-mt-sm" rounded dense>
          {{ connectError }}
        </q-banner>
      </div>

      <div v-else class="active-session">
        <div class="row items-center justify-between q-mb-sm">
          <div>
            <q-badge :color="statusColor(status?.state)">{{ status?.state ?? 'unknown' }}</q-badge>
            <span v-if="status?.state === 'CONNECTING'" class="q-ml-sm text-caption text-grey">
              กำลังเชื่อมต่อ… (อาจใช้เวลาถึง ~1 นาทีสำหรับการ deploy ครั้งแรกหรือหลัง idle) ·
              {{ waitingSeconds() }}s
            </span>
          </div>
          <div>
            <q-btn flat dense icon="refresh" :loading="loadingData" label="รีเฟรช" @click="manualRefresh" />
            <q-btn flat dense icon="history" label="Deploy log" @click="toggleDeployLog" />
            <q-btn flat dense color="negative" icon="link_off" label="ยกเลิกการเชื่อมต่อ" @click="disconnectActive" />
          </div>
        </div>

        <q-linear-progress v-if="status?.state === 'CONNECTING'" indeterminate color="warning" class="q-mb-sm" />
        <q-banner v-if="dataError" class="bg-negative text-white q-mb-sm" rounded dense>{{ dataError }}</q-banner>

        <div v-if="showDeployLog" class="deploy-log q-mb-sm">
          <div v-if="loadingDeployLog" class="row justify-center q-my-sm"><q-spinner size="20px" /></div>
          <q-list v-else-if="deployLog.length" dense bordered separator class="rounded-borders">
            <q-item v-for="entry in deployLog" :key="entry.id">
              <q-item-section>
                <q-item-label>
                  {{ entry.transition }} · {{ entry.reason }}
                </q-item-label>
                <q-item-label caption>{{ new Date(entry.at).toLocaleString('th-TH') }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-grey q-my-sm">ยังไม่มี deploy log สำหรับการเชื่อมต่อนี้</div>
        </div>

        <div v-if="account" class="account-grid q-mb-md">
          <div><div class="text-caption text-grey">Balance</div>{{ fmt(account.balance) }}</div>
          <div><div class="text-caption text-grey">Equity</div>{{ fmt(account.equity) }}</div>
          <div><div class="text-caption text-grey">Margin</div>{{ fmt(account.margin) }}</div>
          <div><div class="text-caption text-grey">Free margin</div>{{ fmt(account.freeMargin) }}</div>
          <div><div class="text-caption text-grey">Margin level</div>{{ fmt(account.marginLevel) }}</div>
          <div><div class="text-caption text-grey">Leverage</div>{{ fmt(account.leverage) }}</div>
        </div>

        <div v-if="positions.length" class="q-mb-md">
          <div class="text-subtitle2 q-mb-sm">Open positions ({{ positions.length }})</div>
          <q-markup-table dense flat>
            <thead>
              <tr>
                <th class="text-left">Symbol</th>
                <th class="text-left">Dir</th>
                <th class="text-right">Volume</th>
                <th class="text-right">Open</th>
                <th class="text-right">Current</th>
                <th class="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in positions" :key="p.ticket">
                <td>{{ p.symbol }}</td>
                <td>{{ p.direction }}</td>
                <td class="text-right">{{ p.volume }}</td>
                <td class="text-right">{{ fmt(p.openPrice) }}</td>
                <td class="text-right">{{ fmt(p.currentPrice) }}</td>
                <td class="text-right">{{ fmt(p.profit) }}</td>
              </tr>
            </tbody>
          </q-markup-table>
        </div>

        <div v-if="deals.length">
          <div class="text-subtitle2 q-mb-sm">Recent deals ({{ deals.length }}, 30 วันล่าสุด)</div>
          <q-markup-table dense flat>
            <thead>
              <tr>
                <th class="text-left">Symbol</th>
                <th class="text-right">Volume</th>
                <th class="text-right">Price</th>
                <th class="text-right">Profit</th>
                <th class="text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in deals" :key="d.ticket">
                <td>{{ d.symbol ?? '—' }}</td>
                <td class="text-right">{{ d.volume ?? '—' }}</td>
                <td class="text-right">{{ fmt(d.price) }}</td>
                <td class="text-right">{{ fmt(d.profit) }}</td>
                <td>{{ new Date(d.executedAt).toLocaleString('th-TH') }}</td>
              </tr>
            </tbody>
          </q-markup-table>
        </div>
      </div>
    </template>
  </WsCard>
</template>

<style scoped>
.cloud-connector-card {
  margin-bottom: 24px;
}

.section-title {
  margin: 0 0 14px;
  font-size: 1.1rem;
  font-weight: 800;
}

.connect-form {
  max-width: 480px;
}

.consent-banner {
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.consent-text {
  font-size: 0.85rem;
  line-height: 1.5;
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .account-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

<script setup lang="ts">
/**
 * Dev-only page for the MT5 investor-password / managed-connector spike — see
 * docs/mt5-investor-password-spike.md. NOT linked from any nav, NOT part of the real
 * "Sync MT5" flow (ConnectMt5Wizard.vue is untouched). Backend route 404s unless
 * MT5_CLOUD_SPIKE_ENABLED=true, so every call here can fail with a plain 404 until that
 * flag is set locally.
 *
 * Purpose is to compare two MT5Connector implementations side by side: EA (read-only
 * wrapper over the already-shipped push connector) vs CLOUD (MetaApi.cloud, investor
 * password). No PDPA consent UI here on purpose — this never touches a real user's
 * real credential, only whatever demo account someone types in.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  getMt5SpikeErrorMessage,
  mt5CloudSpikeService,
  type Mt5SpikeAccountSnapshot,
  type Mt5SpikeCloudRecord,
  type Mt5SpikeConnectorKind,
  type Mt5SpikeDeal,
  type Mt5SpikeEaConnection,
  type Mt5SpikePosition,
  type Mt5SpikeStatus,
} from 'src/services/mt5-cloud-spike.service';

const $q = useQuasar();
const isProd = import.meta.env.PROD;

const POLL_INTERVAL_MS = 5000;

const sourceTab = ref<Mt5SpikeConnectorKind>('CLOUD');

// EA tab state
const eaConnections = ref<Mt5SpikeEaConnection[]>([]);
const selectedEaConnectionId = ref<number | null>(null);
const loadingEaList = ref(false);

// Cloud tab state
const cloudLogin = ref('');
const cloudInvestorPassword = ref('');
const cloudServer = ref('');
const cloudRecords = ref<Mt5SpikeCloudRecord[]>([]);
const loadingCloudRecords = ref(false);

// Active session (whichever connector the user last connected)
const active = ref<{ kind: Mt5SpikeConnectorKind; ref: string } | null>(null);
const connecting = ref(false);
const connectError = ref<string | null>(null);
const connectStartedAt = ref<number | null>(null);
const connectedAfterMs = ref<number | null>(null);

const status = ref<Mt5SpikeStatus | null>(null);
const account = ref<Mt5SpikeAccountSnapshot | null>(null);
const positions = ref<Mt5SpikePosition[]>([]);
const deals = ref<Mt5SpikeDeal[]>([]);
const dataError = ref<string | null>(null);
const loadingData = ref(false);

let pollHandle: ReturnType<typeof setInterval> | null = null;

const isConnecting = computed(() => status.value?.state === 'CONNECTING');

onMounted(() => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  $q.dark.set(isDark);
  void refreshLists();
});

onBeforeUnmount(() => stopPolling());

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

async function refreshLists() {
  loadingEaList.value = true;
  loadingCloudRecords.value = true;
  try {
    const [ea, cloud] = await Promise.all([
      mt5CloudSpikeService.listEaConnections(),
      mt5CloudSpikeService.listCloudRecords(),
    ]);
    eaConnections.value = ea;
    cloudRecords.value = cloud;
  } catch (error) {
    $q.notify({ type: 'negative', message: getMt5SpikeErrorMessage(error, 'โหลดรายการไม่สำเร็จ') });
  } finally {
    loadingEaList.value = false;
    loadingCloudRecords.value = false;
  }
}

async function connectEa() {
  if (!selectedEaConnectionId.value) return;

  connectError.value = null;
  connecting.value = true;
  try {
    const handle = await mt5CloudSpikeService.connectEa(selectedEaConnectionId.value);
    await onConnected(handle);
  } catch (error) {
    connectError.value = getMt5SpikeErrorMessage(error);
  } finally {
    connecting.value = false;
  }
}

async function connectCloud() {
  if (!cloudLogin.value || !cloudInvestorPassword.value || !cloudServer.value) return;

  connectError.value = null;
  connecting.value = true;
  connectStartedAt.value = Date.now();
  connectedAfterMs.value = null;
  try {
    const handle = await mt5CloudSpikeService.connectCloud(
      cloudLogin.value,
      cloudInvestorPassword.value,
      cloudServer.value,
    );
    await onConnected(handle);
    void refreshLists();
  } catch (error) {
    connectError.value = getMt5SpikeErrorMessage(error);
  } finally {
    connecting.value = false;
  }
}

async function onConnected(handle: { kind: Mt5SpikeConnectorKind; ref: string }) {
  active.value = handle;
  status.value = null;
  account.value = null;
  positions.value = [];
  deals.value = [];
  dataError.value = null;

  await pollStatus();
  stopPolling();
  pollHandle = setInterval(() => void pollStatus(), POLL_INTERVAL_MS);
}

async function pollStatus() {
  if (!active.value) return;

  try {
    const result = await mt5CloudSpikeService.getStatus(active.value.kind, active.value.ref);
    status.value = result;

    if (result.state === 'CONNECTED') {
      stopPolling();
      if (connectStartedAt.value && connectedAfterMs.value === null) {
        connectedAfterMs.value = Date.now() - connectStartedAt.value;
      }
      void loadAll();
    } else if (result.state === 'ERROR') {
      stopPolling();
    }
  } catch (error) {
    status.value = { state: 'ERROR', message: getMt5SpikeErrorMessage(error), checkedAt: new Date().toISOString() };
    stopPolling();
  }
}

async function loadAll() {
  if (!active.value) return;

  dataError.value = null;
  loadingData.value = true;
  try {
    const [accountResult, positionsResult, dealsResult] = await Promise.all([
      mt5CloudSpikeService.getAccount(active.value.kind, active.value.ref),
      mt5CloudSpikeService.getPositions(active.value.kind, active.value.ref),
      mt5CloudSpikeService.getDeals(active.value.kind, active.value.ref, 30),
    ]);
    account.value = accountResult;
    positions.value = positionsResult;
    deals.value = dealsResult;
  } catch (error) {
    dataError.value = getMt5SpikeErrorMessage(error);
  } finally {
    loadingData.value = false;
  }
}

async function disconnectActive() {
  if (!active.value) return;

  try {
    await mt5CloudSpikeService.disconnect(active.value.kind, active.value.ref);
    $q.notify({ type: 'positive', message: 'Revoked' });
  } catch (error) {
    $q.notify({ type: 'negative', message: getMt5SpikeErrorMessage(error) });
  } finally {
    stopPolling();
    active.value = null;
    status.value = null;
    account.value = null;
    positions.value = [];
    deals.value = [];
    void refreshLists();
  }
}

async function revokeCloudRecord(id: string) {
  try {
    await mt5CloudSpikeService.disconnect('CLOUD', id);
    $q.notify({ type: 'positive', message: 'Revoked' });
    if (active.value?.kind === 'CLOUD' && active.value.ref === id) {
      stopPolling();
      active.value = null;
    }
    void refreshLists();
  } catch (error) {
    $q.notify({ type: 'negative', message: getMt5SpikeErrorMessage(error) });
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
</script>

<template>
  <q-page v-if="!isProd" class="q-pa-lg">
    <div class="q-mb-lg">
      <div class="text-overline text-grey">DEV ONLY — /dev/mt5-cloud-spike — not linked from any nav</div>
      <h1 class="text-h5 q-my-xs">MT5 Cloud Connector — Technical Spike</h1>
      <q-banner class="bg-orange-1 text-orange-10 q-mt-sm" rounded>
        Test against a free MT5 <strong>demo account</strong> only. This page proves out the
        MT5Connector/EAConnector/CloudConnector abstraction — it is not wired into the real "Sync MT5" wizard and has
        no PDPA consent flow. See docs/mt5-investor-password-spike.md.
      </q-banner>
    </div>

    <div class="row q-col-gutter-lg">
      <div class="col-12 col-md-5">
        <q-card flat bordered>
          <q-tabs v-model="sourceTab" dense class="text-grey" active-color="primary" indicator-color="primary">
            <q-tab name="CLOUD" label="Cloud (investor password)" />
            <q-tab name="EA" label="EA (existing connection)" />
          </q-tabs>
          <q-separator />
          <q-card-section v-if="sourceTab === 'CLOUD'">
            <q-input v-model="cloudLogin" label="MT5 login (account number)" dense outlined class="q-mb-sm" />
            <q-input
              v-model="cloudInvestorPassword"
              label="Investor password"
              type="password"
              dense
              outlined
              class="q-mb-sm"
            />
            <q-input v-model="cloudServer" label="Server (e.g. Broker-Demo)" dense outlined class="q-mb-md" />
            <q-btn
              color="primary"
              label="Connect via MetaApi"
              :loading="connecting"
              :disable="!cloudLogin || !cloudInvestorPassword || !cloudServer"
              @click="connectCloud"
            />
          </q-card-section>

          <q-card-section v-else>
            <q-select
              v-model="selectedEaConnectionId"
              :options="eaConnections.map((c) => ({ label: `#${c.id} — ${c.broker_server ?? 'unknown server'} (${c.status})`, value: c.id }))"
              emit-value
              map-options
              label="Existing MT5 (EA) connection"
              dense
              outlined
              :loading="loadingEaList"
              class="q-mb-md"
            />
            <q-btn
              color="primary"
              label="Load via EA"
              :loading="connecting"
              :disable="!selectedEaConnectionId"
              @click="connectEa"
            />
            <div class="text-caption text-grey q-mt-sm">
              Read-only — reads whatever the real EA wizard already synced. Set up EA connections at
              /BrokerConnections first.
            </div>
          </q-card-section>

          <q-banner v-if="connectError" class="bg-negative text-white q-ma-md" rounded>{{ connectError }}</q-banner>
        </q-card>

        <q-card v-if="cloudRecords.length" flat bordered class="q-mt-md">
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Stored cloud spike credentials</div>
            <q-list dense separator>
              <q-item v-for="record in cloudRecords" :key="record.id">
                <q-item-section>
                  <q-item-label>{{ record.login }} @ {{ record.server }}</q-item-label>
                  <q-item-label caption>
                    {{ record.metaApiAccountId ? 'MetaApi id: ' + record.metaApiAccountId : 'provisioning…' }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn flat dense color="negative" label="Revoke" @click="revokeCloudRecord(record.id)" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-7">
        <q-card v-if="active" flat bordered>
          <q-card-section class="row items-center justify-between">
            <div>
              <q-badge :color="statusColor(status?.state)">{{ status?.state ?? 'unknown' }}</q-badge>
              <span class="q-ml-sm text-caption text-grey">{{ active.kind }} · ref {{ active.ref }}</span>
            </div>
            <div>
              <span v-if="connectedAfterMs !== null" class="text-caption text-grey q-mr-sm">
                online after {{ (connectedAfterMs / 1000).toFixed(1) }}s
              </span>
              <q-btn flat dense icon="refresh" :loading="loadingData" @click="loadAll" />
              <q-btn flat dense color="negative" label="Disconnect" @click="disconnectActive" />
            </div>
          </q-card-section>

          <q-banner v-if="status?.message" class="bg-grey-2 q-mx-md" rounded dense>{{ status.message }}</q-banner>
          <q-banner v-if="dataError" class="bg-negative text-white q-mx-md q-mt-sm" rounded>{{ dataError }}</q-banner>

          <q-linear-progress v-if="isConnecting" indeterminate color="warning" class="q-mt-sm" />

          <q-card-section v-if="account">
            <div class="text-subtitle2 q-mb-sm">Account</div>
            <div class="row q-col-gutter-md">
              <div class="col-4"><div class="text-caption text-grey">Balance</div>{{ fmt(account.balance) }}</div>
              <div class="col-4"><div class="text-caption text-grey">Equity</div>{{ fmt(account.equity) }}</div>
              <div class="col-4"><div class="text-caption text-grey">Margin</div>{{ fmt(account.margin) }}</div>
              <div class="col-4">
                <div class="text-caption text-grey">Free margin</div>
                {{ fmt(account.freeMargin) }}
              </div>
              <div class="col-4">
                <div class="text-caption text-grey">Margin level</div>
                {{ fmt(account.marginLevel) }}
              </div>
              <div class="col-4"><div class="text-caption text-grey">Leverage</div>{{ fmt(account.leverage) }}</div>
            </div>
          </q-card-section>

          <q-separator v-if="positions.length" />
          <q-card-section v-if="positions.length">
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
          </q-card-section>

          <q-separator v-if="deals.length" />
          <q-card-section v-if="deals.length">
            <div class="text-subtitle2 q-mb-sm">Recent deals ({{ deals.length }}, last 30 days)</div>
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
                  <td>{{ new Date(d.executedAt).toLocaleString() }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
        </q-card>

        <div v-else class="text-grey text-center q-pa-xl">Connect a source on the left to see live data here.</div>
      </div>
    </div>
  </q-page>

  <q-page v-else class="flex flex-center">
    <div class="text-h6">Not available in production build.</div>
  </q-page>
</template>

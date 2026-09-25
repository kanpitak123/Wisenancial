<script setup lang="ts">
/**
 * Broker Connections — จัดการ MT5 (และ broker อื่นในอนาคต) connection ของผู้ใช้เอง
 * ผ่าน BrokerConnectionsController ที่มีอยู่แล้วตั้งแต่ Phase 2 (create/list/revoke/
 * rotate-key/delete) แต่ยังไม่เคยมี frontend เรียกใช้เลยจนถึงตอนนี้ — ก่อนหน้านี้ผู้ใช้
 * ไม่มีทางได้ API key มาใส่ EA (mt5-ea/) นอกจากยิง API ตรงๆ เอง
 *
 * API key เป็นความลับที่ backend คืนให้เห็น "ครั้งเดียว" ตอน create()/rotateKey() —
 * เก็บไว้ใน BrokerConnectionStore.revealedApiKey (in-memory ล้วนๆ ไม่ persist) แล้วแสดง
 * ในแบนเนอร์ที่ผู้ใช้ต้องกดยืนยันว่าคัดลอกแล้วถึงจะปิดได้ ไม่มีทางเรียกดูซ้ำอีกเลย
 * (ตรงกับพฤติกรรมฝั่ง backend เป๊ะ — ไม่มี endpoint ไหนคืน plaintext key ซ้ำสอง)
 *
 * ต่อ WebSocket (mt5_sync_update จาก BrokerSyncGateway, Phase 3L) เพื่อ refetch รายการ
 * อัตโนมัติเมื่อ EA sync จริงเข้ามา — ตามแพทเทิร์นเดียวกับ ChatPage.vue/NewsStore
 * (connect ตอน mount, disconnect ตอน unmount) ไม่ได้ merge payload ของ event เข้า state
 * เอง เพราะ event ไม่มีข้อมูล trade/position อยู่แล้วโดยตั้งใจ — ดู
 * BrokerConnectionStore.handleSyncUpdate()
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute } from 'vue-router';
import { WsCard } from 'src/components/ui';
import Mt5CloudConnectorCard from 'src/components/broker/Mt5CloudConnectorCard.vue';
import { useBrokerConnectionStore } from 'stores/BrokerConnectionStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import {
  BROKER_CONNECTIONS_PORTFOLIO_QUERY_PARAM,
  BROKER_STATUS_COLOR,
  BROKER_STATUS_LABEL_TH,
  BROKER_TYPE_OPTIONS,
} from 'src/constants/broker-connection.constants';
import { mt5CloudConnectorService } from 'src/services/mt5-cloud-connector.service';
import type { BrokerConnection, BrokerType } from 'src/types/broker-connection.types';

const $q = useQuasar();
const route = useRoute();
const store = useBrokerConnectionStore();
const portfolioStore = usePortfolioStore();

// Gated beta — see docs/mt5-investor-password-spike.md, "Beta graduation work". Only
// renders Mt5CloudConnectorCard for the allowlisted account; a plain 404 (treated the
// same as "disabled" here) for everyone else keeps it undiscoverable.
const cloudConnectorBetaEnabled = ref(false);

const selectedBrokerType = ref<BrokerType>('MT5');
const selectedPortfolioId = ref<number | null>(null);

// PortfolioPage.vue's broker badge navigates here with ?portfolio_id=<id> — either to
// pre-fill the create form (portfolio not connected yet) or to scroll straight to the
// existing connection (already connected). ทั้งสองกรณีตัดสินหลังข้อมูลโหลดเสร็จเท่านั้น
// (ไม่งั้นจะยังไม่รู้ว่า portfolio นี้มี connection อยู่แล้วหรือเปล่า)
function queryPortfolioId(): number | null {
  const raw = route.query[BROKER_CONNECTIONS_PORTFOLIO_QUERY_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);

  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const connectionRefs = new Map<number, HTMLElement>();
function setConnectionRef(id: number, el: unknown) {
  if (el instanceof HTMLElement) {
    connectionRefs.set(id, el);
  } else {
    connectionRefs.delete(id);
  }
}

const portfolioOptions = computed(() => [
  { label: 'ยังไม่ผูก Portfolio (ผูกทีหลังได้)', value: null },
  ...portfolioStore.traderPortfolios.map((p) => ({ label: p.name, value: p.id })),
]);

const brokerTypeOptions = computed(() =>
  BROKER_TYPE_OPTIONS.map((opt) => ({
    ...opt,
    label: opt.available ? opt.label : `${opt.label} (${opt.unavailableReason})`,
    disable: !opt.available,
  })),
);

function statusColor(status: string): string {
  return BROKER_STATUS_COLOR[status] ?? 'grey-7';
}

function statusLabel(status: string): string {
  return BROKER_STATUS_LABEL_TH[status] ?? status;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'ยังไม่เคย';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function portfolioName(connection: BrokerConnection): string {
  if (connection.portfolio_id === null) return 'ยังไม่ผูก Portfolio';
  const found = portfolioStore.portfolios.find((p) => p.id === connection.portfolio_id);
  return found ? found.name : `Portfolio #${connection.portfolio_id}`;
}

async function copyApiKey() {
  const key = store.revealedApiKey;
  if (!key) return;

  try {
    await navigator.clipboard.writeText(key);
    $q.notify({ type: 'positive', message: 'คัดลอก API key แล้ว', position: 'top', timeout: 2500 });
  } catch {
    $q.notify({
      type: 'warning',
      message: 'คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกด้วยตัวเอง',
      position: 'top',
      timeout: 3500,
    });
  }
}

function dismissRevealedKey() {
  store.clearRevealedKey();
}

async function handleCreate() {
  try {
    await store.createConnection(selectedBrokerType.value, selectedPortfolioId.value ?? undefined);
    selectedPortfolioId.value = null;
  } catch {
    $q.notify({
      type: 'negative',
      message: store.error ?? 'สร้าง connection ไม่สำเร็จ',
      position: 'top',
      timeout: 4000,
    });
  }
}

function confirmRevoke(connection: BrokerConnection) {
  $q.dialog({
    title: 'Revoke connection นี้?',
    message: `API key ปัจจุบันของ ${connection.broker_type} จะใช้งานไม่ได้ทันที — EA ที่ต่ออยู่จะเริ่ม sync ไม่ได้จนกว่าจะออก key ใหม่`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void store.revokeConnection(connection.id).catch(() => {
      $q.notify({
        type: 'negative',
        message: store.error ?? 'Revoke ไม่สำเร็จ',
        position: 'top',
        timeout: 4000,
      });
    });
  });
}

function confirmRotate(connection: BrokerConnection) {
  $q.dialog({
    title: 'ออก API key ใหม่?',
    message: 'Key เดิมจะใช้งานไม่ได้ทันที — ต้องเอา key ใหม่ไปตั้งใน EA ก่อนถึงจะ sync ต่อได้',
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void store.rotateKey(connection.id).catch(() => {
      $q.notify({
        type: 'negative',
        message: store.error ?? 'ออก key ใหม่ไม่สำเร็จ',
        position: 'top',
        timeout: 4000,
      });
    });
  });
}

function confirmDelete(connection: BrokerConnection) {
  $q.dialog({
    title: 'ลบ connection นี้?',
    message: 'ประวัติ connection จะถูกลบออกจากรายการนี้ (ไม้ที่ sync มาแล้วยังอยู่ครบ)',
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void store.removeConnection(connection.id).catch(() => {
      $q.notify({
        type: 'negative',
        message: store.error ?? 'ลบไม่สำเร็จ',
        position: 'top',
        timeout: 4000,
      });
    });
  });
}

onMounted(async () => {
  store.connectSocket();
  await Promise.all([
    store.loadConnections().catch(() => null),
    portfolioStore.loadPortfolios('TRADER').catch(() => null),
    mt5CloudConnectorService
      .betaStatus()
      .then((result) => {
        cloudConnectorBetaEnabled.value = result.enabled;
      })
      .catch(() => {
        cloudConnectorBetaEnabled.value = false;
      }),
  ]);

  const portfolioId = queryPortfolioId();
  if (portfolioId === null) return;

  const existing = store.connections.find(
    (c) => c.portfolio_id === portfolioId && c.status !== 'REVOKED',
  );

  if (existing) {
    await nextTick();
    connectionRefs.get(existing.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    selectedPortfolioId.value = portfolioId;
  }
});

onUnmounted(() => {
  store.disconnectSocket();
});
</script>

<template>
  <q-page class="broker-connections-page q-pa-md q-pa-sm-lg">
    <header class="page-header">
      <h1 class="page-title" data-test="broker-connections-title">Broker Connections</h1>
      <p class="page-subtitle">
        เชื่อมต่อบัญชีเทรดจริงเพื่อ sync ไม้/deal อัตโนมัติ — ดูวิธีติดตั้ง EA ที่
        <code>docs/mt5-ea-setup.md</code>
      </p>
    </header>

    <WsCard v-if="store.revealedApiKey" tone="solid" class="api-key-banner" data-test="api-key-banner">
      <div class="api-key-warning">
        <q-icon name="warning" color="amber" size="22px" />
        <div>
          <div class="text-weight-bolder">นี่คือครั้งเดียวที่จะเห็น API key นี้</div>
          <div class="text-body2">คัดลอกไปเก็บไว้ตอนนี้เลย — ปิดหน้าต่างนี้แล้วจะเรียกดูซ้ำไม่ได้อีก</div>
        </div>
      </div>
      <div class="api-key-value" data-test="api-key-value">{{ store.revealedApiKey }}</div>
      <div class="api-key-actions">
        <q-btn
          unelevated
          no-caps
          icon="content_copy"
          label="คัดลอก"
          color="primary"
          data-test="copy-api-key"
          @click="copyApiKey"
        />
        <q-btn
          flat
          no-caps
          label="คัดลอกแล้ว ปิดได้เลย"
          data-test="dismiss-api-key"
          @click="dismissRevealedKey"
        />
      </div>
    </WsCard>

    <WsCard tone="solid" class="create-card">
      <h2 class="section-title">เพิ่ม Connection ใหม่</h2>
      <div class="create-form">
        <q-select
          v-model="selectedBrokerType"
          :options="brokerTypeOptions"
          option-value="value"
          option-label="label"
          option-disable="disable"
          emit-value
          map-options
          label="แพลตฟอร์ม"
          outlined
          dense
          data-test="broker-type-select"
        />
        <q-select
          v-model="selectedPortfolioId"
          :options="portfolioOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          label="ผูกกับ Portfolio (ไม่บังคับตอนนี้)"
          outlined
          dense
          data-test="portfolio-select"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="add_link"
          label="สร้าง Connection"
          :loading="store.isSubmitting"
          data-test="create-connection-btn"
          @click="handleCreate"
        />
      </div>
    </WsCard>

    <Mt5CloudConnectorCard v-if="cloudConnectorBetaEnabled" data-test="cloud-connector-card" />

    <div v-if="store.isLoading" class="state-loading" data-test="connections-loading">
      <q-spinner color="primary" size="32px" />
    </div>

    <div v-else-if="!store.hasConnections" class="state-empty" data-test="connections-empty">
      <q-icon name="link_off" size="40px" class="q-mb-sm" />
      <div class="text-subtitle1 text-weight-bolder">ยังไม่มี broker connection</div>
      <div class="text-body2 q-mt-xs">สร้าง connection ด้วยฟอร์มด้านบนเพื่อเริ่มต้น</div>
    </div>

    <div v-else class="connections-list" data-test="connections-list">
      <div
        v-for="connection in store.connections"
        :key="connection.id"
        :ref="(el) => setConnectionRef(connection.id, el)"
      >
      <WsCard
        class="connection-card"
        :data-test="`connection-${connection.id}`"
      >
        <div class="connection-header">
          <div class="connection-title">
            <span class="connection-broker">{{ connection.broker_type }}</span>
            <q-badge :color="statusColor(connection.status)" :label="statusLabel(connection.status)" />
          </div>
          <div class="connection-portfolio" data-test="connection-portfolio">
            {{ portfolioName(connection) }}
          </div>
        </div>

        <div class="connection-meta">
          <div v-if="connection.external_account_id">
            บัญชี: {{ connection.external_account_id }}
            <span v-if="connection.broker_server">@ {{ connection.broker_server }}</span>
          </div>
          <div v-else class="text-grey-6">ยังไม่มี EA ยืนยันตัวตนบัญชีเข้ามา</div>
          <div>Heartbeat ล่าสุด: {{ formatDateTime(connection.last_heartbeat_at) }}</div>
          <div>Sync ล่าสุด: {{ formatDateTime(connection.last_sync_at) }}</div>
        </div>

        <div class="connection-actions">
          <q-btn
            flat
            no-caps
            dense
            icon="autorenew"
            label="ออก Key ใหม่"
            :disable="connection.status === 'REVOKED'"
            data-test="rotate-key-btn"
            @click="confirmRotate(connection)"
          />
          <q-btn
            flat
            no-caps
            dense
            color="negative"
            icon="block"
            label="Revoke"
            :disable="connection.status === 'REVOKED'"
            data-test="revoke-btn"
            @click="confirmRevoke(connection)"
          />
          <q-btn
            flat
            no-caps
            dense
            color="negative"
            icon="delete_outline"
            label="ลบ"
            data-test="delete-btn"
            @click="confirmDelete(connection)"
          />
        </div>
      </WsCard>
      </div>
    </div>
  </q-page>
</template>

<style scoped>
.broker-connections-page {
  max-width: 880px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 6px;
  font-size: clamp(1.5rem, 3.5vw, 2rem);
  font-weight: 800;
}

.page-subtitle {
  margin: 0;
  opacity: 0.7;
  font-size: 0.95rem;
}

.page-subtitle code {
  opacity: 0.85;
}

.api-key-banner {
  margin-bottom: 20px;
  border: 1px solid rgba(245, 158, 11, 0.5);
}

.api-key-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.api-key-value {
  font-family: monospace;
  font-size: 0.9rem;
  word-break: break-all;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.api-key-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.create-card {
  margin-bottom: 24px;
}

.section-title {
  margin: 0 0 14px;
  font-size: 1.1rem;
  font-weight: 800;
}

.create-form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 12px;
  align-items: start;
}

.state-loading,
.state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  opacity: 0.7;
  text-align: center;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.connection-card {
  padding: 4px;
}

.connection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.connection-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.connection-broker {
  font-weight: 800;
  font-size: 1.05rem;
}

.connection-portfolio {
  font-size: 0.85rem;
  opacity: 0.75;
}

.connection-meta {
  font-size: 0.85rem;
  opacity: 0.85;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.connection-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .create-form {
    grid-template-columns: 1fr;
  }
}
</style>

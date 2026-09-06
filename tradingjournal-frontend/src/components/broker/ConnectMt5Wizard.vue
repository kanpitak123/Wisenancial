<script setup lang="ts">
/**
 * Guided, step-by-step replacement for "click Sync MT5 -> land on /BrokerConnections and
 * figure the rest out yourself". The underlying EA architecture (Phase 3, see
 * docs/mt5-ea-setup.md) is unchanged — this is purely a friendlier front door onto the
 * exact same create-connection / download-EA / whitelist-WebRequest / paste-key / wait-
 * for-heartbeat flow a technical user already had to do manually.
 *
 * /BrokerConnections stays the "advanced" view for users who already know what they're
 * doing (rotate/revoke/delete, manage multiple connections) — this wizard shares its
 * store (useBrokerConnectionStore) so both stay in sync automatically, never duplicating
 * connection state of its own.
 *
 * Resume behavior: progress within steps 2-4 is just re-readable instructions (nothing
 * server-side proves "the user actually did this"), so there's nothing meaningful to
 * persist about them. What IS persisted (localStorage, keyed by connection id) is which
 * step the wizard was last showing, so a user who closes mid-setup and reopens later
 * lands back where they left off instead of at step 1 — defaulting to step 5 (the live
 * check) the first time a connection exists but no stored step is found yet, per product
 * direction: "a user who set up the EA yesterday and comes back today should land on
 * step 5, not step 1".
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  brokerConnectionService,
  getBrokerConnectionErrorMessage,
} from 'src/services/broker-connection.service';
import { useBrokerConnectionStore } from 'stores/BrokerConnectionStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import {
  MT5_EA_API_BASE_URL,
  MT5_EA_DOWNLOAD_PATH,
  MT5_EA_EXPERTS_FOLDER,
  MT5_INGEST_ERROR_LABEL_TH,
} from 'src/constants/broker-connection.constants';
import type { BrokerConnection } from 'src/types/broker-connection.types';

const props = defineProps<{
  modelValue: boolean;
  /** Portfolio context this wizard was opened for (Sync MT5 button = active portfolio,
   * badge click = that specific card's portfolio) — pre-fills/locks step 1's portfolio
   * pick. Null/undefined means "no portfolio in context yet" (still selectable in step 1). */
  portfolioId?: number | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** User asked for the advanced/manage view (existing-connections management) instead
   * of continuing the wizard — parent decides what that means (today: navigate to
   * /BrokerConnections). Wizard closes itself first. */
  manage: [];
}>();

const $q = useQuasar();
const store = useBrokerConnectionStore();
const portfolioStore = usePortfolioStore();

const TOTAL_STEPS = 5;
const STEP_TITLES = [
  'สร้าง Connection',
  'ดาวน์โหลด EA',
  'อนุญาต WebRequest',
  'แนบ EA + วาง API Key',
  'ตรวจสอบการเชื่อมต่อ',
];
const POLL_INTERVAL_MS = 5000;
const TICK_INTERVAL_MS = 1000;
const TROUBLESHOOTING_AFTER_SECONDS = 120;

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const currentStep = ref(1);
const connection = ref<BrokerConnection | null>(null);
const apiKey = ref<string | null>(null);
const selectedPortfolioId = ref<number | null>(props.portfolioId ?? null);
const formError = ref<string | null>(null);
const isCreating = ref(false);
const isCheckingNow = ref(false);
const isRotating = ref(false);
const waitingSinceMs = ref<number | null>(null);
const ticker = ref(0); // bumped every second while step 5 is waiting, just to force elapsed-time re-renders

// การ 401 เดี่ยวๆ ระหว่าง poll ไม่ใช่เรื่องแปลก — axios interceptor (src/boot/axios.ts)
// ดักรีเฟรช token แล้ว retry request เดิมให้เงียบๆ อยู่แล้วในทุก request ที่ผ่าน `api`
// รวมถึง brokerConnectionService.get() นี้ด้วย ตัวนับนี้จับเฉพาะกรณีที่ refreshStatus()
// ยัง reject ซ้ำๆ ต่อเนื่อง (แปลว่า refresh เองก็ล้มเหลวจริง ไม่ใช่แค่ token หมดอายุปกติ)
// เพื่อไม่ให้ wizard วน spinner "กำลังรอ..." ไปเรื่อยๆ อย่างเงียบๆ ทั้งที่ session หลุดจริงแล้ว
const CONSECUTIVE_FAILURES_BEFORE_SESSION_EXPIRED = 3;
const consecutivePollFailures = ref(0);
const sessionExpiredDuringPoll = ref(false);

// step1 ไม่มีอะไรให้เลือกจริง (MT5 คือ broker เดียวที่ใช้ได้วันนี้ — ดู
// BROKER_TYPE_OPTIONS/BrokerConnectionsPage.vue) แต่ portfolio เลือกได้ — และในตัว wizard
// นี้ตั้งใจ "บังคับ" เลือกก่อนสร้างเสมอ (ต่างจากหน้า advanced ที่ปล่อยข้ามได้) เพราะ backend
// ไม่มี endpoint ผูก portfolio ทีหลังเลย — ถ้าข้ามไปตอนนี้ connection จะค้างสถานะ
// PORTFOLIO_NOT_BOUND ถาวรจนกว่าจะสร้างใหม่ทั้งอัน (ดู final summary — ช่องว่างที่พบระหว่างทำ)
const portfolioOptions = computed(() =>
  portfolioStore.traderPortfolios.map((p) => ({ label: p.name, value: p.id })),
);

const minStep = computed(() => (connection.value ? 2 : 1));

function wizardStepStorageKey(connectionId: number): string {
  return `mt5_wizard_step_${connectionId}`;
}

function persistStep(step: number): void {
  if (!connection.value) return;
  try {
    localStorage.setItem(wizardStepStorageKey(connection.value.id), String(step));
  } catch {
    // localStorage ปิด/เต็ม — แค่เสีย convenience ของการ resume ไม่ใช่ความผิดพลาดร้ายแรง
  }
}

function resumeStepFor(connectionId: number): number {
  try {
    const stored = Number(localStorage.getItem(wizardStepStorageKey(connectionId)));
    if (Number.isInteger(stored) && stored >= 2 && stored <= TOTAL_STEPS) return stored;
  } catch {
    // ข้ามไปใช้ default ด้านล่าง
  }
  return TOTAL_STEPS; // "ควรไปโผล่ที่ step 5 ไม่ใช่ step 1" ตามที่โจทย์ระบุไว้ตรงๆ
}

function findConnectionForPortfolio(portfolioId: number | null): BrokerConnection | null {
  if (portfolioId === null) return null;
  // เรียงจากใหม่ไปเก่าอยู่แล้วจาก backend (orderBy created_at desc) — ตัวแรกที่เจอคือ
  // ล่าสุดเสมอ ไม่กรอง REVOKED ออกโดยตั้งใจ: connection ที่ REVOKED แล้วควรพาไปหน้า step 5
  // ที่โชว์ "key ใช้งานไม่ได้แล้ว -> ออก key ใหม่" แทนที่จะปล่อยให้ผู้ใช้เผลอกดสร้างซ้ำ
  return store.connections.find((c) => c.portfolio_id === portfolioId) ?? null;
}

let pollHandle: ReturnType<typeof setInterval> | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;

function stopPolling(): void {
  if (pollHandle !== null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  if (tickHandle !== null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

async function refreshStatus(): Promise<void> {
  if (!connection.value) return;
  try {
    connection.value = await brokerConnectionService.get(connection.value.id);
    consecutivePollFailures.value = 0;
  } catch {
    // ปกติจะไม่มาถึง catch นี้เลยตอน 401 ธรรมดา เพราะ axios interceptor รีเฟรช+retry
    // ให้เงียบๆ ไปแล้ว — ที่มาถึงนี่ได้คือ network blip จริงๆ หรือ refresh เองก็ล้มเหลว
    consecutivePollFailures.value++;
    if (consecutivePollFailures.value >= CONSECUTIVE_FAILURES_BEFORE_SESSION_EXPIRED) {
      sessionExpiredDuringPoll.value = true;
      stopPolling();
    }
  }
}

function startPolling(): void {
  stopPolling();
  waitingSinceMs.value = Date.now();
  consecutivePollFailures.value = 0;
  sessionExpiredDuringPoll.value = false;
  pollHandle = setInterval(() => void refreshStatus(), POLL_INTERVAL_MS);
  tickHandle = setInterval(() => {
    ticker.value++;
  }, TICK_INTERVAL_MS);
}

async function handleCheckNow(): Promise<void> {
  isCheckingNow.value = true;
  try {
    await refreshStatus();
    // ถ้าเพิ่งฟื้นจากสถานะ "session expired" (เช่น ผู้ใช้ login ใหม่ในแท็บอื่นแล้วกลับมา
    // กดปุ่มนี้) และ polling ถูกหยุดไปก่อนหน้านี้ ให้ตั้ง polling รอบใหม่ต่อเลย
    if (!sessionExpiredDuringPoll.value && pollHandle === null && currentStep.value === 5) {
      startPolling();
    }
  } finally {
    isCheckingNow.value = false;
  }
}

const elapsedWaitingSeconds = computed(() => {
  void ticker.value; // ให้ computed นี้ผูกกับ ticker เพื่อ re-evaluate ทุกวินาที
  if (waitingSinceMs.value === null) return 0;
  return Math.floor((Date.now() - waitingSinceMs.value) / 1000);
});

type ConnectionDisplayState =
  | 'session_expired'
  | 'invalid_key'
  | 'error'
  | 'connected'
  | 'pinned_waiting_sync'
  | 'waiting';

const displayState = computed<ConnectionDisplayState>(() => {
  // เช็คก่อนสถานะอื่นทั้งหมด — ถ้า session หลุดจริง ข้อมูล connection ที่ค้างอยู่ในมือ
  // ไม่ควรถูกใช้บอกอะไรอีกต่อไป (อาจเก่าไปแล้ว)
  if (sessionExpiredDuringPoll.value) return 'session_expired';
  const c = connection.value;
  if (!c) return 'waiting';
  if (c.status === 'REVOKED') return 'invalid_key';
  if (c.last_error_code) return 'error';
  if (c.external_account_id && c.last_sync_at) return 'connected';
  if (c.external_account_id) return 'pinned_waiting_sync';
  return 'waiting';
});

const showTroubleshooting = computed(
  () => displayState.value === 'waiting' && elapsedWaitingSeconds.value >= TROUBLESHOOTING_AFTER_SECONDS,
);

async function copyToClipboard(value: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    $q.notify({ type: 'positive', message: successMessage, position: 'top', timeout: 2000 });
  } catch {
    $q.notify({
      type: 'warning',
      message: 'คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกด้วยตัวเอง',
      position: 'top',
      timeout: 3000,
    });
  }
}

function goBack(): void {
  formError.value = null;
  if (currentStep.value > minStep.value) {
    currentStep.value--;
  }
}

function goNext(): void {
  formError.value = null;
  if (currentStep.value < TOTAL_STEPS) {
    currentStep.value++;
  }
}

async function handleCreate(): Promise<void> {
  formError.value = null;
  isCreating.value = true;
  try {
    const result = await store.createConnection('MT5', selectedPortfolioId.value ?? undefined);
    connection.value = result.connection;
    apiKey.value = result.apiKey;
    // The wizard renders `apiKey` (this local ref) for its own one-time reveal, never
    // store.revealedApiKey — clear the store's copy immediately so it can't leak into
    // /BrokerConnections (a different view reading the same shared store) later.
    store.clearRevealedKey();
    currentStep.value = 2;
  } catch (error) {
    // Conflict (409) = portfolio นี้มี connection ที่ยังไม่ REVOKED ผูกอยู่แล้ว — แทนที่จะ
    // โชว์ error เฉยๆ ให้ไปหาแล้วพาเข้า wizard ของ connection ที่มีอยู่แล้วต่อเลย
    const existing = await recoverExistingConnectionOnConflict();
    if (existing) {
      connection.value = existing;
      apiKey.value = null;
      currentStep.value = resumeStepFor(existing.id);
      $q.notify({
        type: 'info',
        message: 'Portfolio นี้มี connection อยู่แล้ว — พาไปต่อจากที่ค้างไว้',
        position: 'top',
        timeout: 3000,
      });
    } else {
      formError.value = getBrokerConnectionErrorMessage(error, 'สร้าง connection ไม่สำเร็จ');
      $q.notify({ type: 'negative', message: formError.value, position: 'top', timeout: 4000 });
    }
  } finally {
    isCreating.value = false;
  }
}

async function recoverExistingConnectionOnConflict(): Promise<BrokerConnection | null> {
  if (selectedPortfolioId.value === null) return null;
  try {
    await store.loadConnections();
  } catch {
    return null;
  }
  return findConnectionForPortfolio(selectedPortfolioId.value);
}

async function handleGenerateNewKey(): Promise<void> {
  if (!connection.value) return;
  isRotating.value = true;
  try {
    const result = await store.rotateKey(connection.value.id);
    connection.value = result.connection;
    apiKey.value = result.apiKey;
    store.clearRevealedKey(); // same reason as handleCreate() — wizard shows `apiKey`, not the store's copy
    currentStep.value = 4; // กลับไปหน้าที่ต้องเอา key ใหม่ไปวางใน EA
    $q.notify({ type: 'positive', message: 'ออก API key ใหม่แล้ว — เอาไปวางใน EA ได้เลย', position: 'top', timeout: 3000 });
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: getBrokerConnectionErrorMessage(error, 'ออก key ใหม่ไม่สำเร็จ'),
      position: 'top',
      timeout: 4000,
    });
  } finally {
    isRotating.value = false;
  }
}

function handleManage(): void {
  isOpen.value = false;
  // Defense-in-depth: handleCreate()/handleGenerateNewKey() already clear this the
  // instant they capture the key into `apiKey`, but clear again here so navigating to
  // /BrokerConnections can never inherit a stale reveal from this store, regardless of
  // how it got set.
  store.clearRevealedKey();
  emit('manage');
}

function errorLabel(code: string | null): string {
  if (!code) return '';
  return MT5_INGEST_ERROR_LABEL_TH[code] ?? 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
}

watch(currentStep, (step) => {
  persistStep(step);
  if (step === 5 && connection.value) {
    startPolling();
  } else {
    stopPolling();
  }
  if (step === 4 && apiKey.value) {
    // best-effort auto-copy เข้าคลิปบอร์ดตอนเพิ่งเข้าหน้านี้ — เบราว์เซอร์บางตัวบล็อก
    // clipboard write ที่ไม่มาจาก user gesture ตรงๆ จึงห่อ try/catch เงียบๆ ไว้ ปุ่ม
    // copy ที่เห็นอยู่แล้วเป็น fallback เสมอ
    void copyToClipboard(apiKey.value, 'คัดลอก API key แล้ว (อัตโนมัติ)').catch(() => undefined);
  }
});

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      stopPolling();
      store.clearRevealedKey();
      return;
    }

    formError.value = null;

    if (portfolioStore.traderPortfolios.length === 0) {
      await portfolioStore.loadPortfolios('TRADER').catch(() => null);
    }
    if (store.connections.length === 0) {
      await store.loadConnections().catch(() => null);
    }

    selectedPortfolioId.value = props.portfolioId ?? null;
    const existing = findConnectionForPortfolio(selectedPortfolioId.value);

    if (existing) {
      // เปิด wizard ซ้ำสำหรับ connection ตัวเดิมในเซสชันเดียวกัน (ปิดแล้วเปิดใหม่เร็วๆ) —
      // อย่าทิ้ง apiKey ที่เพิ่งสร้าง/rotate ไว้ในเซสชันนี้ทิ้งไปเฉยๆ
      const isSameConnectionAsBefore = connection.value?.id === existing.id;
      connection.value = existing;
      if (!isSameConnectionAsBefore) {
        apiKey.value = null;
        currentStep.value = resumeStepFor(existing.id);
      }
    } else {
      connection.value = null;
      apiKey.value = null;
      currentStep.value = 1;
    }

    if (currentStep.value === 5 && connection.value) {
      startPolling();
    }
  },
);

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <q-dialog v-model="isOpen" backdrop-filter="blur(8px) saturate(1.3)" data-test="mt5-wizard">
    <q-card class="wizard-card" style="width: 560px; max-width: 95vw">
      <div class="wizard-header">
        <div>
          <div class="wizard-title">เชื่อมต่อ MT5</div>
          <div class="wizard-subtitle">{{ STEP_TITLES[currentStep - 1] }}</div>
        </div>
        <q-btn flat round dense icon="close" data-test="wizard-close-btn" v-close-popup />
      </div>

      <div class="wizard-progress">
        <div class="wizard-progress-track">
          <div
            v-for="segment in TOTAL_STEPS"
            :key="segment"
            class="wizard-progress-segment"
            :class="{ 'wizard-progress-segment--done': segment <= currentStep }"
          />
        </div>
        <div class="wizard-progress-label">ขั้นตอนที่ {{ currentStep }} จาก {{ TOTAL_STEPS }}</div>
      </div>

      <q-scroll-area style="height: 56vh; min-height: 380px">
        <div class="q-pa-md">
          <!-- Step 1: Create connection -->
          <div v-if="currentStep === 1" data-test="wizard-step-1">
            <p class="wizard-copy">
              เชื่อมต่อบัญชี MetaTrader 5 เข้ากับ Wisenancial — ระบบจะสร้าง API key ให้หนึ่งชุด
              เอาไปใส่ใน EA ที่ขั้นตอนถัดไป
            </p>

            <div class="wizard-field-label">แพลตฟอร์ม</div>
            <div class="wizard-static-field">MetaTrader 5</div>

            <div class="wizard-field-label q-mt-md">ผูกกับ Portfolio</div>
            <q-select
              v-model="selectedPortfolioId"
              :options="portfolioOptions"
              option-value="value"
              option-label="label"
              emit-value
              map-options
              outlined
              dense
              placeholder="เลือก Portfolio"
              data-test="wizard-portfolio-select"
            />
            <div class="wizard-hint">
              เลือกให้แน่ใจตั้งแต่ตอนนี้ — Connection ที่สร้างแล้วยังผูก Portfolio อื่นทีหลังไม่ได้
              (ต้องสร้าง connection ใหม่ถ้าเลือกผิด)
            </div>

            <div v-if="formError" class="wizard-error-text">{{ formError }}</div>
          </div>

          <!-- Step 2: Download EA -->
          <div v-else-if="currentStep === 2" data-test="wizard-step-2">
            <p class="wizard-copy">
              Expert Advisor (EA) คือโปรแกรมเสริมที่รันอยู่ใน MetaTrader 5 เอง — ตัวนี้ทำหน้าที่
              แค่ "อ่าน" ยอดบัญชี/ไม้ที่เปิดอยู่/ประวัติการเทรด แล้วส่งมาให้ Wisenancial เท่านั้น
              ไม่มีสิทธิ์เปิด/ปิด/แก้ไม้ใดๆ ทั้งสิ้น
            </p>

            <q-btn
              unelevated
              no-caps
              color="primary"
              icon="download"
              label="ดาวน์โหลด WisenancialMT5EA.ex5"
              :href="MT5_EA_DOWNLOAD_PATH"
              download
              data-test="wizard-download-ea-btn"
            />

            <div class="wizard-field-label q-mt-lg">วางไฟล์ไว้ที่โฟลเดอร์นี้ในเครื่อง MT5</div>
            <div class="wizard-copy-row">
              <code class="wizard-code">{{ MT5_EA_EXPERTS_FOLDER }}</code>
              <q-btn
                flat
                dense
                no-caps
                icon="content_copy"
                label="คัดลอก path"
                data-test="wizard-copy-path-btn"
                @click="copyToClipboard(MT5_EA_EXPERTS_FOLDER, 'คัดลอก path แล้ว')"
              />
            </div>
            <div class="wizard-hint">
              เปิดโฟลเดอร์นี้ได้จากในโปรแกรม MT5 เอง: File → Open Data Folder → MQL5 → Experts
            </div>
          </div>

          <!-- Step 3: Allow WebRequest -->
          <div v-else-if="currentStep === 3" data-test="wizard-step-3">
            <p class="wizard-copy">
              MT5 บล็อกการเชื่อมต่อ HTTP ทุกตัวจาก EA เว้นแต่จะเพิ่ม URL นี้เข้า whitelist ก่อน
            </p>

            <div class="wizard-copy-row">
              <code class="wizard-code" data-test="wizard-webrequest-url">{{ MT5_EA_API_BASE_URL }}</code>
              <q-btn
                flat
                dense
                no-caps
                icon="content_copy"
                label="คัดลอก URL"
                data-test="wizard-copy-url-btn"
                @click="copyToClipboard(MT5_EA_API_BASE_URL, 'คัดลอก URL แล้ว')"
              />
            </div>
            <div class="wizard-hint">
              คัดลอกด้วยปุ่มด้านบนเท่านั้น อย่าพิมพ์เอง — พิมพ์ผิดตัวเดียวก็ทำให้ MT5 ปฏิเสธ
              WebRequest แบบเงียบๆ โดยไม่มี error ให้เห็น
            </div>

            <ol class="wizard-steps-list">
              <li>ในโปรแกรม MT5: <b>Tools → Options → Expert Advisors</b></li>
              <li>ติ๊กถูก <b>"Allow WebRequest for listed URL"</b></li>
              <li>วาง URL ที่คัดลอกไว้ด้านบนลงในช่อง</li>
              <li>
                <b>กด Enter ในช่องนั้นก่อน</b> แล้วค่อยกด OK — ถ้าไม่กด Enter ก่อน MT5 จะทิ้ง URL
                นี้ทิ้งเงียบๆ โดยไม่แจ้งเตือนอะไรเลย
              </li>
            </ol>
          </div>

          <!-- Step 4: Attach EA & paste key -->
          <div v-else-if="currentStep === 4" data-test="wizard-step-4">
            <div v-if="apiKey" class="wizard-warning-banner" data-test="wizard-one-time-key-banner">
              <q-icon name="warning" color="amber" size="20px" />
              <div>
                <div class="text-weight-bolder">นี่คือครั้งเดียวที่จะเห็น API key นี้</div>
                <div class="text-body2">คัดลอกไปเก็บไว้ตอนนี้เลย — ปิดหน้าต่างนี้แล้วจะเรียกดูซ้ำไม่ได้อีก</div>
              </div>
            </div>
            <div v-else class="wizard-info-banner" data-test="wizard-key-unknown-banner">
              คุณเคยสร้าง API key นี้ไปแล้วก่อนหน้านี้ — ถ้าจำไม่ได้หรือ EA เดิมหาย ให้ออก key ใหม่
              <q-btn
                flat
                dense
                no-caps
                color="primary"
                label="ออก Key ใหม่"
                :loading="isRotating"
                data-test="wizard-generate-key-btn"
                @click="handleGenerateNewKey"
              />
            </div>

            <template v-if="apiKey">
              <div class="wizard-field-label q-mt-md">API Key (สำหรับ InpApiKey)</div>
              <div class="wizard-copy-row">
                <code class="wizard-code wizard-code--secret" data-test="wizard-api-key-value">{{ apiKey }}</code>
                <q-btn
                  flat
                  dense
                  no-caps
                  icon="content_copy"
                  label="คัดลอก"
                  data-test="wizard-copy-key-btn"
                  @click="copyToClipboard(apiKey, 'คัดลอก API key แล้ว')"
                />
              </div>
            </template>

            <div class="wizard-field-label q-mt-md">Base URL (สำหรับ InpApiBaseUrl)</div>
            <div class="wizard-copy-row">
              <code class="wizard-code">{{ MT5_EA_API_BASE_URL }}</code>
              <q-btn
                flat
                dense
                no-caps
                icon="content_copy"
                label="คัดลอก"
                @click="copyToClipboard(MT5_EA_API_BASE_URL, 'คัดลอก URL แล้ว')"
              />
            </div>

            <ol class="wizard-steps-list">
              <li>ลาก <b>WisenancialMT5EA</b> จาก Navigator ไปวางบนกราฟใดก็ได้ (กราฟไหนไม่สำคัญ)</li>
              <li>แท็บ <b>Common</b>: ติ๊กถูก "Allow Algo Trading" (หรือ "Allow live trading")</li>
              <li>แท็บ <b>Inputs</b>: วางค่าทั้งสองด้านบนลงใน InpApiKey และ InpApiBaseUrl</li>
              <li>กด OK</li>
            </ol>
          </div>

          <!-- Step 5: Live connection check -->
          <div v-else-if="currentStep === 5" data-test="wizard-step-5">
            <div v-if="displayState === 'session_expired'" class="wizard-status wizard-status--error" data-test="wizard-session-expired-banner">
              <q-icon name="lock_clock" color="negative" size="28px" />
              <div>
                <div class="text-weight-bolder">เซสชันหมดอายุ</div>
                <div class="text-body2">กรุณาเข้าสู่ระบบใหม่แล้วกลับมาเช็คสถานะการเชื่อมต่ออีกครั้ง</div>
              </div>
            </div>

            <div v-else-if="displayState === 'connected'" class="wizard-status wizard-status--success" data-test="wizard-connected-banner">
              <q-icon name="check_circle" color="positive" size="28px" />
              <div>
                <div class="text-weight-bolder">เชื่อมต่อสำเร็จ!</div>
                <div class="text-body2">
                  บัญชี {{ connection?.external_account_id }}
                  <span v-if="connection?.broker_server">@ {{ connection.broker_server }}</span>
                  — กำลัง sync ไม้อยู่
                </div>
              </div>
            </div>

            <div v-else-if="displayState === 'pinned_waiting_sync'" class="wizard-status" data-test="wizard-pinned-banner">
              <q-spinner color="primary" size="28px" />
              <div>
                <div class="text-weight-bolder">
                  ยืนยันบัญชี {{ connection?.external_account_id }} สำเร็จ
                </div>
                <div class="text-body2">กำลังรอข้อมูล sync รอบแรกจาก MT5...</div>
              </div>
            </div>

            <div v-else-if="displayState === 'invalid_key'" class="wizard-status wizard-status--error" data-test="wizard-invalid-key-banner">
              <q-icon name="error" color="negative" size="28px" />
              <div>
                <div class="text-weight-bolder">API key นี้ใช้งานไม่ได้แล้ว</div>
                <div class="text-body2">Key ถูก revoke หรือหมดอายุไปแล้ว — ออก key ใหม่แล้วนำไปตั้งค่าใน EA อีกครั้ง</div>
              </div>
              <q-btn
                unelevated
                no-caps
                color="primary"
                label="ออก Key ใหม่"
                :loading="isRotating"
                data-test="wizard-generate-key-from-error-btn"
                @click="handleGenerateNewKey"
              />
            </div>

            <div v-else-if="displayState === 'error'" class="wizard-status wizard-status--error" data-test="wizard-error-banner">
              <q-icon name="error" color="negative" size="28px" />
              <div>
                <div class="text-weight-bolder">{{ errorLabel(connection?.last_error_code ?? null) }}</div>
                <div class="text-body2 text-muted">{{ connection?.last_error_message }}</div>
              </div>
            </div>

            <div v-else class="wizard-status" data-test="wizard-waiting-banner">
              <q-spinner color="primary" size="28px" />
              <div>
                <div class="text-weight-bolder">กำลังรอ MT5 เชื่อมต่อ...</div>
                <div class="text-body2">รอมาแล้ว {{ elapsedWaitingSeconds }} วินาที</div>
              </div>
            </div>

            <q-btn
              flat
              no-caps
              icon="refresh"
              label="ฉันทำขั้นตอนนี้เสร็จแล้ว เช็คอีกครั้ง"
              class="q-mt-md"
              :loading="isCheckingNow"
              data-test="wizard-check-now-btn"
              @click="handleCheckNow"
            />

            <div v-if="showTroubleshooting" class="wizard-troubleshooting" data-test="wizard-troubleshooting">
              <div class="text-weight-bolder q-mb-xs">ยังไม่เชื่อมต่อ? ลองเช็คสิ่งเหล่านี้:</div>
              <ul class="wizard-steps-list">
                <li>เปิด "Algo Trading" ทั้งปุ่มบน toolbar หลัก และ checkbox ในตัว EA เอง</li>
                <li>Symbol ของกราฟที่แนบ EA ไว้ต้องเป็น symbol ที่โบรกเกอร์นี้มีจริง</li>
                <li>WebRequest URL ต้องกด Enter ยืนยันในช่องก่อนกด OK (ดูขั้นตอนที่ 3)</li>
              </ul>
            </div>
          </div>
        </div>
      </q-scroll-area>

      <div class="wizard-footer">
        <q-btn flat no-caps label="จัดการขั้นสูง" data-test="wizard-manage-link" @click="handleManage" />
        <q-space />
        <q-btn
          v-if="currentStep > minStep"
          flat
          no-caps
          label="ย้อนกลับ"
          data-test="wizard-back-btn"
          @click="goBack"
        />
        <q-btn
          v-if="currentStep === 1"
          unelevated
          no-caps
          color="primary"
          label="เริ่มเชื่อมต่อ"
          :loading="isCreating"
          :disable="selectedPortfolioId === null"
          data-test="wizard-create-btn"
          @click="handleCreate"
        />
        <q-btn
          v-else-if="currentStep < TOTAL_STEPS"
          unelevated
          no-caps
          color="primary"
          label="ถัดไป"
          data-test="wizard-next-btn"
          @click="goNext"
        />
        <q-btn
          v-else-if="displayState === 'connected'"
          unelevated
          no-caps
          color="positive"
          label="เสร็จสิ้น"
          data-test="wizard-finish-btn"
          v-close-popup
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.wizard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 16px 0;
}

.wizard-title {
  font-size: 1.15rem;
  font-weight: 800;
}

.wizard-subtitle {
  font-size: 0.85rem;
  opacity: 0.7;
  margin-top: 2px;
}

.wizard-progress {
  padding: 12px 16px 0;
}

.wizard-progress-track {
  display: flex;
  gap: 4px;
}

.wizard-progress-segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.25);
}

.wizard-progress-segment--done {
  background: var(--q-primary, #1976d2);
}

.wizard-progress-label {
  font-size: 0.75rem;
  opacity: 0.65;
  margin-top: 6px;
}

.wizard-copy {
  font-size: 0.9rem;
  opacity: 0.85;
  margin: 0 0 14px;
  line-height: 1.5;
}

.wizard-field-label {
  font-size: 0.8rem;
  font-weight: 700;
  opacity: 0.75;
  margin-bottom: 6px;
}

.wizard-static-field {
  font-size: 0.9rem;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.12);
}

.wizard-hint {
  font-size: 0.78rem;
  opacity: 0.6;
  margin-top: 6px;
  line-height: 1.4;
}

.wizard-error-text {
  color: var(--q-negative, #c10015);
  font-size: 0.85rem;
  margin-top: 10px;
}

.wizard-copy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wizard-code {
  font-family: monospace;
  font-size: 0.85rem;
  word-break: break-all;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 8px 10px;
  flex: 1;
  min-width: 0;
}

.wizard-code--secret {
  border: 1px solid rgba(245, 158, 11, 0.5);
}

.wizard-steps-list {
  font-size: 0.85rem;
  opacity: 0.85;
  line-height: 1.7;
  padding-left: 20px;
  margin: 14px 0 0;
}

.wizard-warning-banner,
.wizard-info-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 14px;
}

.wizard-warning-banner {
  border: 1px solid rgba(245, 158, 11, 0.5);
  align-items: flex-start;
}

.wizard-info-banner {
  background: rgba(128, 128, 128, 0.12);
  justify-content: space-between;
  flex-wrap: wrap;
}

.wizard-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.1);
}

.wizard-status--success {
  background: rgba(33, 186, 69, 0.1);
}

.wizard-status--error {
  background: rgba(193, 0, 21, 0.08);
  flex-wrap: wrap;
}

.wizard-troubleshooting {
  margin-top: 20px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.1);
  font-size: 0.85rem;
}

.wizard-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}
</style>

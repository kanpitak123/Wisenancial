<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { ref } from 'vue';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useWorkspace } from 'src/composables/useWorkspace';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';
import type { Portfolio } from 'src/types/portfolio.types';

const $q = useQuasar();
const store = usePortfolioStore();

// หน้านี้เป็น shared — แสดงเฉพาะพอร์ตของโหมดที่ active อยู่ (Forex = TRADER, Stock = INVESTOR)
const { meta: workspaceMeta } = useWorkspace();

const { safeLoad } = useSafeLoad();

onMounted(async () => {
  if (!store.hasLoadedAll) {
    await safeLoad(() => store.loadPortfolios(), 'โหลดพอร์ตโฟลิโอไม่สำเร็จ');
  } else if (!store.quota) {
    // เข้าหน้านี้ตอนพอร์ตโหลดไว้แล้ว loadPortfolios() จะ early-return เลยยังไม่มีโควต้า
    await store.loadQuota();
  }
});

// ── โควต้า ─────────────────────────────────────────────────────────────────────
// โควต้าเป็นก้อนเดียวรวมทั้งสองโหมด — นับ Stock + Forex เข้าด้วยกัน
const quotaLabel = computed(() => {
  const max = store.quotaMax;

  return max === null ? `ใช้ไป ${store.quotaUsed} พอร์ต` : `ใช้ไป ${store.quotaUsed}/${max} พอร์ต`;
});

const quotaBreakdown = computed(
  () => `Stock ${store.quotaByType.INVESTOR} · Forex ${store.quotaByType.TRADER}`,
);

const quotaProgress = computed(() => {
  const max = store.quotaMax;

  return max === null || max === 0 ? 0 : Math.min(1, store.quotaUsed / max);
});

const quotaTone = computed(() => {
  if (store.hasReachedQuota) return 'negative';

  return quotaProgress.value >= 0.75 ? 'warning' : 'primary';
});

const isQuotaFull = computed(() => store.hasReachedQuota);

// จำนวนสิทธิ์ที่เหลือ ใช้บนการ์ด "สร้างพอร์ตใหม่" ท้ายกริดตามแบบ
// null = แพ็กไม่จำกัดจำนวนพอร์ต จึงไม่ต้องบอกตัวเลข
const quotaRemaining = computed(() => {
  const max = store.quotaMax;

  return max === null ? null : Math.max(0, max - store.quotaUsed);
});

// ── Create ─────────────────────────────────────────────────────────────────────
const createDialog = ref(false);
const portForm = ref({ name: '', initial_balance: null as number | null });

const openCreateDialog = () => {
  if (isQuotaFull.value) {
    $q.notify({
      type: 'warning',
      message: `ใช้โควต้าครบ ${store.quotaMax} พอร์ตแล้ว กรุณาอัปเกรดแพ็กเกจหรือลบพอร์ตที่ไม่ได้ใช้`,
      position: 'top',
    });

    return;
  }

  portForm.value = { name: '', initial_balance: null };
  createDialog.value = true;
};

const submitCreatePortfolio = async () => {
  if (!portForm.value.name || portForm.value.initial_balance === null) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields.', position: 'top' });
    return;
  }

  try {
    // ต้อง await — เดิมยิงแล้วแจ้ง "สำเร็จ" ทันที ถ้า backend ปฏิเสธ (เช่นโควต้าเต็ม)
    // ผู้ใช้จะเห็นข้อความว่าสำเร็จทั้งที่ไม่ได้สร้าง
    await store.createPortfolio({
      name: portForm.value.name,
      initial_balance: portForm.value.initial_balance,
    });

    createDialog.value = false;
    $q.notify({ type: 'positive', message: 'Portfolio created successfully.', position: 'top' });
  } catch {
    // store เก็บข้อความจาก backend ไว้แล้ว (รวมข้อความโควต้าเต็มภาษาไทย)
    $q.notify({
      type: 'negative',
      message: store.error ?? 'ไม่สามารถสร้างพอร์ตได้',
      position: 'top',
      timeout: 5000,
    });
  }
};

// ── Edit ───────────────────────────────────────────────────────────────────────
const editDialog = ref(false);
const editForm = ref({ id: 0, name: '', initial_balance: null as number | null });

const openEditDialog = (port: Portfolio) => {
  editForm.value = { id: port.id, name: port.name, initial_balance: Number(port.initial_balance) };
  editDialog.value = true;
};

const submitEditPortfolio = () => {
  if (editForm.value.name && editForm.value.initial_balance !== null) {
    void store.updatePortfolio(editForm.value.id, {
      name: editForm.value.name,
      initial_balance: editForm.value.initial_balance,
    });
    editDialog.value = false;
    $q.notify({ type: 'positive', message: 'Portfolio updated successfully.', position: 'top' });
  } else {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields.', position: 'top' });
  }
};

// ── Delete ─────────────────────────────────────────────────────────────────────
const deleteDialog = ref(false);
const portToDelete = ref<Portfolio | null>(null);

const confirmDelete = (port: Portfolio) => {
  portToDelete.value = port;
  deleteDialog.value = true;
};

const submitDelete = () => {
  if (portToDelete.value) {
    void store.deletePortfolio(portToDelete.value.id);
    deleteDialog.value = false;
    $q.notify({ type: 'positive', message: 'Portfolio deleted successfully.', position: 'top' });
  }
};

// ── Select ─────────────────────────────────────────────────────────────────────
const selectPort = (id: number) => {
  store.selectPortfolio(id);
  $q.notify({
    type: 'positive',
    message: 'Portfolio selected.',
    icon: 'check_circle',
    position: 'top',
  });
};

// ── Utils ──────────────────────────────────────────────────────────────────────
const calculateGrowth = (current: number, initial: number) => {
  if (initial === 0) return '0.00';
  return (((current - initial) / initial) * 100).toFixed(2);
};

const netPnl = (port: Portfolio) => Number(port.current_balance) - Number(port.initial_balance);
</script>

<template>
  <q-page class="portfolio-page q-pa-md q-pa-sm-lg">
    <!-- ── Header ────────────────────────────────────────────────────────────── -->
    <div class="row items-end justify-between q-mb-xl q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none text-main tracking-tight">
          My Portfolios
          <q-badge :color="workspaceMeta.color" class="q-ml-sm" :label="workspaceMeta.label" />
        </h1>
        <div class="text-subtitle2 text-muted q-mt-xs">
          Manage all your {{ workspaceMeta.label }} accounts in one place.
        </div>
      </div>
      <div class="row items-center q-gutter-sm">
        <q-btn
          v-if="isQuotaFull"
          unelevated
          icon="workspace_premium"
          label="อัปเกรดแพ็กเกจ"
          color="warning"
          class="text-weight-bold"
          data-test="upgrade-btn"
          :to="UPGRADE_ROUTE"
        />

        <q-btn
          unelevated
          icon="add"
          label="New Portfolio"
          class="btn-primary-modern text-white text-weight-bold"
          data-test="create-portfolio-btn"
          :disable="isQuotaFull"
          @click="openCreateDialog"
        >
          <q-tooltip v-if="isQuotaFull" class="bg-grey-9 text-white shadow-4">
            ใช้โควต้าครบ {{ store.quotaMax }} พอร์ตแล้ว
          </q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- ── แถบโควต้า ──────────────────────────────────────────────────────────── -->
    <q-card flat class="quota-bar q-mb-lg" :class="{ 'quota-bar--full': isQuotaFull }">
      <div class="row items-center justify-between q-col-gutter-sm">
        <div class="col-12 col-sm-auto">
          <div class="row items-center no-wrap">
            <q-icon
              :name="isQuotaFull ? 'lock' : 'account_balance_wallet'"
              size="20px"
              :color="quotaTone"
              class="q-mr-sm"
            />
            <div>
              <div class="text-subtitle2 text-weight-bolder text-main" data-test="quota-label">
                {{ quotaLabel }}
                <span class="text-muted text-weight-regular q-ml-xs" data-test="quota-breakdown">
                  ({{ quotaBreakdown }})
                </span>
              </div>
              <div class="text-caption text-muted">
                โควต้านับรวมทั้งโหมด Forex และ Stock — แบ่งสัดส่วนได้ตามต้องการ
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-4">
          <q-linear-progress
            :value="quotaProgress"
            :color="quotaTone"
            size="8px"
            rounded
            track-color="grey-4"
            data-test="quota-progress"
          />
        </div>
      </div>

      <div v-if="isQuotaFull" class="quota-full-note q-mt-md" data-test="quota-full-note">
        <q-icon name="info" size="16px" class="q-mr-xs" />
        ใช้โควต้าครบแล้ว —
        <router-link :to="UPGRADE_ROUTE" class="quota-link">อัปเกรดแพ็กเกจ</router-link>
        เพื่อเพิ่มจำนวนพอร์ต หรือลบพอร์ตที่ไม่ได้ใช้ออกก่อน
      </div>
    </q-card>

    <!-- ── Portfolio Grid ─────────────────────────────────────────────────────── -->
    <div v-if="store.currentPortfolios.length === 0 && !store.isLoading" class="port-empty">
      <q-icon name="account_balance_wallet" size="40px" class="text-muted q-mb-sm" />
      <div class="text-subtitle1 text-weight-bolder text-main">
        ยังไม่มีพอร์ต{{ workspaceMeta.label }}
      </div>
      <div class="text-body2 text-muted q-mt-xs">
        กด "New Portfolio" เพื่อสร้างพอร์ตแรกของโหมดนี้
      </div>
    </div>

    <div class="row q-col-gutter-md">
      <div v-for="port in store.currentPortfolios" :key="port.id" class="col-12 col-sm-6 col-md-4">
        <q-card
          class="port-card cursor-pointer"
          :class="{ 'port-card--active': store.activePortfolioId === port.id }"
          flat
          @click="selectPort(port.id)"
        >
          <q-card-section class="q-pa-lg">
            <!-- Card Header -->
            <div class="row items-start justify-between q-mb-lg">
              <div class="col">
                <div class="text-subtitle1 text-weight-bolder text-main ellipsis">
                  {{ port.name }}
                </div>
                <div class="text-caption text-muted q-mt-xs">
                  Created
                  {{
                    new Date(port.created_at ?? '').toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  }}
                </div>
              </div>

              <div class="row items-center q-gutter-xs q-ml-sm">
                <q-badge v-if="store.activePortfolioId === port.id" class="active-badge q-mr-xs">
                  <q-icon name="check_circle" size="10px" class="q-mr-xs" />Active
                </q-badge>
                <q-btn
                  flat
                  round
                  dense
                  icon="edit"
                  size="sm"
                  class="text-muted action-btn"
                  @click.stop="openEditDialog(port)"
                >
                  <q-tooltip>Edit</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  icon="delete_outline"
                  size="sm"
                  class="text-muted action-btn action-btn--delete"
                  @click.stop="confirmDelete(port)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </div>
            </div>

            <!-- Balance Info -->
            <div class="port-balances q-mb-md">
              <div class="balance-item">
                <div class="balance-label">Initial</div>
                <div class="balance-value text-main">
                  ${{
                    Number(port.initial_balance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })
                  }}
                </div>
              </div>
              <q-icon name="arrow_forward" size="16px" class="bal-arrow" />
              <div class="balance-item balance-item--end">
                <div class="balance-label">Current</div>
                <div class="balance-value text-main text-weight-bolder">
                  ${{
                    Number(port.current_balance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })
                  }}
                </div>
              </div>
            </div>

            <!-- PnL Row -->
            <div class="row items-center justify-between">
              <span class="growth-label text-muted">Net PnL</span>
              <div class="row items-baseline q-gutter-xs">
                <span
                  class="text-subtitle1 text-weight-bolder"
                  :class="netPnl(port) >= 0 ? 'text-positive' : 'text-negative'"
                >
                  {{ netPnl(port) >= 0 ? '+' : '' }}${{
                    Math.abs(netPnl(port)).toLocaleString(undefined, { minimumFractionDigits: 2 })
                  }}
                </span>
                <span
                  class="text-caption text-weight-bold"
                  :class="netPnl(port) >= 0 ? 'text-positive' : 'text-negative'"
                  style="opacity: 0.75"
                >
                  ({{ netPnl(port) >= 0 ? '+' : ''
                  }}{{
                    calculateGrowth(Number(port.current_balance), Number(port.initial_balance))
                  }}%)
                </span>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div v-if="!isQuotaFull" class="col-12 col-sm-6 col-md-4">
        <div
          class="port-card port-card--create"
          data-test="create-portfolio-card"
          @click="openCreateDialog"
        >
          <div class="plus-circle">
            <q-icon name="add" size="20px" />
          </div>
          <span class="create-label">
            New Portfolio
            <template v-if="quotaRemaining !== null"> ({{ quotaRemaining }} left)</template>
          </span>
        </div>
      </div>
    </div>

    <!-- ── Create Dialog ──────────────────────────────────────────────────────── -->
    <q-dialog v-model="createDialog" persistent>
      <q-card class="port-dialog" style="width: 420px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none q-pt-lg q-px-lg">
          <div class="row items-center">
            <div class="dialog-icon-box bg-icon-primary text-primary q-mr-sm">
              <q-icon name="create_new_folder" size="18px" />
            </div>
            <div class="text-subtitle1 text-weight-bolder text-main">New Portfolio</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pa-lg q-pt-md">
          <div
            class="text-caption text-muted text-weight-bold text-uppercase q-mb-xs"
            style="letter-spacing: 0.05em"
          >
            Portfolio Name
          </div>
          <q-input
            outlined
            dense
            v-model="portForm.name"
            placeholder="e.g., Crypto Scalping"
            autofocus
            :dark="$q.dark.isActive"
            class="rounded-input q-mb-md"
          />
          <div
            class="text-caption text-muted text-weight-bold text-uppercase q-mb-xs"
            style="letter-spacing: 0.05em"
          >
            Initial Balance ($)
          </div>
          <q-input
            outlined
            dense
            v-model.number="portForm.initial_balance"
            type="number"
            min="0"
            placeholder="0.00"
            :dark="$q.dark.isActive"
            class="rounded-input"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-lg q-pt-sm">
          <q-btn flat label="Cancel" v-close-popup class="btn-ghost-modern text-weight-medium" />
          <q-btn
            unelevated
            label="Create Portfolio"
            icon="add"
            class="btn-primary-modern text-white text-weight-bold"
            @click="submitCreatePortfolio"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Edit Dialog ────────────────────────────────────────────────────────── -->
    <q-dialog v-model="editDialog" persistent>
      <q-card class="port-dialog" style="width: 420px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none q-pt-lg q-px-lg">
          <div class="row items-center">
            <div class="dialog-icon-box bg-icon-warning text-warning q-mr-sm">
              <q-icon name="edit" size="18px" />
            </div>
            <div class="text-subtitle1 text-weight-bolder text-main">Edit Portfolio</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pa-lg q-pt-md">
          <div
            class="text-caption text-muted text-weight-bold text-uppercase q-mb-xs"
            style="letter-spacing: 0.05em"
          >
            Portfolio Name
          </div>
          <q-input
            outlined
            dense
            v-model="editForm.name"
            autofocus
            :dark="$q.dark.isActive"
            class="rounded-input q-mb-md"
          />
          <div
            class="text-caption text-muted text-weight-bold text-uppercase q-mb-xs"
            style="letter-spacing: 0.05em"
          >
            Initial Balance ($)
          </div>
          <q-input
            outlined
            dense
            v-model.number="editForm.initial_balance"
            type="number"
            min="0"
            :dark="$q.dark.isActive"
            class="rounded-input"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-lg q-pt-sm">
          <q-btn flat label="Cancel" v-close-popup class="btn-ghost-modern text-weight-medium" />
          <q-btn
            unelevated
            label="Save Changes"
            icon="save"
            class="btn-primary-modern text-white text-weight-bold"
            @click="submitEditPortfolio"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Delete Dialog ──────────────────────────────────────────────────────── -->
    <q-dialog v-model="deleteDialog" persistent>
      <q-card class="port-dialog" style="width: 420px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none q-pt-lg q-px-lg">
          <div class="row items-center">
            <div class="dialog-icon-box bg-icon-negative text-negative q-mr-sm">
              <q-icon name="delete_outline" size="18px" />
            </div>
            <div class="text-subtitle1 text-weight-bolder text-negative">Delete Portfolio</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup class="text-muted" />
        </q-card-section>

        <q-card-section class="q-pa-lg q-pt-md">
          <div class="text-body2 text-main q-mb-xs">
            Are you sure you want to delete
            <span class="text-weight-bolder">"{{ portToDelete?.name }}"</span>?
          </div>
          <div class="text-caption text-muted q-mt-sm">
            All trading data in this portfolio will be permanently lost.
          </div>
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
/* แถบสรุปโควต้าด้านบนตารางพอร์ต */
.quota-bar {
  padding: 16px 20px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.quota-bar--full {
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.05);
}

.quota-full-note {
  font-size: 13px;
  font-weight: 600;
  color: #dc2626;
}
/* #dc2626 จมไปกับพื้นหลังเข้ม #151819 — ใช้โทนเดียวกับ --negative ของ dark mode */
.body--dark .quota-full-note {
  color: #f87171;
}

.quota-link {
  color: inherit;
  font-weight: 800;
  text-decoration: underline;
}

/* สถานะว่างของโหมดปัจจุบัน — โหมดหนึ่งอาจยังไม่มีพอร์ตเลยขณะที่อีกโหมดมีแล้ว */
.port-empty {
  text-align: center;
  padding: 56px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  background: var(--bg-card-soft);
}

/* ==========================================================
   CSS Variables
========================================================== */
/* หน้านี้ประกาศ palette slate/น้ำเงินของตัวเอง (#f8fafc / #1e293b / #3b82f6) ทับ
   token teal/sage ของ app.scss เหมือน Dashboard/Analytics — ค่าใน :root ของ mockup
   ตรงกับ app.scss เป๊ะ จึงยกกลับมาใช้ชุดกลาง */
.portfolio-page {
  --bg-page: #f6f9f9;
  --bg-card: #fdfefe;
  --bg-card-soft: #f0f5f4;
  --text-main: #1b3636;
  --text-muted: #789191;
  --border-color: #dae7e5;
  --shadow-card: 0 1px 2px rgba(27, 54, 54, 0.04), 0 12px 32px -12px rgba(27, 54, 54, 0.1);
  --shadow-hover: 0 1px 2px rgba(27, 54, 54, 0.05), 0 18px 40px -14px rgba(27, 54, 54, 0.18);

  --accent-100: #e7f4f2;
  --accent-300: #b0d4cf;
  --accent-400: #9bc5c0;
  --accent-500: #85b6b0;
  --accent-600: #64a6a0;
  --accent-700: #4c8a87;
  --accent-800: #336160;
  --accent-900: #1b3636;

  --bg-dialog: #fdfefe;
  --border-dialog: #dae7e5;

  --bg-icon-primary: #e7f4f2;
  --bg-icon-positive: #f0fdf4;
  --bg-icon-warning: #fffbeb;
  --bg-icon-negative: #fef2f2;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  transition: background-color 0.3s ease;
}

.body--dark .portfolio-page {
  --bg-page: #151819;
  --bg-card: #1f2323;
  --bg-card-soft: #282e2e;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --border-color: #394141;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.2), 0 20px 44px -16px rgba(0, 0, 0, 0.55);
  --shadow-hover: 0 1px 2px rgba(0, 0, 0, 0.25), 0 26px 52px -18px rgba(0, 0, 0, 0.65);

  --bg-dialog: #1f2323;
  --border-dialog: #394141;

  --bg-icon-primary: rgba(133, 182, 176, 0.18);
  --bg-icon-positive: rgba(74, 222, 128, 0.15);
  --bg-icon-warning: rgba(251, 191, 36, 0.15);
  --bg-icon-negative: rgba(248, 113, 113, 0.15);
}

/* ==========================================================
   Typography
========================================================== */
.text-main {
  color: var(--text-main);
}
.text-muted {
  color: var(--text-muted);
}
.tracking-tight {
  letter-spacing: -0.02em;
}
.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-warning {
  background-color: var(--bg-icon-warning);
}
.bg-icon-negative {
  background-color: var(--bg-icon-negative);
}

/* ==========================================================
   Portfolio Card
========================================================== */
.port-card {
  position: relative;
  overflow: hidden;
  background: var(--bg-card);
  border-radius: 24px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease,
    border-color 0.25s ease;
}

/* แถบ accent 4px หัวการ์ดตามแบบ — สีจางเมื่อเป็นพอร์ตธรรมดา และเป็น gradient
   เมื่อเป็นพอร์ตที่เลือกอยู่ ทำให้เห็นใบที่ active จากหางตาโดยไม่ต้องอ่าน badge */
.port-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--border-color);
}
.port-card--active::before {
  background: linear-gradient(90deg, var(--accent-500), var(--accent-900));
}

.port-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
  border-color: var(--accent-300);
}
.port-card--active {
  border-color: var(--accent-600) !important;
  box-shadow:
    0 0 0 3px rgba(133, 182, 176, 0.22),
    var(--shadow-card) !important;
}

/* badge "Active" ในแบบใช้โทนเขียว positive ไม่ใช่สี accent — จะได้ไม่ไปชนกับ
   แถบ accent หัวการ์ดที่สื่อเรื่องเดียวกันอยู่แล้ว */
.active-badge {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(33, 186, 69, 0.14) !important;
  color: #178230 !important;
  border: 1px solid rgba(33, 186, 69, 0.25);
}
.body--dark .active-badge {
  background: rgba(74, 222, 128, 0.15) !important;
  color: #4ade80 !important;
  border-color: rgba(74, 222, 128, 0.3);
}

/* การ์ดเส้นประ "สร้างพอร์ตใหม่" ท้ายกริดตามแบบ — ใช้ .port-card ร่วมกันเพื่อให้
   ความสูง/มุมเท่าใบอื่นในแถวเดียวกัน แต่ทับ background/เงาให้เป็นทรงว่าง */
.port-card--create {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 222px;
  height: 100%;
  padding: 20px;
  background: transparent;
  border: 2px dashed var(--border-color);
  box-shadow: none;
  color: var(--text-muted);
  cursor: pointer;
  text-align: center;
}
.port-card--create::before {
  display: none;
}
.port-card--create:hover {
  transform: none;
  box-shadow: none;
  border-color: var(--accent-500);
  color: var(--accent-700);
}
.body--dark .port-card--create:hover {
  color: var(--accent-400);
}
.plus-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-card-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.create-label {
  font-size: 13px;
  font-weight: 700;
}

/* Action buttons inside card */
.action-btn {
  opacity: 0.5;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}
.action-btn:hover {
  opacity: 1;
}
.action-btn--delete:hover {
  color: var(--q-negative) !important;
}

/* ยอดเงิน: แบบวางเป็นแถวเดียว "เริ่มต้น → ปัจจุบัน" แทนกล่องสองใบ อ่านเป็นทิศทาง
   เดียวกับตัวเลขการเติบโตด้านล่าง และเส้นคั่นย้ายมาอยู่ที่แถวนี้เลย (เดิมเป็น
   q-separator ใบแยก) */
.port-balances {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}
.balance-item {
  min-width: 0;
}
.balance-item--end {
  text-align: right;
}
.bal-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}
.balance-label {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.balance-value {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  font-weight: 700;
}

.growth-label {
  font-size: 11.5px;
  font-weight: 600;
}

/* ==========================================================
   Dialog Card — solid background
========================================================== */
.port-dialog {
  background: var(--bg-dialog) !important;
  border-radius: 20px;
  border: 1px solid var(--border-dialog);
  box-shadow: 0 24px 60px -10px rgba(0, 0, 0, 0.2);
}

.dialog-icon-box {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Input */
.rounded-input :deep(.q-field__control) {
  border-radius: 10px !important;
}
.rounded-input :deep(.q-field__control:hover) {
  border-color: var(--accent-500);
}

/* ==========================================================
   Buttons — อิง Journal
========================================================== */
.btn-primary-modern {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  border-radius: 11px;
  padding: 0 20px;
  height: 40px;
  font-size: 13px;
  letter-spacing: 0.01em;
  box-shadow: 0 2px 8px rgba(27, 54, 54, 0.2);
  transition: all 0.2s ease;
}
.btn-primary-modern:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(27, 54, 54, 0.28) !important;
}

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
</style>

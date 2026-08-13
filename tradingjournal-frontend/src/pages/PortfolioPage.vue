<script setup lang="ts">
import { onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { ref } from 'vue';
import { usePortfolioStore } from 'stores/PortfolioStore';
import type { Portfolio } from 'stores/PortfolioStore';

const $q = useQuasar();
const store = usePortfolioStore();

onMounted(() => {
  if (!store.hasLoadedData) {
    void store.loadPortfolios();
  }
});

// ── Create ─────────────────────────────────────────────────────────────────────
const createDialog = ref(false);
const portForm = ref({ name: '', initial_balance: null as number | null });

const openCreateDialog = () => {
  portForm.value = { name: '', initial_balance: null };
  createDialog.value = true;
};

const submitCreatePortfolio = () => {
  if (portForm.value.name && portForm.value.initial_balance !== null) {
    void store.createPortfolio(portForm.value.name, portForm.value.initial_balance);
    createDialog.value = false;
    $q.notify({ type: 'positive', message: 'Portfolio created successfully.', position: 'top' });
  } else {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields.', position: 'top' });
  }
};

// ── Edit ───────────────────────────────────────────────────────────────────────
const editDialog = ref(false);
const editForm = ref({ id: 0, name: '', initial_balance: null as number | null });

const openEditDialog = (port: Portfolio) => {
  editForm.value = { id: port.id, name: port.name, initial_balance: port.initial_balance };
  editDialog.value = true;
};

const submitEditPortfolio = () => {
  if (editForm.value.name && editForm.value.initial_balance !== null) {
    void store.updatePortfolio(
      editForm.value.id,
      editForm.value.name,
      editForm.value.initial_balance,
    );
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

const netPnl = (port: Portfolio) => port.current_balance - port.initial_balance;
</script>

<template>
  <q-page class="portfolio-page q-pa-md q-pa-sm-lg">
    <!-- ── Header ────────────────────────────────────────────────────────────── -->
    <div class="row items-end justify-between q-mb-xl q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none text-main tracking-tight">My Portfolios</h1>
        <div class="text-subtitle2 text-muted q-mt-xs">
          Manage all your trading accounts in one place.
        </div>
      </div>
      <q-btn
        unelevated
        icon="add"
        label="New Portfolio"
        class="btn-primary-modern text-white text-weight-bold"
        @click="openCreateDialog"
      />
    </div>

    <!-- ── Portfolio Grid ─────────────────────────────────────────────────────── -->
    <div class="row q-col-gutter-md">
      <div v-for="port in store.portfolios" :key="port.id" class="col-12 col-sm-6 col-md-4">
        <q-card
          class="port-card cursor-pointer"
          :class="{ 'port-card--active': store.activePortId === port.id }"
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
                    new Date(port.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  }}
                </div>
              </div>

              <div class="row items-center q-gutter-xs q-ml-sm">
                <q-badge v-if="store.activePortId === port.id" class="active-badge q-mr-xs">
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
            <div class="balance-grid q-mb-md">
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
              <div class="balance-item">
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

            <q-separator class="port-separator q-mb-md" />

            <!-- PnL Row -->
            <div class="row items-center justify-between">
              <span
                class="text-caption text-muted text-weight-bold text-uppercase"
                style="letter-spacing: 0.04em"
              >
                Net PnL
              </span>
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
                  }}{{ calculateGrowth(port.current_balance, port.initial_balance) }}%)
                </span>
              </div>
            </div>
          </q-card-section>
        </q-card>
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
/* ==========================================================
   CSS Variables
========================================================== */
.portfolio-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.03), 0 2px 6px -2px rgba(0, 0, 0, 0.02);
  --shadow-hover: 0 12px 28px -6px rgba(0, 0, 0, 0.08);

  --bg-dialog: #ffffff;
  --border-dialog: #e2e8f0;

  --bg-icon-primary: #eff6ff;
  --bg-icon-positive: #f0fdf4;
  --bg-icon-warning: #fffbeb;
  --bg-icon-negative: #fef2f2;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  transition: background-color 0.3s ease;
}

.body--dark .portfolio-page {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --bg-card-soft: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #23314b;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.3);
  --shadow-hover: 0 12px 28px -6px rgba(0, 0, 0, 0.5);

  --bg-dialog: #1a2540;
  --border-dialog: #2a3a58;

  --bg-icon-primary: rgba(59, 130, 246, 0.15);
  --bg-icon-positive: rgba(34, 197, 94, 0.15);
  --bg-icon-warning: rgba(245, 158, 11, 0.15);
  --bg-icon-negative: rgba(239, 68, 68, 0.15);
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
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease,
    border-color 0.25s ease;
}
.port-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
  border-color: rgba(59, 130, 246, 0.3);
}
.port-card--active {
  border-color: #3b82f6 !important;
  box-shadow:
    0 0 0 1px #3b82f6,
    var(--shadow-card) !important;
}

.active-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 20px;
  background: rgba(59, 130, 246, 0.12) !important;
  color: #3b82f6 !important;
  border: 1px solid rgba(59, 130, 246, 0.25);
}
.body--dark .active-badge {
  background: rgba(96, 165, 250, 0.15) !important;
  color: #60a5fa !important;
  border-color: rgba(96, 165, 250, 0.3);
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

/* Balance grid */
.balance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.balance-item {
  background: var(--bg-card-soft);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
}
.balance-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.balance-value {
  font-size: 14px;
  font-weight: 600;
}
.port-separator {
  background-color: var(--border-color);
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
  border-color: #3b82f6;
}

/* ==========================================================
   Buttons — อิง Journal
========================================================== */
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

<script setup lang="ts">
import { ref, watchEffect, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useGoalStore } from 'stores/GoalStore';
import { usePortfolioStore } from 'stores/PortfolioStore';

const $q = useQuasar();
const store = useGoalStore();
const portStore = usePortfolioStore();

const inputTarget = ref<number>(0);

const { safeLoad } = useSafeLoad();

onMounted(async () => {
  if (portStore.portfolios.length === 0) {
    await safeLoad(() => portStore.loadPortfolios(), 'โหลดพอร์ตโฟลิโอไม่สำเร็จ');
  }

  const activePort = portStore.activePortfolio;

  if (activePort) {
    await safeLoad(
      () =>
        store.loadGoalByMonth(activePort.id, new Date().getFullYear(), new Date().getMonth() + 1),
      'โหลดเป้าหมายประจำเดือนไม่สำเร็จ',
    );
  }
});

watchEffect(() => {
  inputTarget.value = store.monthlyPlan.targetProfit;
});

const hasGoal = computed(() => store.monthlyPlan.targetProfit > 0);

const isFutureMonth = computed(() => {
  const today = new Date();
  return (
    store.monthlyPlan.year > today.getFullYear() ||
    (store.monthlyPlan.year === today.getFullYear() &&
      store.monthlyPlan.month >= today.getMonth() + 1)
  );
});

const isPastMonth = computed(() => {
  const today = new Date();
  return (
    store.monthlyPlan.year < today.getFullYear() ||
    (store.monthlyPlan.year === today.getFullYear() &&
      store.monthlyPlan.month < today.getMonth() + 1)
  );
});

const changeMonth = async (offset: number) => {
  if (!portStore.activePortfolioId) {
    $q.notify({ type: 'warning', message: 'Please select a portfolio first', position: 'top' });
    return;
  }
  let newMonth = store.monthlyPlan.month + offset;
  let newYear = store.monthlyPlan.year;
  if (newMonth < 1) {
    newMonth = 12;
    newYear -= 1;
  } else if (newMonth > 12) {
    newMonth = 1;
    newYear += 1;
  }
  await store.loadGoalByMonth(portStore.activePortfolioId, newYear, newMonth);
};

const saveGoal = () => {
  if (!portStore.activePortfolioId) {
    $q.notify({ type: 'negative', message: 'Please select a portfolio first', position: 'top' });
    return;
  }
  if (inputTarget.value > 0) {
    void store.setTargetPnL(
      portStore.activePortfolioId,
      store.monthlyPlan.year,
      store.monthlyPlan.month,
      inputTarget.value,
    );
    $q.notify({ type: 'positive', message: 'Goal saved!', position: 'top' });
  } else {
    $q.notify({
      type: 'warning',
      message: 'Please enter an amount greater than 0',
      position: 'top',
    });
  }
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 });

// ── Achieved — fix bug: show correct sign based on actual value ───────────────
const achievedDisplay = computed(() => {
  const v = store.monthlyPlan.totalAchieved;
  if (v > 0) return '+' + fmtMoney(v);
  if (v < 0) return '-' + fmtMoney(v);
  return '$0.00';
});
const achievedClass = computed(() => {
  const v = store.monthlyPlan.totalAchieved;
  if (v > 0) return 'text-positive';
  if (v < 0) return 'text-negative';
  return 'text-muted';
});

// ── Progress badge ────────────────────────────────────────────────────────────
const progressBadge = computed(() => {
  const pct = store.monthlyPlan.progressPercent;
  if (pct >= 100) return { label: '🎯 Goal Reached', cls: 'badge-done' };
  if (pct >= 50) return { label: 'On Track', cls: 'badge-on-track' };
  return { label: 'Behind', cls: 'badge-behind' };
});
</script>

<template>
  <q-page class="goals-page q-pa-md q-pa-sm-lg">
    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="row items-end justify-between q-mb-xl q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none text-main tracking-tight">Monthly Goal</h1>
        <div class="text-subtitle2 text-muted q-mt-xs">
          Track your profit targets month by month.
        </div>
      </div>
    </div>

    <!-- ── Goal Card ──────────────────────────────────────────────────────── -->
    <q-card class="goal-card q-pa-lg q-mb-md">
      <!-- Month Navigator + Input -->
      <div class="row items-center justify-between q-mb-lg">
        <div class="row items-center">
          <q-btn
            flat
            round
            dense
            icon="chevron_left"
            class="nav-btn q-mr-xs"
            @click="changeMonth(-1)"
          />
          <div class="row items-center q-gutter-sm">
            <div class="icon-box bg-icon-primary text-primary">
              <q-icon name="track_changes" size="20px" />
            </div>
            <div>
              <div class="text-subtitle1 text-weight-bolder text-main">
                {{ store.monthlyPlan.monthName }} {{ store.monthlyPlan.year }}
              </div>
              <div class="text-caption text-muted">Monthly goal</div>
            </div>
          </div>
          <q-btn
            flat
            round
            dense
            icon="chevron_right"
            class="nav-btn q-ml-xs"
            :disable="isFutureMonth"
            @click="changeMonth(1)"
          />
        </div>

        <!-- Target input + save -->
        <div class="row items-center q-gutter-sm">
          <q-input
            v-model.number="inputTarget"
            type="number"
            dense
            outlined
            :dark="$q.dark.isActive"
            :disable="isPastMonth"
            class="goal-input"
            style="width: 140px"
            placeholder="Target ($)"
          >
            <template #prepend>
              <q-icon name="attach_money" size="16px" class="text-muted" />
            </template>
          </q-input>
          <q-btn
            unelevated
            label="Save"
            icon="check"
            class="btn-primary-modern text-white text-weight-bold"
            :disable="isPastMonth"
            @click="saveGoal"
          />
        </div>
      </div>

      <!-- Progress Section -->
      <template v-if="hasGoal">
        <div class="row items-center justify-between q-mb-xs">
          <div class="row items-center q-gutter-sm">
            <span
              class="text-caption text-muted text-weight-bold text-uppercase"
              style="letter-spacing: 0.05em"
            >
              Progress
            </span>
            <span class="progress-pct-badge" :class="progressBadge.cls">
              {{ progressBadge.label }}
            </span>
          </div>
          <span class="text-subtitle2 text-weight-bolder text-primary">
            {{ store.monthlyPlan.progressPercent.toFixed(1) }}%
          </span>
        </div>

        <q-linear-progress
          rounded
          size="8px"
          :value="store.monthlyPlan.progressPercent / 100"
          :color="store.monthlyPlan.progressPercent >= 100 ? 'positive' : 'primary'"
          :track-color="$q.dark.isActive ? 'grey-9' : 'grey-3'"
          class="q-mb-lg"
        />

        <!-- Achieved / Target / Remaining -->
        <div class="goal-stats-row">
          <div class="goal-stat-block">
            <div class="goal-stat-label">Achieved</div>
            <div class="text-h6 text-weight-bolder" :class="achievedClass">
              {{ achievedDisplay }}
            </div>
          </div>
          <div class="goal-stat-divider" />
          <div class="goal-stat-block">
            <div class="goal-stat-label">Target</div>
            <div class="text-h6 text-weight-bolder text-main">
              {{ fmtMoney(store.monthlyPlan.targetProfit) }}
            </div>
          </div>
          <div class="goal-stat-divider" />
          <div class="goal-stat-block">
            <div class="goal-stat-label">Remaining</div>
            <div
              class="text-h6 text-weight-bolder"
              :class="store.monthlyPlan.remainingTarget <= 0 ? 'text-positive' : 'text-warning'"
            >
              {{
                store.monthlyPlan.remainingTarget <= 0
                  ? '🎉 Done'
                  : fmtMoney(store.monthlyPlan.remainingTarget)
              }}
            </div>
          </div>
        </div>
      </template>

      <!-- No Goal -->
      <div v-else class="flex flex-center column q-py-lg">
        <q-icon name="outlined_flag" size="48px" class="text-muted q-mb-sm" style="opacity: 0.3" />
        <div class="text-body2 text-muted text-center" style="opacity: 0.6">
          No goal set for this month — enter a target above and hit Save
        </div>
      </div>
    </q-card>

    <!-- ── Daily Plan ─────────────────────────────────────────────────────── -->
    <template v-if="hasGoal">
      <q-card class="goal-card q-pa-md">
        <!-- Section header -->
        <div class="row items-center q-mb-md header-divider q-pb-sm">
          <div class="icon-box-sm bg-icon-purple text-purple q-mr-sm">
            <q-icon name="calendar_month" size="14px" />
          </div>
          <div class="text-subtitle1 text-weight-bolder text-main">Daily Trading Plan</div>
        </div>

        <!-- Day cards grid -->
        <div class="day-grid">
          <div
            v-for="day in store.monthlyPlan.dailyPlan"
            :key="day.day"
            class="day-card"
            :class="{
              'day-card--success': day.status === 'success',
              'day-card--missed': day.status === 'missed',
              'day-card--future': day.isFuture,
            }"
          >
            <!-- Date + status icon -->
            <div class="row items-center justify-between q-mb-xs">
              <span class="day-date">{{ day.dateLabel }}</span>
              <q-icon
                v-if="day.isFuture"
                name="schedule"
                size="14px"
                class="text-muted"
                style="opacity: 0.4"
              />
              <q-icon
                v-else-if="day.status === 'success'"
                name="check_circle"
                size="14px"
                color="positive"
              />
              <q-icon v-else name="cancel" size="14px" color="negative" />
            </div>

            <!-- Actual PnL (main number) -->
            <div
              class="day-actual"
              :class="{
                'text-positive': day.actual > 0,
                'text-negative': day.actual < 0,
                'text-muted': day.actual === 0,
              }"
            >
              <span v-if="day.actual > 0">+{{ fmtMoney(day.actual) }}</span>
              <span v-else-if="day.actual < 0">-{{ fmtMoney(day.actual) }}</span>
              <span v-else>$0.00</span>
            </div>

            <!-- Target -->
            <div class="day-meta">Target {{ fmtMoney(day.target) }}</div>

            <!-- Shortfall or surplus -->
            <div
              v-if="!day.isFuture"
              class="day-shortfall"
              :class="day.status === 'success' ? 'text-positive' : 'text-warning'"
            >
              <span v-if="day.status === 'success'"> +{{ fmtMoney(day.variance) }} surplus </span>
              <span v-else> -{{ fmtMoney(Math.abs(day.variance)) }} short </span>
            </div>
          </div>
        </div>
      </q-card>
    </template>
  </q-page>
</template>

<style scoped>
/* ==========================================================
   CSS Variables
========================================================== */
.goals-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.03), 0 2px 6px -2px rgba(0, 0, 0, 0.02);

  --bg-icon-primary: #eff6ff;
  --bg-icon-purple: #faf5ff;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  transition: background-color 0.3s ease;
}

.body--dark .goals-page {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --bg-card-soft: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #23314b;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.3);

  --bg-icon-primary: rgba(59, 130, 246, 0.15);
  --bg-icon-purple: rgba(168, 85, 247, 0.15);
}

/* ==========================================================
   Utilities
========================================================== */
.text-main {
  color: var(--text-main);
}
.text-muted {
  color: var(--text-muted);
}
.text-purple {
  color: #8b5cf6;
}
.tracking-tight {
  letter-spacing: -0.02em;
}
.header-divider {
  border-bottom: 1px solid var(--border-color);
}

.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-purple {
  background-color: var(--bg-icon-purple);
}

/* ==========================================================
   Cards
========================================================== */
.goal-card {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
}

/* ==========================================================
   Icon Boxes
========================================================== */
.icon-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.icon-box-sm {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ==========================================================
   Nav Button
========================================================== */
.nav-btn {
  color: var(--text-muted);
  transition: all 0.2s ease;
}
.nav-btn:hover {
  color: var(--text-main);
  background: var(--bg-card-soft);
}

/* ==========================================================
   Goal Input
========================================================== */
.goal-input :deep(.q-field__control) {
  border-radius: 10px !important;
}
.goal-input :deep(.q-field__control:hover) {
  border-color: #3b82f6;
}

/* ==========================================================
   Primary Button
========================================================== */
.btn-primary-modern {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  border-radius: 10px;
  padding: 0 20px;
  height: 40px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
  transition: all 0.2s ease;
}
.btn-primary-modern:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.45) !important;
}

/* ==========================================================
   Progress Badge
========================================================== */
.progress-pct-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  letter-spacing: 0.02em;
}
.badge-done {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.badge-on-track {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.22);
}
.badge-behind {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.22);
}

.body--dark .badge-done {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.3);
}
.body--dark .badge-on-track {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.3);
}
.body--dark .badge-behind {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.3);
}

/* ==========================================================
   Goal Stats Row (Achieved / Target / Remaining)
========================================================== */
.goal-stats-row {
  display: flex;
  align-items: stretch;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
}
.goal-stat-block {
  flex: 1;
  padding: 14px 16px;
}
.goal-stat-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}
.goal-stat-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

/* ==========================================================
   Daily Plan Grid
========================================================== */
.day-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}

.day-card {
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 10px 12px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.day-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.day-card--success {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.25);
}
.day-card--missed {
  background: rgba(239, 68, 68, 0.04);
  border-color: rgba(239, 68, 68, 0.15);
}
.day-card--future {
  opacity: 0.55;
}

.body--dark .day-card--success {
  background: rgba(52, 211, 153, 0.08);
  border-color: rgba(52, 211, 153, 0.2);
}
.body--dark .day-card--missed {
  background: rgba(248, 113, 113, 0.06);
  border-color: rgba(248, 113, 113, 0.15);
}

.day-date {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
.day-actual {
  font-size: 14px;
  font-weight: 700;
  margin: 4px 0 2px;
  letter-spacing: -0.01em;
}
.day-meta {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.75;
}
.day-shortfall {
  font-size: 10px;
  font-weight: 600;
  margin-top: 2px;
}

/* ==========================================================
   Responsive
========================================================== */
@media (max-width: 599px) {
  .day-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .goal-stats-row {
    flex-direction: column;
  }
  .goal-stat-divider {
    width: auto;
    height: 1px;
  }
}
</style>

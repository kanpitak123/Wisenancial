<script setup lang="ts">
import { ref, computed } from 'vue';

// ── Inputs ────────────────────────────────────────────────────────────────────
const selectedPair = ref('XAU/USD');
const accountBalance = ref<number>(1000);
const riskPercent = ref<number>(1);
const rewardRatio = ref<number>(2);
const currentPrice = ref<number>(3300);
const takeProfitPrice = ref<number>(3320);
const stopLossPrice = ref<number>(3290);

const pairOptions = [
  'XAU/USD',
  'EUR/USD',
  'GBP/USD',
  'AUD/USD',
  'USD/JPY',
  'USD/CAD',
  'NZD/USD',
  'USD/CHF',
];

// ── Pip / Point value per 1 standard lot (USD) ────────────────────────────────
// XAU/USD: $1 per 0.1 move per lot → $10 per full point per lot
// Major pairs: $10 per pip per lot
const pipValueMap: Record<string, number> = {
  'XAU/USD': 100, // gold: $1 per 0.01 move × lot × 100 = $100/lot/point
  'EUR/USD': 10,
  'GBP/USD': 10,
  'AUD/USD': 10,
  'NZD/USD': 10,
  'USD/CHF': 10,
  'USD/JPY': 6.7, // ~150 JPY/USD
  'USD/CAD': 7.3, // ~1.37 CAD/USD
};

// ── Core computed ─────────────────────────────────────────────────────────────
const riskAmount = computed(() => (accountBalance.value * riskPercent.value) / 100);
const rewardAmount = computed(() => riskAmount.value * rewardRatio.value);

// Distance in price units
const slDistance = computed(() => Math.abs(currentPrice.value - stopLossPrice.value));
const tpDistance = computed(() => Math.abs(takeProfitPrice.value - currentPrice.value));

// Actual RR from prices
const actualRR = computed(() =>
  slDistance.value > 0 ? (tpDistance.value / slDistance.value).toFixed(2) : '—',
);

// pip value for selected pair (per 1.0 lot, per 1-unit move)
const pipVal = computed(() => pipValueMap[selectedPair.value] || 10);

// ── Lot sizing ────────────────────────────────────────────────────────────────
// Formula: Lot = Risk$ / (SL_distance × pipValue)
const recommendedLot = computed(() => {
  if (slDistance.value <= 0 || riskAmount.value <= 0) return 0;
  return riskAmount.value / (slDistance.value * pipVal.value);
});

// Tier multipliers relative to recommended
// Tier 1 = conservative (50%), Tier 2 = moderate (75%), Tier 3 = recommended (100%), Max = aggressive (150%)
const tiers = computed(() => {
  const base = recommendedLot.value;
  const fmt = (n: number) => Math.max(0.01, Math.round(n * 100) / 100);
  return [
    {
      level: 1,
      label: 'Level 1 — Conservative',
      lot: fmt(base * 0.5),
      riskPct: riskPercent.value * 0.5,
      color: 'positive',
      bgClass: 'tier-bg--1',
      icon: 'shield',
      desc: '50% of risk — best for uncertain setups',
    },
    {
      level: 2,
      label: 'Level 2 — Moderate',
      lot: fmt(base * 0.75),
      riskPct: riskPercent.value * 0.75,
      color: 'primary',
      bgClass: 'tier-bg--2',
      icon: 'balance',
      desc: '75% of risk — balanced confidence',
    },
    {
      level: 3,
      label: 'Level 3 — Recommended',
      lot: fmt(base),
      riskPct: riskPercent.value,
      color: 'warning',
      bgClass: 'tier-bg--3',
      icon: 'star',
      desc: '100% of risk — high-confidence setup',
    },
    {
      level: 4,
      label: 'Max — Aggressive',
      lot: fmt(base * 1.5),
      riskPct: riskPercent.value * 1.5,
      color: 'negative',
      bgClass: 'tier-bg--4',
      icon: 'local_fire_department',
      desc: '150% of risk — only for strong conviction',
    },
  ];
});

// ── Risk profile cards ────────────────────────────────────────────────────────
const riskProfiles = computed(() => [
  {
    title: 'Conservative (0.5% – 1%)',
    icon: 'shield',
    iconColor: 'text-positive',
    bgClass: 'profile-bg--conservative',
    suitable: 'New traders, small accounts, high-volatility pairs',
    riskLevel: 'Low',
    riskColor: 'text-positive',
    bars: 1,
    desc: 'Risk very little per trade. Drawdowns stay small even during losing streaks. Ideal when the setup is not 100% clear or you are still building confidence.',
  },
  {
    title: 'Moderate (1% – 2%)',
    icon: 'balance',
    iconColor: 'text-primary',
    bgClass: 'profile-bg--moderate',
    suitable: 'Intermediate traders with tested strategies',
    riskLevel: 'Medium',
    riskColor: 'text-primary',
    bars: 2,
    desc: 'The most common professional range. Gives meaningful returns while keeping drawdowns manageable. Requires consistent execution and a positive expectancy system.',
  },
  {
    title: 'Aggressive (2% – 5%)',
    icon: 'local_fire_department',
    iconColor: 'text-warning',
    bgClass: 'profile-bg--aggressive',
    suitable: 'Experienced traders with strong edge and discipline',
    riskLevel: 'High',
    riskColor: 'text-warning',
    bars: 3,
    desc: 'Higher upside but deeper drawdowns. A 5-loss streak at 3% risk will cut your account by ~14%. Only suitable when you have a statistically proven edge and strict emotional control.',
  },
  {
    title: 'Extreme (5%+)',
    icon: 'warning_amber',
    iconColor: 'text-negative',
    bgClass: 'profile-bg--extreme',
    suitable: 'Not recommended for most traders',
    riskLevel: 'Very High',
    riskColor: 'text-negative',
    bars: 4,
    desc: 'Account-threatening territory. Five losses in a row at 5% will erase 23% of your capital. Even professional fund managers rarely exceed 2%. Treat this as a last resort or challenge account only.',
  },
]);

// Current profile based on riskPercent
const currentProfileIndex = computed(() => {
  const r = riskPercent.value;
  if (r <= 1) return 0;
  if (r <= 2) return 1;
  if (r <= 5) return 2;
  return 3;
});

const fmtPrice = (n: number) => n.toFixed(selectedPair.value.includes('JPY') ? 3 : 2);
</script>

<template>
  <q-page class="calc-page q-pa-md q-pa-sm-lg">
    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="row items-end justify-between q-mb-xl q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none text-main tracking-tight">
          Lot Calculator
        </h1>
        <div class="text-subtitle2 text-muted q-mt-xs">
          Calculate optimal position size before every trade.
        </div>
      </div>
    </div>

    <!-- ── Main Row ───────────────────────────────────────────────────────── -->
    <div class="row q-col-gutter-md q-mb-md">
      <!-- Left: Inputs -->
      <div class="col-12 col-md-5">
        <q-card class="calc-card q-pa-lg h-full flex column">
          <div class="row items-center q-mb-lg">
            <div class="icon-box bg-icon-primary text-primary q-mr-sm">
              <q-icon name="tune" size="20px" />
            </div>
            <div class="text-subtitle1 text-weight-bolder text-main">Trade Parameters</div>
          </div>

          <!-- Pair -->
          <div class="q-mb-md">
            <div class="field-label">Currency Pair</div>
            <q-select
              outlined
              dense
              v-model="selectedPair"
              :options="pairOptions"
              class="calc-input"
            />
          </div>

          <!-- Balance + Risk -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-6">
              <div class="field-label">Account Balance</div>
              <q-input
                outlined
                dense
                v-model.number="accountBalance"
                type="number"
                prefix="$"
                class="calc-input"
              />
            </div>
            <div class="col-6">
              <div class="field-label text-negative">Risk %</div>
              <q-input
                outlined
                dense
                v-model.number="riskPercent"
                type="number"
                suffix="%"
                class="calc-input risk-input"
              />
            </div>
          </div>

          <!-- Price inputs -->
          <div class="q-mb-md">
            <div class="field-label">Current Price</div>
            <q-input
              outlined
              dense
              v-model.number="currentPrice"
              type="number"
              class="calc-input"
            />
          </div>

          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-6">
              <div class="field-label text-positive">Take Profit</div>
              <q-input
                outlined
                dense
                v-model.number="takeProfitPrice"
                type="number"
                class="calc-input tp-input"
              />
            </div>
            <div class="col-6">
              <div class="field-label text-negative">Stop Loss</div>
              <q-input
                outlined
                dense
                v-model.number="stopLossPrice"
                type="number"
                class="calc-input sl-input"
              />
            </div>
          </div>

          <!-- RR + Distances -->
          <div class="row q-col-gutter-sm q-mb-lg">
            <div class="col-4">
              <div class="summary-box">
                <div class="summary-label">RR Ratio</div>
                <div class="summary-val text-primary">1:{{ actualRR }}</div>
              </div>
            </div>
            <div class="col-4">
              <div class="summary-box">
                <div class="summary-label">SL Dist.</div>
                <div class="summary-val text-negative">{{ fmtPrice(slDistance) }}</div>
              </div>
            </div>
            <div class="col-4">
              <div class="summary-box">
                <div class="summary-label">TP Dist.</div>
                <div class="summary-val text-positive">{{ fmtPrice(tpDistance) }}</div>
              </div>
            </div>
          </div>

          <q-separator class="calc-separator q-mb-md" />

          <!-- Risk / Reward summary -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div class="pnl-box pnl-box--loss">
                <div class="pnl-label">Max Loss</div>
                <div class="pnl-val text-negative">-${{ riskAmount.toFixed(2) }}</div>
                <div class="pnl-sub">{{ riskPercent }}% of balance</div>
              </div>
            </div>
            <div class="col-6">
              <div class="pnl-box pnl-box--profit">
                <div class="pnl-label">Target Profit</div>
                <div class="pnl-val text-positive">+${{ rewardAmount.toFixed(2) }}</div>
                <div class="pnl-sub">{{ (riskPercent * rewardRatio).toFixed(1) }}% of balance</div>
              </div>
            </div>
          </div>
        </q-card>
      </div>

      <!-- Right: Lot Tiers -->
      <div class="col-12 col-md-7">
        <q-card class="calc-card h-full flex column">
          <div class="row items-center q-pa-lg header-divider q-pb-md">
            <div class="icon-box bg-icon-purple text-purple q-mr-sm">
              <q-icon name="stacked_bar_chart" size="20px" />
            </div>
            <div>
              <div class="text-subtitle1 text-weight-bolder text-main">Position Sizing</div>
              <div class="text-caption text-muted q-mt-xs">
                Recommended lot size:
                <span class="text-weight-bolder text-primary">
                  {{ recommendedLot.toFixed(2) }} lots
                </span>
                based on your parameters
              </div>
            </div>
          </div>

          <div class="q-pa-lg flex-grow column q-gutter-md">
            <div
              v-for="tier in tiers"
              :key="tier.level"
              class="tier-card"
              :class="[tier.bgClass, tier.level === 3 ? 'tier-card--highlight' : '']"
            >
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-sm">
                  <div class="tier-icon-box" :class="`text-${tier.color}`">
                    <q-icon :name="tier.icon" size="16px" />
                  </div>
                  <div>
                    <div class="text-caption text-weight-bolder text-main">{{ tier.label }}</div>
                    <div class="text-caption text-muted">{{ tier.desc }}</div>
                  </div>
                </div>
                <div class="text-right q-ml-md" style="flex-shrink: 0">
                  <div class="tier-lot" :class="`text-${tier.color}`">
                    {{ tier.lot.toFixed(2) }}
                    <span class="tier-lot-unit">lots</span>
                  </div>
                  <div class="text-caption text-muted">{{ tier.riskPct.toFixed(2) }}% risk</div>
                </div>
              </div>
            </div>
          </div>
        </q-card>
      </div>
    </div>

    <!-- ── Risk Profile Cards ──────────────────────────────────────────────── -->
    <div class="row items-center q-mb-md">
      <div class="icon-box-sm bg-icon-warning text-warning q-mr-sm">
        <q-icon name="info_outline" size="14px" />
      </div>
      <div class="text-subtitle2 text-weight-bolder text-main">Risk Profile Guide</div>
    </div>

    <div class="row q-col-gutter-md">
      <div
        v-for="(profile, idx) in riskProfiles"
        :key="profile.title"
        class="col-12 col-sm-6 col-md-3"
      >
        <q-card
          class="calc-card profile-card q-pa-md flex column"
          :class="{ 'profile-card--active': idx === currentProfileIndex }"
        >
          <!-- Active badge -->
          <div v-if="idx === currentProfileIndex" class="profile-active-badge q-mb-sm">
            <q-icon name="my_location" size="12px" class="q-mr-xs" />Your current risk
          </div>

          <!-- Icon + Title -->
          <div class="row items-center q-gutter-sm q-mb-sm">
            <div class="profile-icon-box" :class="profile.bgClass">
              <q-icon :name="profile.icon" size="18px" :class="profile.iconColor" />
            </div>
            <div class="text-subtitle2 text-weight-bolder text-main">{{ profile.title }}</div>
          </div>

          <!-- Risk bars -->
          <div class="row q-gutter-xs q-mb-md">
            <div
              v-for="b in 4"
              :key="b"
              class="risk-bar"
              :class="b <= profile.bars ? `risk-bar--${profile.bars}` : 'risk-bar--empty'"
            />
          </div>

          <!-- Risk level -->
          <div class="row items-center justify-between q-mb-sm">
            <div
              class="text-caption text-muted text-weight-bold text-uppercase"
              style="letter-spacing: 0.04em"
            >
              Risk Level
            </div>
            <div class="text-caption text-weight-bolder" :class="profile.riskColor">
              {{ profile.riskLevel }}
            </div>
          </div>

          <!-- Suitable for -->
          <div class="q-mb-sm">
            <div
              class="text-caption text-muted text-weight-bold text-uppercase q-mb-xs"
              style="letter-spacing: 0.04em"
            >
              Suitable For
            </div>
            <div class="text-caption text-main">{{ profile.suitable }}</div>
          </div>

          <q-separator class="calc-separator q-my-sm" />

          <!-- Description -->
          <div class="text-caption text-muted" style="line-height: 1.6">{{ profile.desc }}</div>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<style scoped>
/* ==========================================================
   CSS Variables
========================================================== */
.calc-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.03), 0 2px 6px -2px rgba(0, 0, 0, 0.02);
  --shadow-hover: 0 10px 20px -3px rgba(0, 0, 0, 0.06);

  --bg-icon-primary: #eff6ff;
  --bg-icon-positive: #f0fdf4;
  --bg-icon-warning: #fffbeb;
  --bg-icon-negative: #fef2f2;
  --bg-icon-purple: #faf5ff;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
  transition: background-color 0.3s ease;
}

.body--dark .calc-page {
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
.h-full {
  height: 100%;
}
.flex-grow {
  flex-grow: 1;
}
.header-divider {
  border-bottom: 1px solid var(--border-color);
}

.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-warning {
  background-color: var(--bg-icon-warning);
}
.bg-icon-purple {
  background-color: var(--bg-icon-purple);
}

/* ==========================================================
   Cards
========================================================== */
.calc-card {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-card);
  transition: all 0.25s ease;
}
.calc-separator {
  background-color: var(--border-color);
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
   Form Fields
========================================================== */
.field-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.calc-input :deep(.q-field__control) {
  border-radius: 10px !important;
  background: var(--bg-card-soft);
}
.calc-input :deep(.q-field__control:hover) {
  border-color: #3b82f6;
}
.risk-input :deep(.q-field__control) {
  background: var(--bg-icon-negative) !important;
}
.tp-input :deep(.q-field__control) {
  background: var(--bg-icon-positive) !important;
}
.sl-input :deep(.q-field__control) {
  background: var(--bg-icon-negative) !important;
}

/* ==========================================================
   Summary Boxes
========================================================== */
.summary-box {
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 10px;
  text-align: center;
}
.summary-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.summary-val {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* ==========================================================
   PnL Boxes
========================================================== */
.pnl-box {
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  border: 1px solid var(--border-color);
}
.pnl-box--loss {
  background: var(--bg-icon-negative);
  border-color: rgba(239, 68, 68, 0.2);
}
.pnl-box--profit {
  background: var(--bg-icon-positive);
  border-color: rgba(34, 197, 94, 0.2);
}
.pnl-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.pnl-val {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.pnl-sub {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ==========================================================
   Tier Cards
========================================================== */
.tier-card {
  border-radius: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}
.tier-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-hover);
}
.tier-card--highlight {
  border-color: rgba(245, 158, 11, 0.4) !important;
}

.tier-bg--1 {
  background: rgba(16, 185, 129, 0.05);
}
.tier-bg--2 {
  background: rgba(59, 130, 246, 0.05);
}
.tier-bg--3 {
  background: rgba(245, 158, 11, 0.07);
}
.tier-bg--4 {
  background: rgba(239, 68, 68, 0.05);
}

.body--dark .tier-bg--1 {
  background: rgba(52, 211, 153, 0.07);
}
.body--dark .tier-bg--2 {
  background: rgba(96, 165, 250, 0.07);
}
.body--dark .tier-bg--3 {
  background: rgba(251, 191, 36, 0.09);
}
.body--dark .tier-bg--4 {
  background: rgba(248, 113, 113, 0.07);
}

.tier-icon-box {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--bg-card-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tier-lot {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.tier-lot-unit {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}

/* ==========================================================
   Profile Cards
========================================================== */
.profile-card {
  transition: all 0.25s ease;
}
.profile-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
}
.profile-card--active {
  border-color: #3b82f6 !important;
  box-shadow:
    0 0 0 1px #3b82f6,
    var(--shadow-card) !important;
}

.profile-active-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.25);
  width: fit-content;
}
.body--dark .profile-active-badge {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.3);
}

.profile-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.profile-bg--conservative {
  background: var(--bg-icon-positive);
}
.profile-bg--moderate {
  background: var(--bg-icon-primary);
}
.profile-bg--aggressive {
  background: var(--bg-icon-warning);
}
.profile-bg--extreme {
  background: var(--bg-icon-negative);
}

/* Risk bars */
.risk-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  transition: background 0.3s ease;
}
.risk-bar--empty {
  background: var(--border-color);
}
.risk-bar--1 {
  background: #10b981;
}
.risk-bar--2 {
  background: #3b82f6;
}
.risk-bar--3 {
  background: #f59e0b;
}
.risk-bar--4 {
  background: #ef4444;
}

/* ==========================================================
   Responsive
========================================================== */
@media (max-width: 599px) {
  .tier-lot {
    font-size: 16px;
  }
  .pnl-val {
    font-size: 15px;
  }
}
</style>

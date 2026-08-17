<script setup lang="ts">
/**
 * DCA AI Predictor แบบหลายหุ้น
 *
 * backend มี POST /analytics/dca-simulator ที่รับ "ทีละหุ้น" เท่านั้น (และยัง gate ด้วย
 * PaidTierGuard) การจำลองระดับพอร์ตจึงยิงวนทีละหุ้นแล้วรวมผลฝั่ง client ด้วย
 * utils/dca-aggregate.ts ซึ่ง port ตรรกะมาจาก AnalyticsPage ของโปรเจกต์เก่า
 */
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { useAnalyticsStore } from 'stores/AnalyticsStore';
import { WsBadge, WsCard, WsUpgradeNotice } from 'src/components/ui';
import { isPaidTierError } from 'src/utils/paid-tier';
import {
  aggregateAnalysis,
  aggregateScenarios,
  balanceAllocations,
  clampAllocationPercent,
  normalizeAllocations,
  type DcaAllocationRow,
  type DcaCombinedResult,
} from 'src/utils/dca-aggregate';
import StockSymbolPicker from 'components/stocks/StockSymbolPicker.vue';
import type { DCAScenario, DCASimulatorResponse } from 'src/types/analytics.types';

// เดิมรับ prop symbolOptions ที่เป็น "หุ้นที่ถืออยู่" เท่านั้น ทำให้วางแผน DCA
// หุ้นที่ยังไม่ได้ซื้อไม่ได้เลย — ตอนนี้ StockSymbolPicker ค้นจากรายชื่อหุ้นทั้งหมด

const $q = useQuasar();
const languageStore = useLanguageStore();
const analyticsStore = useAnalyticsStore();

const MIN_MONTHLY_AMOUNT = 100;

const currencyOptions = [
  { label: 'USD ($)', value: 'USD', symbol: '$' },
  { label: 'THB (฿)', value: 'THB', symbol: '฿' },
  { label: 'EUR (€)', value: 'EUR', symbol: '€' },
  { label: 'JPY (¥)', value: 'JPY', symbol: '¥' },
] as const;

const selectedCurrency = ref<(typeof currencyOptions)[number]['value']>('USD');
const monthlyAmount = ref(500);
const durationYears = ref(5);

const allocations = ref<DcaAllocationRow[]>([{ id: 1, symbol: '', allocationPercent: 100 }]);
const allocationIdCounter = ref(2);

const loading = ref(false);
const accessDenied = ref(false);
const result = ref<DcaCombinedResult | null>(null);

const currencySymbol = computed(
  () => currencyOptions.find((option) => option.value === selectedCurrency.value)?.symbol ?? '$',
);

const totalPercent = computed(() =>
  allocations.value.reduce(
    (sum, row) => sum + (Number.isFinite(row.allocationPercent) ? Number(row.allocationPercent) : 0),
    0,
  ),
);

/** ยอมให้คลาดจาก 100 ได้ ±0.5 เพราะการแบ่งเท่าๆ กันมีเศษปัด (เช่น 3 หุ้น = 33.33×3) */
const allocationValid = computed(() => {
  const filled = allocations.value.filter(
    (row) => row.symbol.trim() !== '' && row.allocationPercent > 0,
  );

  if (filled.length === 0) return false;

  return Math.abs(totalPercent.value - 100) <= 0.5;
});

const canSimulate = computed(
  () => allocationValid.value && monthlyAmount.value >= MIN_MONTHLY_AMOUNT && !loading.value,
);

const addRow = () => {
  allocations.value.push({
    id: allocationIdCounter.value,
    symbol: '',
    allocationPercent: 0,
  });
  allocationIdCounter.value += 1;
};

const removeRow = (rowId: number) => {
  if (allocations.value.length === 1) return;

  allocations.value = allocations.value.filter((row) => row.id !== rowId);
};

const autoBalance = () => {
  allocations.value = balanceAllocations(allocations.value);
};

const onPercentBlur = (rowId: number) => {
  const target = allocations.value.find((row) => row.id === rowId);

  if (!target) return;

  target.allocationPercent = clampAllocationPercent(target.allocationPercent);
};

const onSymbolChange = (rowId: number, symbol: string | null) => {
  const target = allocations.value.find((row) => row.id === rowId);

  if (!target) return;

  target.symbol = symbol?.toUpperCase() ?? '';
};

const SCENARIO_META: Record<
  DCAScenario['scenario'],
  { tone: string; icon: string; labelTh: string; labelEn: string }
> = {
  'Low Growth': {
    tone: 'negative',
    icon: 'trending_down',
    labelTh: 'ตลาดหมี (Bear)',
    labelEn: 'Bear',
  },
  'Medium Growth': {
    tone: 'warning',
    icon: 'trending_flat',
    labelTh: 'ปานกลาง (Medium)',
    labelEn: 'Medium',
  },
  'High Growth': {
    tone: 'positive',
    icon: 'trending_up',
    labelTh: 'ตลาดกระทิง (Bull)',
    labelEn: 'Bull',
  },
};

const scenarioLabel = (scenario: DCAScenario['scenario']) =>
  languageStore.isThai ? SCENARIO_META[scenario].labelTh : SCENARIO_META[scenario].labelEn;

const money = (value: number) =>
  `${currencySymbol.value}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const simulate = async () => {
  const normalized = normalizeAllocations(allocations.value);

  if (normalized.length === 0) {
    $q.notify({
      type: 'negative',
      message: languageStore.isThai ? 'โปรดเพิ่มหุ้นอย่างน้อย 1 ตัว' : 'Add at least one stock',
      position: 'top',
    });
    return;
  }

  if (monthlyAmount.value < MIN_MONTHLY_AMOUNT) {
    $q.notify({
      type: 'warning',
      message: languageStore.isThai
        ? `จำนวนเงินต้องอย่างน้อย ${MIN_MONTHLY_AMOUNT}`
        : `Monthly amount must be at least ${MIN_MONTHLY_AMOUNT}`,
      position: 'top',
    });
    return;
  }

  loading.value = true;
  accessDenied.value = false;

  try {
    const responses: { allocationPercent: number; data: DCASimulatorResponse }[] = [];

    // ยิงทีละหุ้นแบบ sequential โดยตั้งใจ — endpoint นี้เรียก LLM ต่อครั้ง
    // ยิงขนานกันหลายตัวพร้อมกันมีโอกาสโดน rate limit มากกว่าที่ประหยัดเวลาได้
    for (const allocation of normalized) {
      const amount = Number((monthlyAmount.value * allocation.weight).toFixed(2));

      if (amount <= 0) continue;

      const data = await analyticsStore.simulateDca({
        symbol: allocation.symbol,
        monthlyAmount: amount,
        durationYears: durationYears.value,
      });

      responses.push({
        allocationPercent: Number((allocation.weight * 100).toFixed(2)),
        data,
      });
    }

    if (responses.length === 0) {
      throw new Error(
        languageStore.isThai ? 'ไม่ได้ผลจำลองกลับมา' : 'No simulation responses returned',
      );
    }

    result.value = {
      currency: selectedCurrency.value,
      totalMonthlyAmount: monthlyAmount.value,
      durationYears: durationYears.value,
      scenarios: aggregateScenarios(responses),
      analysis: aggregateAnalysis(responses),
      breakdown: responses.map((entry) => ({
        ...entry.data,
        allocationPercent: entry.allocationPercent,
      })),
    };

    $q.notify({
      type: 'positive',
      message: languageStore.isThai ? 'จำลอง DCA สำเร็จ' : 'DCA simulation completed',
      position: 'top',
      timeout: 2000,
    });
  } catch (error) {
    result.value = null;
    accessDenied.value = isPaidTierError(error);

    if (!accessDenied.value) {
      $q.notify({
        type: 'negative',
        message:
          analyticsStore.error ??
          (languageStore.isThai ? 'จำลอง DCA ไม่สำเร็จ' : 'Failed to simulate DCA'),
        position: 'top',
      });
    }
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <WsCard tone="glass" class="dca-card" data-test="dca-predictor">
    <template #header>
      <div class="dca-header">
        <div class="dca-header__title">
          <q-icon name="auto_graph" size="22px" class="dca-header__icon" />
          <div>
            <h3 class="dca-title">DCA AI Predictor</h3>
            <p class="dca-subtitle">
              {{
                languageStore.isThai
                  ? 'จำลองกลยุทธ์ DCA แบบหลายหุ้นด้วยข้อมูลย้อนหลัง'
                  : 'Multi-stock dollar-cost averaging simulation from historical data'
              }}
            </p>
          </div>
        </div>
        <WsBadge kind="ai" color="primary" value="AI" outline />
      </div>
    </template>

    <WsUpgradeNotice
      v-if="accessDenied"
      dense
      data-test="dca-upgrade"
      message-th="การจำลอง DCA ด้วย AI เปิดให้เฉพาะสมาชิกแบบชำระเงิน"
      message-en="AI-powered DCA simulation is available on paid plans."
    />

    <div v-else class="dca-body">
      <!-- ── สัดส่วนหุ้น ─────────────────────────────────────────────────── -->
      <div class="dca-alloc">
        <div class="dca-alloc__head">
          <span class="dca-label">
            {{ languageStore.isThai ? 'พอร์ต DCA หลายหุ้น' : 'Multi-Stock Portfolio Mix' }}
          </span>
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            icon="balance"
            data-test="dca-auto-balance"
            :label="languageStore.isThai ? 'แบ่งเท่ากัน' : 'Auto-balance'"
            @click="autoBalance"
          />
        </div>

        <div v-for="row in allocations" :key="row.id" class="dca-alloc__row">
          <!-- เดิมเป็น q-select ที่มีแต่รายชื่อ ticker ค้นด้วยชื่อบริษัทไม่ได้
               เปลี่ยนมาใช้ตัวค้นหาชุดเดียวกับ Stock Terminal -->
          <StockSymbolPicker
            :model-value="row.symbol"
            :dark="$q.dark.isActive"
            class="dca-alloc__symbol"
            :label="languageStore.isThai ? 'สัญลักษณ์' : 'Symbol'"
            @update:model-value="(value) => onSymbolChange(row.id, value)"
          />
          <q-input
            v-model.number="row.allocationPercent"
            type="number"
            dense
            outlined
            :dark="$q.dark.isActive"
            suffix="%"
            class="dca-alloc__percent"
            min="0"
            max="100"
            @blur="onPercentBlur(row.id)"
          />
          <q-btn
            flat
            dense
            round
            icon="close"
            size="sm"
            :disable="allocations.length === 1"
            @click="removeRow(row.id)"
          />
        </div>

        <q-btn
          flat
          dense
          no-caps
          size="sm"
          icon="add"
          class="self-start"
          data-test="dca-add-row"
          :label="languageStore.isThai ? 'เพิ่มหุ้น' : 'Add stock'"
          @click="addRow"
        />

        <div class="dca-total">
          <div class="dca-total__row">
            <span class="dca-label">{{ languageStore.isThai ? 'รวมสัดส่วน' : 'Total' }}</span>
            <span
              class="dca-total__value"
              :class="allocationValid ? 'text-positive' : 'text-negative'"
              data-test="dca-total-percent"
            >
              {{ totalPercent.toFixed(2) }}%
            </span>
          </div>
          <q-linear-progress
            :value="Math.min(totalPercent / 100, 1)"
            :color="allocationValid ? 'positive' : 'warning'"
            size="8px"
            rounded
          />
          <div v-if="!allocationValid" class="dca-hint">
            {{
              languageStore.isThai
                ? 'สัดส่วนรวมต้องได้ 100% และต้องเลือกหุ้นอย่างน้อย 1 ตัว'
                : 'Allocations must total 100% with at least one stock selected'
            }}
          </div>
        </div>
      </div>

      <!-- ── พารามิเตอร์ ────────────────────────────────────────────────── -->
      <div class="dca-params">
        <q-select
          v-model="selectedCurrency"
          :options="currencyOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          dense
          outlined
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'สกุลเงิน' : 'Currency'"
        />
        <q-input
          v-model.number="monthlyAmount"
          type="number"
          dense
          outlined
          :dark="$q.dark.isActive"
          :prefix="currencySymbol"
          :label="languageStore.isThai ? 'ลงทุนต่อเดือน' : 'Monthly amount'"
          :min="MIN_MONTHLY_AMOUNT"
        />
        <q-input
          v-model.number="durationYears"
          type="number"
          dense
          outlined
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'ระยะเวลา (ปี)' : 'Duration (years)'"
          min="1"
          max="30"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="play_arrow"
          class="dca-run"
          data-test="dca-simulate"
          :disable="!canSimulate"
          :loading="loading"
          :label="languageStore.isThai ? 'จำลองพอร์ต DCA' : 'Simulate Portfolio DCA'"
          @click="simulate"
        />
      </div>

      <!-- ── ผลลัพธ์ ────────────────────────────────────────────────────── -->
      <div v-if="result" class="dca-results" data-test="dca-results">
        <div class="dca-scenarios">
          <div
            v-for="scenario in result.scenarios"
            :key="scenario.scenario"
            class="dca-scenario"
            :class="`is-${SCENARIO_META[scenario.scenario].tone}`"
            data-test="dca-scenario"
          >
            <div class="dca-scenario__head">
              <q-icon
                :name="SCENARIO_META[scenario.scenario].icon"
                :color="SCENARIO_META[scenario.scenario].tone"
                size="20px"
              />
              <span class="dca-scenario__name">{{ scenarioLabel(scenario.scenario) }}</span>
              <q-badge outline :color="SCENARIO_META[scenario.scenario].tone">
                {{ scenario.confidence }}%
              </q-badge>
            </div>
            <div class="dca-scenario__value">{{ money(scenario.finalValue) }}</div>
            <div class="dca-scenario__meta">
              <span>
                {{ languageStore.isThai ? 'ลงทุนรวม' : 'Invested' }}
                {{ money(scenario.totalInvested) }}
              </span>
              <span :class="scenario.totalReturn >= 0 ? 'text-positive' : 'text-negative'">
                {{ scenario.totalReturn >= 0 ? '+' : '' }}{{ money(scenario.totalReturn) }}
                ({{ percent(scenario.annualizedReturn) }} {{ languageStore.isThai ? 'ต่อปี' : 'p.a.' }})
              </span>
            </div>
          </div>
        </div>

        <div class="dca-breakdown">
          <div class="dca-label q-mb-sm">
            {{ languageStore.isThai ? 'แยกรายหุ้น' : 'Per-stock breakdown' }}
          </div>
          <div
            v-for="entry in result.breakdown"
            :key="entry.symbol"
            class="dca-breakdown__row"
            data-test="dca-breakdown-row"
          >
            <span class="dca-breakdown__symbol">{{ entry.symbol }}</span>
            <span class="dca-breakdown__weight">{{ entry.allocationPercent }}%</span>
            <span class="dca-breakdown__amount">
              {{ money(entry.monthlyAmount) }} / {{ languageStore.isThai ? 'เดือน' : 'mo' }}
            </span>
          </div>
        </div>

        <div v-if="result.analysis.historicalContext" class="dca-analysis">
          <div class="dca-label q-mb-xs">
            {{ languageStore.isThai ? 'บริบทย้อนหลัง' : 'Historical context' }}
          </div>
          <p class="dca-analysis__text">{{ result.analysis.historicalContext }}</p>
        </div>

        <div v-if="result.analysis.riskFactors.length" class="dca-analysis">
          <div class="dca-label q-mb-xs">
            {{ languageStore.isThai ? 'ปัจจัยความเสี่ยง' : 'Risk factors' }}
          </div>
          <ul class="dca-analysis__list">
            <li v-for="(factor, index) in result.analysis.riskFactors" :key="index">
              {{ factor }}
            </li>
          </ul>
        </div>

        <div v-if="result.analysis.recommendations.length" class="dca-analysis">
          <div class="dca-label q-mb-xs">
            {{ languageStore.isThai ? 'คำแนะนำ' : 'Recommendations' }}
          </div>
          <ul class="dca-analysis__list">
            <li v-for="(item, index) in result.analysis.recommendations" :key="index">
              {{ item }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </WsCard>
</template>

<style scoped>
.dca-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dca-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dca-header__icon {
  color: var(--q-primary);
}

.dca-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.dca-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.dca-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dca-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  font-weight: 600;
}

.dca-alloc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.dca-alloc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dca-alloc__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dca-alloc__symbol {
  flex: 1 1 auto;
  min-width: 0;
}

.dca-alloc__percent {
  width: 110px;
  flex: 0 0 auto;
}

.dca-total {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}

.dca-total__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dca-total__value {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.dca-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.dca-params {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  align-items: center;
}

.dca-run {
  border-radius: 10px;
  height: 40px;
}

.dca-results {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.dca-scenarios {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.dca-scenario {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.dca-scenario.is-positive {
  border-color: rgba(34, 197, 94, 0.45);
}

.dca-scenario.is-warning {
  border-color: rgba(245, 158, 11, 0.45);
}

.dca-scenario.is-negative {
  border-color: rgba(239, 68, 68, 0.45);
}

.dca-scenario__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dca-scenario__name {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
  flex: 1 1 auto;
}

.dca-scenario__value {
  font-size: 1.35rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.dca-scenario__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.dca-breakdown__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
}

.dca-breakdown__symbol {
  font-weight: 700;
  color: var(--text-primary);
  flex: 1 1 auto;
}

.dca-breakdown__weight,
.dca-breakdown__amount {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.dca-analysis__text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.dca-analysis__list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .dca-params {
    grid-template-columns: 1fr 1fr;
  }

  .dca-scenarios {
    grid-template-columns: 1fr;
  }
}
</style>

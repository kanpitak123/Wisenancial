<script setup lang="ts">
/**
 * เครื่องคำนวณต้นทุนเฉลี่ยเมื่อซื้อเพิ่ม (DCA averaging)
 *
 * Port ตรงจาก AverageCostCalculator.vue ของโปรเจกต์เก่า — คำนวณฝั่ง client ล้วน
 * ไม่มี API call เลย ที่ปรับคือผูกธีมกับ $q.dark.isActive แทนสีเข้มฝังตายตัว
 */
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { WsBadge, WsCard } from 'src/components/ui';

const $q = useQuasar();
const languageStore = useLanguageStore();

interface CurrencyOption {
  label: string;
  value: string;
  symbol: string;
}

const currencyOptions: CurrencyOption[] = [
  { label: 'THB (฿)', value: 'THB', symbol: '฿' },
  { label: 'USD ($)', value: 'USD', symbol: '$' },
  { label: 'EUR (€)', value: 'EUR', symbol: '€' },
  { label: 'JPY (¥)', value: 'JPY', symbol: '¥' },
  { label: 'GBP (£)', value: 'GBP', symbol: '£' },
];

const currentShares = ref<number | null>(null);
const currentAvgCost = ref<number | null>(null);
const currentPrice = ref<number | null>(null);
const additionalAmount = ref<number | null>(null);
const selectedCurrency = ref<string>('THB');

const currencySymbol = computed(
  () => currencyOptions.find((c) => c.value === selectedCurrency.value)?.symbol ?? '',
);

const num = (v: number | null): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const hasValidInputs = computed(
  () => num(currentPrice.value) > 0 && num(additionalAmount.value) > 0,
);

const result = computed(() => {
  const shares = num(currentShares.value);
  const avgCost = num(currentAvgCost.value);
  const price = num(currentPrice.value);
  const invest = num(additionalAmount.value);

  // หุ้นที่ซื้อเพิ่มคิดเป็นเศษส่วนได้ — โบรกที่ไม่รองรับเศษหุ้นจะปัดลง แต่ที่นี่เก็บค่าจริง
  // เพราะเป็นตัวเลขประมาณการล่วงหน้า
  const newSharesPurchased = price > 0 ? invest / price : 0;
  const totalShares = shares + newSharesPurchased;
  const originalInvestment = shares * avgCost;
  const totalInvestment = originalInvestment + invest;
  const newAvgCost = totalShares > 0 ? totalInvestment / totalShares : 0;
  const difference = newAvgCost - avgCost;

  return {
    newSharesPurchased,
    totalShares,
    totalInvestment,
    originalAvgCost: avgCost,
    newAvgCost,
    difference,
  };
});

const fmt = (value: number, digits = 2): string =>
  `${currencySymbol.value}${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

const fmtShares = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const differenceLabel = computed(() => {
  const diff = result.value.difference;

  if (Math.abs(diff) < 0.005) {
    return languageStore.isThai ? 'ต้นทุนเฉลี่ยไม่เปลี่ยนแปลง' : 'Average cost unchanged';
  }

  if (diff > 0) {
    return languageStore.isThai ? 'ต้นทุนเฉลี่ยเพิ่มขึ้น' : 'Average cost increased';
  }

  return languageStore.isThai ? 'ต้นทุนเฉลี่ยลดลง' : 'Average cost decreased';
});

const differenceTone = computed(() => {
  const diff = result.value.difference;

  if (Math.abs(diff) < 0.005) return 'grey-6';

  // ถัวเฉลี่ยลง (averaging down) คือผลลัพธ์ที่ดีสำหรับผู้ถือ
  return diff < 0 ? 'positive' : 'negative';
});

const resetForm = () => {
  currentShares.value = null;
  currentAvgCost.value = null;
  currentPrice.value = null;
  additionalAmount.value = null;
};
</script>

<template>
  <WsCard tone="glass" class="avg-cost-card" data-test="avg-cost-calculator">
    <template #header>
      <div class="avg-cost-header">
        <div class="avg-cost-header__title">
          <q-icon name="calculate" size="22px" class="avg-cost-header__icon" />
          <div>
            <h3 class="avg-cost-title">
              {{ languageStore.isThai ? 'เครื่องคำนวณต้นทุนเฉลี่ย' : 'Average Cost Calculator' }}
            </h3>
            <p class="avg-cost-subtitle">
              {{
                languageStore.isThai
                  ? 'คำนวณต้นทุนเฉลี่ยใหม่เมื่อซื้อเพิ่ม (DCA)'
                  : 'See your new average cost after buying more (DCA)'
              }}
            </p>
          </div>
        </div>
        <WsBadge kind="ai" color="primary" value="DCA" outline />
      </div>
    </template>

    <div class="avg-cost-body">
      <div class="avg-cost-inputs">
        <q-select
          v-model="selectedCurrency"
          :options="currencyOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          outlined
          dense
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'สกุลเงิน' : 'Currency'"
          class="avg-cost-field avg-cost-field--full"
        />

        <q-input
          v-model.number="currentShares"
          type="number"
          outlined
          dense
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'จำนวนหุ้นปัจจุบัน' : 'Current Shares'"
          class="avg-cost-field"
          min="0"
        />

        <q-input
          v-model.number="currentAvgCost"
          type="number"
          outlined
          dense
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'ต้นทุนเฉลี่ยปัจจุบัน' : 'Current Avg Cost'"
          :prefix="currencySymbol"
          class="avg-cost-field"
          min="0"
        />

        <q-input
          v-model.number="currentPrice"
          type="number"
          outlined
          dense
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'ราคาหุ้นปัจจุบัน' : 'Current Stock Price'"
          :prefix="currencySymbol"
          class="avg-cost-field"
          min="0"
        />

        <q-input
          v-model.number="additionalAmount"
          type="number"
          outlined
          dense
          :dark="$q.dark.isActive"
          :label="languageStore.isThai ? 'เงินลงทุนเพิ่ม' : 'Additional Investment'"
          :prefix="currencySymbol"
          class="avg-cost-field"
          min="0"
        />
      </div>

      <div class="avg-cost-results" :class="{ 'avg-cost-results--empty': !hasValidInputs }">
        <template v-if="hasValidInputs">
          <div class="result-grid">
            <div class="result-item">
              <span class="result-label">
                {{ languageStore.isThai ? 'หุ้นที่ซื้อเพิ่ม' : 'New Shares Purchased' }}
              </span>
              <span class="result-value" data-test="avg-cost-new-shares">
                {{ fmtShares(result.newSharesPurchased) }}
              </span>
            </div>
            <div class="result-item">
              <span class="result-label">
                {{ languageStore.isThai ? 'จำนวนหุ้นรวม' : 'Total Shares' }}
              </span>
              <span class="result-value">{{ fmtShares(result.totalShares) }}</span>
            </div>
            <div class="result-item">
              <span class="result-label">
                {{ languageStore.isThai ? 'เงินลงทุนรวม' : 'Total Investment' }}
              </span>
              <span class="result-value">{{ fmt(result.totalInvestment) }}</span>
            </div>
            <div class="result-item">
              <span class="result-label">
                {{ languageStore.isThai ? 'ต้นทุนเฉลี่ยเดิม' : 'Original Avg Cost' }}
              </span>
              <span class="result-value">{{ fmt(result.originalAvgCost) }}</span>
            </div>
          </div>

          <div class="result-highlight">
            <div class="result-highlight__main">
              <span class="result-label">
                {{ languageStore.isThai ? 'ต้นทุนเฉลี่ยใหม่' : 'New Average Cost' }}
              </span>
              <span class="result-highlight__value" data-test="avg-cost-new-avg">
                {{ fmt(result.newAvgCost) }}
              </span>
            </div>
            <div class="result-highlight__diff" :class="`text-${differenceTone}`">
              <q-icon
                :name="
                  result.difference < 0
                    ? 'arrow_downward'
                    : result.difference > 0
                      ? 'arrow_upward'
                      : 'remove'
                "
                size="16px"
              />
              <span>{{ differenceLabel }}</span>
              <span>({{ result.difference >= 0 ? '+' : '' }}{{ fmt(result.difference) }})</span>
            </div>
          </div>

          <div class="avg-cost-actions">
            <q-btn
              flat
              dense
              no-caps
              icon="restart_alt"
              :label="languageStore.isThai ? 'ล้างค่า' : 'Reset'"
              @click="resetForm"
            />
          </div>
        </template>

        <div v-else class="avg-cost-empty" data-test="avg-cost-empty">
          <q-icon name="calculate" size="36px" class="avg-cost-empty__icon" />
          <p>
            {{
              languageStore.isThai
                ? 'กรอกราคาหุ้นปัจจุบันและเงินลงทุนเพิ่มเพื่อคำนวณ'
                : 'Enter the current price and additional investment to calculate'
            }}
          </p>
        </div>
      </div>
    </div>
  </WsCard>
</template>

<style scoped>
.avg-cost-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.avg-cost-header__title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.avg-cost-header__icon {
  color: var(--q-primary);
  margin-top: 2px;
}

.avg-cost-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.avg-cost-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.avg-cost-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.avg-cost-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-content: start;
}

.avg-cost-field--full {
  grid-column: 1 / -1;
}

.avg-cost-results {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
}

.avg-cost-results--empty {
  align-items: center;
  justify-content: center;
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  font-weight: 600;
}

.result-value {
  font-size: 0.95rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.result-highlight {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(99, 102, 241, 0.12));
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.result-highlight__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.result-highlight__value {
  font-size: 1.4rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.result-highlight__diff {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
}

.avg-cost-actions {
  display: flex;
  justify-content: flex-end;
}

.avg-cost-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  color: var(--text-secondary);
  padding: 20px;
}

.avg-cost-empty__icon {
  color: rgba(99, 102, 241, 0.45);
}

@media (max-width: 900px) {
  .avg-cost-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .avg-cost-inputs {
    grid-template-columns: 1fr;
  }

  .result-grid {
    grid-template-columns: 1fr;
  }
}
</style>

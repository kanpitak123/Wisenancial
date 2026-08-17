<template>
  <div class="stock-valuation-widget" :class="{ 'dark-theme': $q.dark.isActive }">
    <!-- Header -->
    <div class="valuation-header">
      <div class="header-title">
        <q-icon name="account_balance" size="24px" class="q-mr-sm" color="primary" />
        <span>{{ languageStore.isThai ? 'มูลค่าพื้นฐาน DCF' : 'DCF Intrinsic Value' }}</span>
      </div>
      <q-btn
        flat
        round
        dense
        icon="refresh"
        :loading="loading"
        @click="fetchValuation"
        class="refresh-btn"
      >
        <q-tooltip>{{ languageStore.isThai ? 'รีเฟรช' : 'Refresh' }}</q-tooltip>
      </q-btn>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <q-spinner-dots size="40px" color="primary" />
      <p class="q-mt-sm text-muted">
        {{ languageStore.isThai ? 'กำลังคำนวณ DCF...' : 'Calculating DCF...' }}
      </p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <q-icon name="error_outline" size="40px" color="negative" />
      <p class="q-mt-sm text-negative">{{ error }}</p>
    </div>

    <!-- Content -->
    <div v-else-if="valuation" class="valuation-content">
      <!-- Valuation Bar -->
      <div class="valuation-bar-section">
        <div
          class="valuation-bar"
          :class="{ 'overvalued': valuation.isOvervalued, 'undervalued': !valuation.isOvervalued }"
        >
          <div class="bar-content">
            <q-icon
              :name="valuation.isOvervalued ? 'trending_up' : 'trending_down'"
              size="20px"
              class="q-mr-sm"
            />
            <span class="bar-label">
              {{ valuation.isOvervalued
                ? (languageStore.isThai ? 'สูงกว่ามูลค่า' : 'OVERVALUATION')
                : (languageStore.isThai ? 'ต่ำกว่ามูลค่า' : 'UNDERVALUATION')
              }}
            </span>
            <span class="bar-percentage">{{ Math.abs(valuation.valuationPercentage).toFixed(1) }}%</span>
          </div>
          <q-linear-progress
            :value="Math.min(Math.abs(valuation.valuationPercentage) / 100, 1)"
            :color="valuation.isOvervalued ? 'negative' : 'positive'"
            track-color="transparent"
            class="bar-progress"
          />
        </div>
      </div>

      <!-- Current vs Intrinsic -->
      <div class="price-comparison">
        <div class="price-box current">
          <div class="price-label">{{ languageStore.isThai ? 'ราคาปัจจุบัน' : 'Current Price' }}</div>
          <div class="price-value">${{ formatNumber(valuation.currentPrice) }}</div>
        </div>
        <div class="price-arrow">
          <q-icon name="arrow_forward" size="24px" color="grey-6" />
        </div>
        <div class="price-box intrinsic" :class="{ 'overvalued': valuation.isOvervalued, 'undervalued': !valuation.isOvervalued }">
          <div class="price-label">{{ languageStore.isThai ? 'มูลค่าพื้นฐาน' : 'Intrinsic Value' }}</div>
          <div class="price-value">${{ formatNumber(valuation.intrinsicValue) }}</div>
        </div>
      </div>

      <!-- Scenario Tabs -->
      <div class="scenario-tabs">
        <div class="tabs-header">
          <q-btn
            v-for="scenario in scenarios"
            :key="scenario.key"
            :flat="activeScenario !== scenario.key"
            :unelevated="activeScenario === scenario.key"
            :color="activeScenario === scenario.key ? scenario.color : 'grey-7'"
            :label="scenario.label"
            @click="activeScenario = scenario.key"
            class="scenario-tab"
            no-caps
            rounded
            dense
          />
        </div>

        <div class="scenario-content">
          <div v-if="activeScenario === 'bear'" class="scenario-card bear">
            <div class="scenario-header">
              <q-icon name="trending_down" size="20px" color="negative" class="q-mr-sm" />
              <span>{{ languageStore.isThai ? 'กรณีหมี (ระดับความเสี่ยงสูง)' : 'Bear Case (High Risk)' }}</span>
            </div>
            <div class="scenario-price">${{ formatNumber(valuation.scenarios.bear.price) }}</div>
            <div class="scenario-growth">
              {{ languageStore.isThai ? 'อัตราการเติบโต:' : 'Growth Rate:' }}
              {{ (valuation.scenarios.bear.growthRate * 100).toFixed(1) }}%
            </div>
            <div v-if="valuation.scenarios.bear.price > 0 && valuation.currentPrice > 0" class="scenario-potential">
              <span :class="getPotentialClass(valuation.scenarios.bear.price)">
                {{ formatPotential(valuation.scenarios.bear.price) }}
              </span>
            </div>
            <div class="scenario-reasoning">
              <q-icon name="lightbulb" size="14px" class="q-mr-xs" color="warning" />
              <span>{{ valuation.scenarios.bear.reasoning }}</span>
            </div>
          </div>

          <div v-else-if="activeScenario === 'base'" class="scenario-card base">
            <div class="scenario-header">
              <q-icon name="balance" size="20px" color="primary" class="q-mr-sm" />
              <span>{{ languageStore.isThai ? 'กรณีฐาน (สมเหตุสมผล)' : 'Base Case (Fair Value)' }}</span>
            </div>
            <div class="scenario-price">${{ formatNumber(valuation.scenarios.base.price) }}</div>
            <div class="scenario-growth">
              {{ languageStore.isThai ? 'อัตราการเติบโต:' : 'Growth Rate:' }}
              {{ (valuation.scenarios.base.growthRate * 100).toFixed(1) }}%
            </div>
            <div v-if="valuation.scenarios.base.price > 0 && valuation.currentPrice > 0" class="scenario-potential">
              <span :class="getPotentialClass(valuation.scenarios.base.price)">
                {{ formatPotential(valuation.scenarios.base.price) }}
              </span>
            </div>
            <div class="scenario-reasoning">
              <q-icon name="lightbulb" size="14px" class="q-mr-xs" color="primary" />
              <span>{{ valuation.scenarios.base.reasoning }}</span>
            </div>
          </div>

          <div v-else class="scenario-card bull">
            <div class="scenario-header">
              <q-icon name="trending_up" size="20px" color="positive" class="q-mr-sm" />
              <span>{{ languageStore.isThai ? 'กรณีกระทิง (โอกาสเติบโต)' : 'Bull Case (Growth Opportunity)' }}</span>
            </div>
            <div class="scenario-price">${{ formatNumber(valuation.scenarios.bull.price) }}</div>
            <div class="scenario-growth">
              {{ languageStore.isThai ? 'อัตราการเติบโต:' : 'Growth Rate:' }}
              {{ (valuation.scenarios.bull.growthRate * 100).toFixed(1) }}%
            </div>
            <div v-if="valuation.scenarios.bull.price > 0 && valuation.currentPrice > 0" class="scenario-potential">
              <span :class="getPotentialClass(valuation.scenarios.bull.price)">
                {{ formatPotential(valuation.scenarios.bull.price) }}
              </span>
            </div>
            <div class="scenario-reasoning">
              <q-icon name="lightbulb" size="14px" class="q-mr-xs" color="positive" />
              <span>{{ valuation.scenarios.bull.reasoning }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Wall Street Target Price -->
      <div v-if="hasWallStreetTargets" class="wall-street-section">
        <div class="section-title">
          <q-icon name="analytics" size="18px" class="q-mr-xs" />
          {{ languageStore.isThai ? 'เป้าหมายราคา Wall Street' : 'Wall Street Target Price' }}
        </div>

        <!-- Visual Price Range Bar -->
        <div class="price-range-container">
          <div class="price-range-bar">
            <div class="range-track">
              <div
                class="range-fill"
                :style="getWallStreetBarStyle()"
              />
            </div>
            <!-- Markers -->
            <div
              v-if="valuation.wallStreetTargets.low"
              class="price-marker low"
              :style="getMarkerStyle(valuation.wallStreetTargets.low)"
            >
              <div class="marker-dot" />
              <div class="marker-label">
                <div class="marker-value">${{ formatNumber(valuation.wallStreetTargets.low) }}</div>
                <div class="marker-tag">Low</div>
              </div>
            </div>
            <div
              v-if="valuation.wallStreetTargets.mean"
              class="price-marker mean"
              :style="getMarkerStyle(valuation.wallStreetTargets.mean)"
            >
              <div class="marker-dot primary" />
              <div class="marker-label">
                <div class="marker-value">${{ formatNumber(valuation.wallStreetTargets.mean) }}</div>
                <div class="marker-tag">Avg</div>
              </div>
            </div>
            <div
              v-if="valuation.wallStreetTargets.high"
              class="price-marker high"
              :style="getMarkerStyle(valuation.wallStreetTargets.high)"
            >
              <div class="marker-dot" />
              <div class="marker-label">
                <div class="marker-value">${{ formatNumber(valuation.wallStreetTargets.high) }}</div>
                <div class="marker-tag">High</div>
              </div>
            </div>
            <!-- Current Price Indicator -->
            <div
              v-if="valuation.currentPrice > 0"
              class="price-marker current"
              :style="getMarkerStyle(valuation.currentPrice)"
            >
              <div class="marker-triangle" />
              <div class="marker-label current-label">
                <div class="marker-tag current-tag">Now</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Target Metrics -->
        <div class="target-metrics">
          <div v-if="valuation.wallStreetTargets.high && valuation.currentPrice > 0" class="metric upside">
            <q-icon name="arrow_upward" size="14px" class="q-mr-xs" />
            <span class="metric-label">{{ languageStore.isThai ? 'Upside สูงสุด' : 'Max Upside' }}</span>
            <span class="metric-value positive">+{{ calculateUpside(valuation.wallStreetTargets.high) }}%</span>
          </div>
          <div v-if="valuation.wallStreetTargets.low && valuation.currentPrice > 0" class="metric downside">
            <q-icon name="arrow_downward" size="14px" class="q-mr-xs" />
            <span class="metric-label">{{ languageStore.isThai ? 'Downside ต่ำสุด' : 'Max Downside' }}</span>
            <span class="metric-value negative">{{ calculateUpside(valuation.wallStreetTargets.low) }}%</span>
          </div>
        </div>
      </div>

      <!-- DCF Inputs (Collapsible) -->
      <q-expansion-item
        :label="languageStore.isThai ? 'พารามิเตอร์ DCF' : 'DCF Parameters'"
        header-class="expansion-header"
        dense
      >
        <div class="dcf-params">
          <div class="param-item">
            <span class="param-label">
              {{ languageStore.isThai ? 'Free Cash Flow' : 'Free Cash Flow' }}
              <q-icon
                v-if="valuation.dcfInputs.isEstimated"
                name="info"
                size="14px"
                color="warning"
                class="q-ml-xs"
              >
                <q-tooltip>{{ languageStore.isThai ? 'ค่าประมาณการจาก EBITDA/Net Income' : 'Estimated from EBITDA/Net Income' }}</q-tooltip>
              </q-icon>
            </span>
            <span class="param-value">
              {{ formatCurrency(valuation.dcfInputs.freeCashFlow) }}
              <q-badge v-if="valuation.dcfInputs.isEstimated" color="warning" text-color="black" class="q-ml-xs" dense>
                {{ languageStore.isThai ? 'ประมาณ' : 'Est.' }}
              </q-badge>
            </span>
          </div>
          <div class="param-item">
            <span class="param-label">{{ languageStore.isThai ? 'อัตราการเติบโต' : 'Growth Rate' }}</span>
            <span class="param-value">{{ (valuation.dcfInputs.growthRate * 100).toFixed(1) }}%</span>
          </div>
          <div class="param-item">
            <span class="param-label">{{ languageStore.isThai ? 'อัตราส่วนลด' : 'Discount Rate' }}</span>
            <span class="param-value">{{ (valuation.dcfInputs.discountRate * 100).toFixed(1) }}%</span>
          </div>
          <div class="param-item">
            <span class="param-label">{{ languageStore.isThai ? 'อัตราเติบโตขั้นต่ำ' : 'Terminal Growth' }}</span>
            <span class="param-value">{{ (valuation.dcfInputs.terminalGrowthRate * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </q-expansion-item>
    </div>

    <!-- No Data State -->
    <div v-else class="no-data-state">
      <q-icon name="analytics" size="40px" color="grey-5" />
      <p class="q-mt-sm text-muted">
        {{ languageStore.isThai ? 'ไม่มีข้อมูลการประเมินมูลค่า' : 'No valuation data available' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { api } from 'src/boot/axios';
import { useLanguageStore } from 'stores/LanguageStore';

const $q = useQuasar();
const languageStore = useLanguageStore();

// Props
const props = defineProps<{
  symbol: string;
}>();

// State
const loading = ref(false);
const error = ref<string | null>(null);
const valuation = ref<{
  currentPrice: number;
  intrinsicValue: number;
  valuationPercentage: number;
  isOvervalued: boolean;
  scenarios: {
    bear: { price: number; growthRate: number; reasoning: string };
    base: { price: number; growthRate: number; reasoning: string };
    bull: { price: number; growthRate: number; reasoning: string };
  };
  wallStreetTargets: {
    low: number | null;
    mean: number | null;
    high: number | null;
  };
  dcfInputs: {
    freeCashFlow: number | null;
    growthRate: number;
    discountRate: number;
    terminalGrowthRate: number;
    sharesOutstanding: number | null;
    isEstimated?: boolean;
  };
} | null>(null);

const activeScenario = ref<'bear' | 'base' | 'bull'>('base');

// Computed
const scenarios = computed(() => [
  { key: 'bear' as const, label: languageStore.isThai ? 'หมี' : 'Bear', color: 'negative' },
  { key: 'base' as const, label: languageStore.isThai ? 'ฐาน' : 'Base', color: 'primary' },
  { key: 'bull' as const, label: languageStore.isThai ? 'กระทิง' : 'Bull', color: 'positive' },
]);

const hasWallStreetTargets = computed(() => {
  if (!valuation.value) return false;
  const { low, mean, high } = valuation.value.wallStreetTargets;
  return low !== null || mean !== null || high !== null;
});

// Methods
const formatNumber = (num: number | null): string => {
  if (num === null || num === undefined) return '-';
  if (num === 0) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCurrency = (num: number | null): string => {
  if (num === null || num === undefined) return '-';
  if (num === 0) return '$0';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getPotentialClass = (targetPrice: number): string => {
  if (!valuation.value) return '';
  const diff = ((targetPrice - valuation.value.currentPrice) / valuation.value.currentPrice) * 100;
  if (diff > 0) return 'positive';
  if (diff < 0) return 'negative';
  return '';
};

const formatPotential = (targetPrice: number): string => {
  if (!valuation.value || valuation.value.currentPrice === 0) return '';
  const diff = ((targetPrice - valuation.value.currentPrice) / valuation.value.currentPrice) * 100;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
};

// Calculate upside/downside percentage from current price
const calculateUpside = (targetPrice: number | null): string => {
  if (!targetPrice || !valuation.value || valuation.value.currentPrice === 0) return '0.0';
  const diff = ((targetPrice - valuation.value.currentPrice) / valuation.value.currentPrice) * 100;
  return diff.toFixed(1);
};

// Get position style for price marker on the range bar
const getMarkerStyle = (price: number | null): Record<string, string> => {
  if (!price || !valuation.value) return { left: '0%' };

  const { low, high } = valuation.value.wallStreetTargets;
  if (!low || !high || low === high) return { left: '50%' };

  // Calculate percentage position within the range
  const range = high - low;
  const position = ((price - low) / range) * 100;

  // Clamp between 0% and 100%
  const clampedPosition = Math.max(0, Math.min(100, position));

  return { left: `${clampedPosition}%` };
};

// Get style for the range fill bar
const getWallStreetBarStyle = (): Record<string, string> => {
  if (!valuation.value) return { width: '100%' };

  const { low, high } = valuation.value.wallStreetTargets;
  if (!low || !high || low === high) return { width: '100%' };

  // The fill represents the range from low to high
  return { width: '100%' };
};

const fetchValuation = async () => {
  if (!props.symbol) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await api.get(`/assets/valuation/${props.symbol}`);
    valuation.value = response.data;
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string } } };
    console.error('Error fetching valuation:', err);
    error.value = e.response?.data?.message ||
      (languageStore.isThai ? 'ไม่สามารถโหลดข้อมูลได้' : 'Failed to load valuation data');
  } finally {
    loading.value = false;
  }
};

// Watch for symbol changes
watch(() => props.symbol, (newSymbol) => {
  if (newSymbol) {
    void fetchValuation();
  }
}, { immediate: true });
</script>

<style scoped>
.stock-valuation-widget {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  padding: 20px;
}

.stock-valuation-widget.dark-theme {
  background: var(--bg-card, #1e293b);
  border-color: var(--border-color, #334155);
}

/* Header */
.valuation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  display: flex;
  align-items: center;
}

.dark-theme .header-title {
  color: var(--text-primary, #f8fafc);
}

.refresh-btn {
  transition: transform 0.2s ease;
}

.refresh-btn:hover {
  transform: rotate(180deg);
}

/* Loading & Error States */
.loading-state,
.error-state,
.no-data-state {
  text-align: center;
  padding: 40px 20px;
}

.text-muted {
  color: var(--text-secondary, #64748b);
  font-size: 14px;
}

.text-negative {
  color: var(--loss-color, #ef4444);
  font-size: 14px;
}

/* Valuation Bar */
.valuation-bar-section {
  margin-bottom: 20px;
}

.valuation-bar {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-subtle, #f1f5f9);
}

.dark-theme .valuation-bar {
  background: rgba(255, 255, 255, 0.05);
}

.bar-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-weight: 700;
}

.valuation-bar.overvalued .bar-content {
  color: var(--loss-color, #ef4444);
}

.valuation-bar.undervalued .bar-content {
  color: var(--profit-color, #10b981);
}

.bar-label {
  margin-right: 8px;
}

.bar-percentage {
  font-size: 20px;
}

.bar-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
}

/* Price Comparison */
.price-comparison {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-subtle, #f1f5f9);
  border-radius: 12px;
}

.dark-theme .price-comparison {
  background: rgba(255, 255, 255, 0.05);
}

.price-box {
  flex: 1;
  text-align: center;
}

.price-label {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.price-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.dark-theme .price-value {
  color: var(--text-primary, #f8fafc);
}

.price-box.intrinsic.overvalued .price-value {
  color: var(--loss-color, #ef4444);
}

.price-box.intrinsic.undervalued .price-value {
  color: var(--profit-color, #10b981);
}

.price-arrow {
  flex-shrink: 0;
}

/* Scenario Tabs */
.scenario-tabs {
  margin-bottom: 20px;
}

.tabs-header {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.scenario-tab {
  flex: 1;
}

.scenario-content {
  min-height: 140px;
}

.scenario-card {
  background: var(--bg-card, #ffffff);
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.dark-theme .scenario-card {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-color, #334155);
}

.scenario-card.bear {
  border-color: var(--loss-color, #ef4444);
}

.scenario-card.base {
  border-color: var(--primary-accent, #4f46e5);
}

.scenario-card.bull {
  border-color: var(--profit-color, #10b981);
}

.scenario-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scenario-price {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  margin-bottom: 8px;
}

.dark-theme .scenario-price {
  color: var(--text-primary, #f8fafc);
}

.scenario-growth {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin-bottom: 8px;
}

.scenario-potential {
  font-size: 16px;
  font-weight: 600;
}

.scenario-potential .positive {
  color: var(--profit-color, #10b981);
}

.scenario-potential .negative {
  color: var(--loss-color, #ef4444);
}

/* Scenario Reasoning */
.scenario-reasoning {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-subtle, #f1f5f9);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  display: flex;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
  line-height: 1.5;
}

.dark-theme .scenario-reasoning {
  background: rgba(255, 255, 255, 0.05);
}

/* Wall Street Targets */
.wall-street-section {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-subtle, #f1f5f9);
  border-radius: 12px;
}

.dark-theme .wall-street-section {
  background: rgba(255, 255, 255, 0.05);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Price Range Bar */
.price-range-container {
  margin-bottom: 16px;
}

.price-range-bar {
  position: relative;
  height: 60px;
  margin: 0 8px;
}

.range-track {
  position: absolute;
  top: 24px;
  left: 0;
  right: 0;
  height: 8px;
  background: var(--bg-card, #e2e8f0);
  border-radius: 4px;
  overflow: hidden;
}

.dark-theme .range-track {
  background: rgba(255, 255, 255, 0.1);
}

.range-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg,
    var(--loss-color, #ef4444) 0%,
    var(--primary-accent, #4f46e5) 50%,
    var(--profit-color, #10b981) 100%
  );
  opacity: 0.3;
  border-radius: 4px;
}

/* Price Markers */
.price-marker {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.marker-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-secondary, #64748b);
  border: 2px solid var(--bg-card, #ffffff);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  margin-top: 18px;
  z-index: 2;
}

.dark-theme .marker-dot {
  border-color: var(--bg-card, #1e293b);
}

.marker-dot.primary {
  background: var(--primary-accent, #4f46e5);
  width: 14px;
  height: 14px;
}

.price-marker.low .marker-dot {
  background: var(--loss-color, #ef4444);
}

.price-marker.high .marker-dot {
  background: var(--profit-color, #10b981);
}

.price-marker.mean .marker-dot {
  background: var(--primary-accent, #4f46e5);
}

.marker-triangle {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 12px solid var(--text-primary, #1e293b);
  margin-top: 16px;
  z-index: 3;
}

.dark-theme .marker-triangle {
  border-top-color: var(--text-primary, #f8fafc);
}

.marker-label {
  text-align: center;
  margin-top: 4px;
}

.marker-value {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  white-space: nowrap;
}

.dark-theme .marker-value {
  color: var(--text-primary, #f8fafc);
}

.marker-tag {
  font-size: 10px;
  color: var(--text-secondary, #64748b);
  text-transform: uppercase;
  margin-top: 2px;
}

.current-label {
  margin-top: 2px;
}

.current-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  background: var(--bg-card, #ffffff);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color, #e2e8f0);
}

.dark-theme .current-tag {
  color: var(--text-primary, #f8fafc);
  background: var(--bg-card, #1e293b);
  border-color: var(--border-color, #334155);
}

/* Target Metrics */
.target-metrics {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color, #e2e8f0);
}

.metric {
  display: flex;
  align-items: center;
  font-size: 13px;
}

.metric-label {
  color: var(--text-secondary, #64748b);
  margin-right: 4px;
}

.metric-value {
  font-weight: 700;
}

.metric-value.positive {
  color: var(--profit-color, #10b981);
}

.metric-value.negative {
  color: var(--loss-color, #ef4444);
}

/* DCF Parameters */
.expansion-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
}

.dcf-params {
  padding: 12px 16px;
}

.param-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color, #e2e8f0);
}

.param-item:last-child {
  border-bottom: none;
}

.param-label {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}

.param-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}

.dark-theme .param-value {
  color: var(--text-primary, #f8fafc);
}

/* Responsive */
@media (max-width: 480px) {
  .stock-valuation-widget {
    padding: 16px;
  }

  .price-comparison {
    flex-direction: column;
    gap: 8px;
  }

  .price-arrow {
    transform: rotate(90deg);
  }

  .targets-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .tabs-header {
    flex-wrap: wrap;
  }

  .scenario-tab {
    min-width: 80px;
  }
}
</style>

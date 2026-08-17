<script setup lang="ts">
/**
 * AI Risk Analysis — ต่อกับ AiStore.analyzeRisk() (POST /ai/portfolio/risk-analysis)
 *
 * แสดง gauge คะแนน 0-100 + legend 3 ระดับ + ตาราง fundamentals รายหุ้น (Beta/D-E/P-E/
 * น้ำหนักพอร์ต) ตามต้นฉบับ ค่าปัจจัยพื้นฐานมาจาก holdingsData ที่ backend คืนกลับมา
 * (backend เป็นคนไปดึง fundamentals เอง ไม่ใช่ frontend ส่งไป)
 */
import { computed } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { useAiStore } from 'stores/AiStore';
import { WsAiLoader, WsBadge, WsCard } from 'src/components/ui';
import type { PortfolioRiskHolding } from 'src/types/ai.types';

const props = defineProps<{ holdings: PortfolioRiskHolding[] }>();

const languageStore = useLanguageStore();
const aiStore = useAiStore();

const analysis = computed(() => aiStore.riskAnalysis);

const canAnalyze = computed(
  () =>
    props.holdings.length > 0 &&
    aiStore.selectedModelId !== null &&
    aiStore.canAfford &&
    !aiStore.loadingRisk,
);

/** เหมือน AiPortfolioAdvisorCard — ปุ่มที่กดไม่ได้ต้องบอกเหตุผล ไม่ใช่ตายเงียบ */
const disabledReason = computed(() => {
  if (aiStore.loadingRisk) return '';

  if (props.holdings.length === 0) {
    return languageStore.isThai
      ? 'ยังไม่มีหุ้นในพอร์ต — บันทึกการซื้อก่อนจึงจะวิเคราะห์ความเสี่ยงได้'
      : 'No holdings yet — record a purchase before analysing risk.';
  }

  if (aiStore.selectedModelId === null) {
    return languageStore.isThai ? 'เลือกโมเดล AI ก่อน' : 'Pick an AI model first.';
  }

  if (!aiStore.canAfford) {
    return languageStore.isThai
      ? `เครดิต AI ไม่พอ (มี ${aiStore.credits} ต้องมีอย่างน้อย ${aiStore.minBalance}) — เติมเครดิตก่อนใช้งาน`
      : `Not enough AI credits (${aiStore.credits} of ${aiStore.minBalance} required). Top up to continue.`;
  }

  return '';
});

const LEVEL_META = {
  Low: { color: 'positive', th: 'ต่ำ', en: 'Low', icon: 'shield' },
  Moderate: { color: 'warning', th: 'ปานกลาง', en: 'Moderate', icon: 'gpp_maybe' },
  Aggressive: { color: 'negative', th: 'สูง', en: 'Aggressive', icon: 'gpp_bad' },
} as const;

const levelMeta = computed(() => (analysis.value ? LEVEL_META[analysis.value.riskLevel] : null));

const num = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

const weight = (value: number | undefined) =>
  value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

const run = async () => {
  try {
    await aiStore.analyzeRisk(props.holdings);
  } catch {
    // error เก็บไว้ที่ aiStore.error แล้ว
  }
};
</script>

<template>
  <WsCard tone="glass" class="risk-card" data-test="ai-risk-analysis">
    <template #header>
      <div class="risk-header">
        <div class="risk-header__title">
          <q-icon name="security" size="22px" class="risk-header__icon" />
          <div>
            <h3 class="risk-title">
              {{ languageStore.isThai ? 'ประเมินความเสี่ยงพอร์ต (AI)' : 'AI Portfolio Risk Analysis' }}
            </h3>
            <p class="risk-subtitle">
              {{
                languageStore.isThai
                  ? 'ประเมินความเสี่ยงจากปัจจัยพื้นฐานรายหุ้น'
                  : 'Fundamental-based risk assessment per holding'
              }}
            </p>
          </div>
        </div>
        <WsBadge kind="ai" color="negative" value="RISK" outline />
      </div>
    </template>

    <div class="risk-body">
      <q-btn
        unelevated
        no-caps
        color="negative"
        icon="security"
        class="risk-run"
        data-test="ai-risk-run"
        :disable="!canAnalyze"
        :loading="aiStore.loadingRisk"
        :label="
          analysis
            ? languageStore.isThai
              ? 'วิเคราะห์ใหม่'
              : 'Re-analyze'
            : languageStore.isThai
              ? 'วิเคราะห์ความเสี่ยง'
              : 'Analyze Portfolio Risk'
        "
        @click="run"
      >
        <q-tooltip v-if="disabledReason" max-width="260px">{{ disabledReason }}</q-tooltip>
      </q-btn>

      <div
        v-if="disabledReason && props.holdings.length > 0"
        class="risk-state risk-state--hint"
        data-test="ai-risk-disabled-reason"
      >
        <q-icon name="info" size="18px" class="q-mr-xs" />
        {{ disabledReason }}
      </div>

      <div v-if="props.holdings.length === 0" class="risk-state" data-test="ai-risk-no-holdings">
        {{
          languageStore.isThai
            ? 'ยังไม่มีหุ้นในพอร์ตให้ประเมิน'
            : 'No holdings available to assess.'
        }}
      </div>

      <div v-else-if="aiStore.loadingRisk" class="risk-loading">
        <WsAiLoader
          accent="negative"
          :messages="
            languageStore.isThai
              ? [
                  'กำลังวิเคราะห์ความเสี่ยงพอร์ต...',
                  'กำลังประเมินการกระจายสินทรัพย์...',
                  'กำลังคำนวณคะแนนความเสี่ยง...',
                ]
              : [
                  'Analyzing portfolio risk...',
                  'Evaluating asset concentration...',
                  'Calculating risk score...',
                ]
          "
        />
      </div>

      <template v-else-if="analysis">
        <!-- Gauge -->
        <div class="risk-gauge" data-test="ai-risk-gauge">
          <q-circular-progress
            :value="analysis.riskScore"
            :min="0"
            :max="100"
            :color="levelMeta?.color"
            track-color="grey-4"
            :thickness="0.2"
            size="150px"
            show-value
            font-size="22px"
          />
          <div class="risk-gauge__level">
            <q-icon :name="levelMeta?.icon" :color="levelMeta?.color" size="20px" />
            <span :class="`text-${levelMeta?.color}`">
              {{ languageStore.isThai ? levelMeta?.th : levelMeta?.en }}
            </span>
          </div>

          <div class="risk-legend">
            <div class="risk-legend__item">
              <span class="risk-dot is-low"></span>
              <span>{{ languageStore.isThai ? 'ต่ำ (0-30)' : 'Low (0-30)' }}</span>
            </div>
            <div class="risk-legend__item">
              <span class="risk-dot is-moderate"></span>
              <span>{{ languageStore.isThai ? 'ปานกลาง (31-70)' : 'Moderate (31-70)' }}</span>
            </div>
            <div class="risk-legend__item">
              <span class="risk-dot is-aggressive"></span>
              <span>{{ languageStore.isThai ? 'สูง (71-100)' : 'Aggressive (71-100)' }}</span>
            </div>
          </div>
        </div>

        <!-- สรุป -->
        <section class="risk-summary">
          <div class="risk-section-title">
            <q-icon name="description" color="primary" size="18px" />
            {{ languageStore.isThai ? 'สรุปการวิเคราะห์' : 'Analysis Summary' }}
          </div>
          <p class="risk-text">{{ analysis.analysisSummary }}</p>
        </section>

        <!-- ปัจจัยเสี่ยง -->
        <section v-if="analysis.keyRiskFactors.length" class="risk-factors">
          <div class="risk-section-title">
            <q-icon name="warning" color="warning" size="18px" />
            {{ languageStore.isThai ? 'ปัจจัยความเสี่ยงหลัก' : 'Key Risk Factors' }}
          </div>
          <ul class="risk-list">
            <li v-for="(factor, index) in analysis.keyRiskFactors" :key="index">{{ factor }}</li>
          </ul>
        </section>

        <!-- ตาราง fundamentals -->
        <section class="risk-table-section">
          <div class="risk-section-title">
            <q-icon name="table_chart" color="primary" size="18px" />
            {{ languageStore.isThai ? 'ข้อมูลปัจจัยพื้นฐานรายหุ้น' : 'Fundamental Data by Holding' }}
          </div>
          <q-markup-table flat :dark="$q.dark.isActive" class="risk-table" separator="horizontal">
            <thead>
              <tr>
                <th class="text-left">{{ languageStore.isThai ? 'สัญลักษณ์' : 'Symbol' }}</th>
                <th class="text-right">Beta</th>
                <th class="text-right">D/E</th>
                <th class="text-right">P/E</th>
                <th class="text-right">{{ languageStore.isThai ? 'น้ำหนัก' : 'Weight' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="holding in aiStore.normalizedRiskHoldings"
                :key="holding.symbol"
                data-test="ai-risk-row"
              >
                <td class="text-left text-weight-bold">{{ holding.symbol }}</td>
                <td class="text-right">{{ num(holding.beta) }}</td>
                <td class="text-right">{{ num(holding.debtToEquity) }}</td>
                <td class="text-right">{{ num(holding.peRatio) }}</td>
                <td class="text-right">{{ weight(holding.weight) }}</td>
              </tr>
            </tbody>
          </q-markup-table>
        </section>
      </template>

      <div v-else-if="aiStore.error" class="risk-state" data-test="ai-risk-error">
        <q-icon name="cloud_off" size="28px" class="q-mb-sm" />
        <div>{{ aiStore.error }}</div>
      </div>

      <div v-else class="risk-state" data-test="ai-risk-idle">
        {{
          languageStore.isThai
            ? 'กดปุ่มด้านบนเพื่อประเมินความเสี่ยงจากปัจจัยพื้นฐาน'
            : 'Use the button above to run a fundamental risk assessment.'
        }}
      </div>
    </div>
  </WsCard>
</template>

<style scoped>
.risk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.risk-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.risk-header__icon {
  color: #ef4444;
}

.risk-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.risk-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.risk-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.risk-run {
  align-self: flex-start;
  border-radius: 10px;
}

.risk-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
}

.risk-state--hint {
  flex-direction: row;
  align-items: center;
  padding: 10px 14px;
  margin-top: 10px;
  font-size: 13px;
  border-radius: 10px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.risk-loading {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.risk-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.risk-gauge__level {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  font-size: 0.95rem;
}

.risk-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.risk-legend__item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.risk-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.risk-dot.is-low {
  background: #22c55e;
}

.risk-dot.is-moderate {
  background: #f59e0b;
}

.risk-dot.is-aggressive {
  background: #ef4444;
}

.risk-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.risk-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-line;
}

.risk-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.risk-table {
  background: transparent;
  font-variant-numeric: tabular-nums;
}
</style>

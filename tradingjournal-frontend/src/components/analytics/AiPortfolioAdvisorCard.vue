<script setup lang="ts">
/**
 * AI Portfolio Advisor — ต่อกับ AiStore.reviewPortfolio() (POST /ai/portfolio/:id/review)
 *
 * ⚠️ โครงข้อมูลต่างจากต้นฉบับ: หน้าเก่าคาดหวัง { overallAdvice, timeframeRecommendations,
 * portfolioHealth } แต่ backend ตัวจริงของโปรเจกต์นี้คืน InvestorReviewResult คือ
 * { summary, diversificationScore, riskProfile, concentrationRisks, strengths,
 * actionableRecommendations } — ไม่มีการแยกคำแนะนำเป็นระยะสั้น/ยาว
 *
 * จึงคงโครงหน้าตาเดิมไว้ (การ์ดภาพรวม + กริด 2 คอลัมน์ + สุขภาพพอร์ต + progress bar)
 * แต่แมปเนื้อหาให้ตรงกับสิ่งที่ backend คืนจริง แทนที่จะโชว์ช่องว่างเปล่า
 */
import { computed, onMounted } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { useAiStore } from 'stores/AiStore';
import { WsAiLoader, WsBadge, WsCard } from 'src/components/ui';

const props = defineProps<{ portfolioId: number | null; hasHoldings: boolean }>();

const languageStore = useLanguageStore();
const aiStore = useAiStore();

onMounted(() => {
  void aiStore.fetchModels().catch(() => undefined);
});

const review = computed(() => aiStore.investorReview);

const modelOptions = computed(() =>
  aiStore.models.map((model) => ({ label: model.label, value: model.id })),
);

const selectedModel = computed({
  get: () => aiStore.selectedModelId,
  set: (value: string | null) => aiStore.setSelectedModel(value),
});

const canGenerate = computed(
  () =>
    props.portfolioId !== null &&
    props.hasHoldings &&
    aiStore.selectedModelId !== null &&
    aiStore.canAfford &&
    !aiStore.loadingReview,
);

/**
 * ทำไมปุ่มถึงกดไม่ได้ — ต้องบอกให้รู้
 *
 * ของเดิมปุ่มถูก disable เฉย ๆ โดยไม่มีอะไรอธิบาย เคสที่เจอบ่อยที่สุดคือเครดิต AI = 0
 * (ผู้ใช้ใหม่ทุกคนเริ่มที่ 0 แต่ minBalance = 10) ส่วน aiStore.insufficientCredits
 * จะถูกตั้งก็ต่อเมื่อ "ยิงแล้วโดนปฏิเสธ" เท่านั้น จึงไม่เคยขึ้นก่อนกดเลย
 */
const disabledReason = computed(() => {
  if (aiStore.loadingReview) return '';

  if (props.portfolioId === null) {
    return languageStore.isThai
      ? 'เลือกพอร์ตก่อนจึงจะวิเคราะห์ได้'
      : 'Select a portfolio first.';
  }

  if (!props.hasHoldings) {
    return languageStore.isThai
      ? 'ยังไม่มีหุ้นในพอร์ต — บันทึกการซื้อก่อนจึงจะวิเคราะห์ได้'
      : 'No holdings yet — record a purchase before running the analysis.';
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

const RISK_META = {
  CONSERVATIVE: { color: 'positive', th: 'ระมัดระวัง', en: 'Conservative' },
  MODERATE: { color: 'warning', th: 'ปานกลาง', en: 'Moderate' },
  AGGRESSIVE: { color: 'negative', th: 'เชิงรุก', en: 'Aggressive' },
} as const;

const riskMeta = computed(() => (review.value ? RISK_META[review.value.riskProfile] : null));

const scoreColor = (score: number) => (score >= 70 ? 'positive' : score >= 40 ? 'warning' : 'negative');

const generate = async () => {
  if (props.portfolioId === null) return;

  try {
    await aiStore.reviewPortfolio(props.portfolioId);
  } catch {
    // ข้อความ error อยู่ใน aiStore.error แล้ว — template แสดงให้เอง
  }
};
</script>

<template>
  <WsCard tone="glass" class="advisor-card" data-test="ai-portfolio-advisor">
    <template #header>
      <div class="advisor-header">
        <div class="advisor-header__title">
          <q-icon name="psychology" size="22px" class="advisor-header__icon" />
          <div>
            <h3 class="advisor-title">
              {{ languageStore.isThai ? 'ที่ปรึกษาพอร์ต AI' : 'AI Portfolio Advisor' }}
            </h3>
            <p class="advisor-subtitle">
              {{
                languageStore.isThai
                  ? 'วิเคราะห์การกระจายความเสี่ยงและให้คำแนะนำจากพอร์ตจริงของคุณ'
                  : 'Diversification analysis and recommendations from your live portfolio'
              }}
            </p>
          </div>
        </div>
        <WsBadge kind="ai" color="primary" value="AI" outline />
      </div>
    </template>

    <div class="advisor-body">
      <div class="advisor-controls">
        <q-select
          v-model="selectedModel"
          :options="modelOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          dense
          outlined
          :dark="$q.dark.isActive"
          :loading="aiStore.loadingModels"
          class="advisor-model"
          :label="languageStore.isThai ? 'โมเดล AI' : 'AI model'"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="auto_awesome"
          class="advisor-generate"
          data-test="ai-advisor-generate"
          :disable="!canGenerate"
          :loading="aiStore.loadingReview"
          :label="
            review
              ? languageStore.isThai
                ? 'วิเคราะห์ใหม่'
                : 'Regenerate'
              : languageStore.isThai
                ? 'สร้างรายงาน AI'
                : 'Generate AI Analysis'
          "
          @click="generate"
        >
          <q-tooltip v-if="disabledReason" max-width="260px">{{ disabledReason }}</q-tooltip>
        </q-btn>
      </div>

      <!-- ปุ่มกดไม่ได้ต้องมีเหตุผลติดอยู่เสมอ ไม่ใช่ปล่อยให้เดาเอง -->
      <div
        v-if="disabledReason && props.hasHoldings"
        class="advisor-state advisor-state--hint"
        data-test="ai-advisor-disabled-reason"
      >
        <q-icon name="info" size="18px" class="q-mr-xs" />
        {{ disabledReason }}
      </div>

      <div v-if="!props.hasHoldings" class="advisor-state" data-test="ai-advisor-no-holdings">
        {{
          languageStore.isThai
            ? 'ยังไม่มีหุ้นในพอร์ต — บันทึกการซื้อก่อนจึงจะวิเคราะห์ได้'
            : 'No holdings yet — record a purchase before running the analysis.'
        }}
      </div>

      <div v-else-if="aiStore.insufficientCredits" class="advisor-state" data-test="ai-advisor-credits">
        {{ languageStore.isThai ? 'เครดิต AI ไม่พอ กรุณาเติมเครดิต' : 'Not enough AI credits.' }}
      </div>

      <div v-else-if="aiStore.loadingReview" class="advisor-loading">
        <WsAiLoader />
      </div>

      <div v-else-if="aiStore.error && !review" class="advisor-state" data-test="ai-advisor-error">
        <q-icon name="cloud_off" size="28px" class="q-mb-sm" />
        <div>{{ aiStore.error }}</div>
      </div>

      <template v-else-if="review">
        <!-- ภาพรวม -->
        <section class="advisor-overall" data-test="ai-advisor-summary">
          <div class="advisor-overall__head">
            <h4 class="advisor-section-title">
              {{ languageStore.isThai ? 'ภาพรวมการประเมิน' : 'Overall Assessment' }}
            </h4>
            <q-icon name="lightbulb" color="primary" size="20px" />
          </div>
          <p class="advisor-text">{{ review.summary }}</p>
        </section>

        <!-- กริดคำแนะนำ 2 คอลัมน์ -->
        <section class="advisor-grid">
          <div class="advisor-panel advisor-panel--strengths">
            <div class="advisor-panel__head">
              <q-icon name="verified" color="green" size="20px" />
              <h4 class="advisor-panel__title">
                {{ languageStore.isThai ? 'จุดแข็งของพอร์ต' : 'Portfolio Strengths' }}
              </h4>
            </div>
            <ul v-if="review.strengths.length" class="advisor-list">
              <li v-for="(item, index) in review.strengths" :key="index">{{ item }}</li>
            </ul>
            <p v-else class="advisor-empty">
              {{ languageStore.isThai ? 'AI ไม่ได้ระบุจุดแข็ง' : 'No strengths highlighted' }}
            </p>
          </div>

          <div class="advisor-panel advisor-panel--actions">
            <div class="advisor-panel__head">
              <q-icon name="bolt" color="orange" size="20px" />
              <h4 class="advisor-panel__title">
                {{ languageStore.isThai ? 'สิ่งที่ควรทำต่อ' : 'Actionable Recommendations' }}
              </h4>
            </div>
            <ul v-if="review.actionableRecommendations.length" class="advisor-list">
              <li v-for="(item, index) in review.actionableRecommendations" :key="index">
                {{ item }}
              </li>
            </ul>
            <p v-else class="advisor-empty">
              {{ languageStore.isThai ? 'AI ไม่ได้ให้คำแนะนำเพิ่ม' : 'No recommendations given' }}
            </p>
          </div>
        </section>

        <!-- สุขภาพพอร์ต -->
        <section class="advisor-health">
          <h4 class="advisor-section-title q-mb-sm">
            {{ languageStore.isThai ? 'สุขภาพพอร์ต' : 'Portfolio Health' }}
          </h4>

          <div class="health-cards">
            <div class="health-card" data-test="ai-advisor-diversification">
              <div class="health-card__head">
                <span class="health-card__title">
                  {{ languageStore.isThai ? 'คะแนนกระจายความเสี่ยง' : 'Diversification Score' }}
                </span>
                <span
                  class="health-card__score"
                  :class="`text-${scoreColor(review.diversificationScore)}`"
                >
                  {{ Math.round(review.diversificationScore) }}/100
                </span>
              </div>
              <q-linear-progress
                :value="Math.min(Math.max(review.diversificationScore, 0), 100) / 100"
                :color="scoreColor(review.diversificationScore)"
                size="8px"
                rounded
              />
            </div>

            <div class="health-card">
              <div class="health-card__head">
                <span class="health-card__title">
                  {{ languageStore.isThai ? 'โปรไฟล์ความเสี่ยง' : 'Risk Profile' }}
                </span>
                <q-badge
                  v-if="riskMeta"
                  :color="riskMeta.color"
                  :label="languageStore.isThai ? riskMeta.th : riskMeta.en"
                />
              </div>
            </div>

            <div class="health-card health-card--full">
              <div class="health-card__head">
                <span class="health-card__title">
                  {{ languageStore.isThai ? 'ความเสี่ยงจากการกระจุกตัว' : 'Concentration Risks' }}
                </span>
              </div>
              <ul v-if="review.concentrationRisks.length" class="advisor-list">
                <li v-for="(item, index) in review.concentrationRisks" :key="index">{{ item }}</li>
              </ul>
              <p v-else class="advisor-empty">
                {{
                  languageStore.isThai
                    ? 'ไม่พบการกระจุกตัวที่น่ากังวล'
                    : 'No concerning concentration found'
                }}
              </p>
            </div>
          </div>
        </section>
      </template>

      <div v-else class="advisor-state" data-test="ai-advisor-idle">
        <q-icon name="auto_awesome" size="28px" class="q-mb-sm" />
        <div>
          {{
            languageStore.isThai
              ? 'กดปุ่มด้านบนเพื่อให้ AI วิเคราะห์พอร์ตของคุณ'
              : 'Use the button above to let the AI review your portfolio.'
          }}
        </div>
      </div>
    </div>
  </WsCard>
</template>

<style scoped>
.advisor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.advisor-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.advisor-header__icon {
  color: var(--q-primary);
}

.advisor-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.advisor-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.advisor-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.advisor-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.advisor-model {
  min-width: 220px;
  flex: 1 1 220px;
}

.advisor-generate {
  border-radius: 10px;
  height: 40px;
}

.advisor-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  text-align: center;
  color: var(--text-secondary);
}

/* เหตุผลที่ปุ่มกดไม่ได้ — เป็นคำใบ้ ไม่ใช่ empty state เต็มความสูง */
.advisor-state--hint {
  flex-direction: row;
  align-items: center;
  padding: 10px 14px;
  font-size: 13px;
  border-radius: 10px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.advisor-loading {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.advisor-section-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.advisor-overall {
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(99, 102, 241, 0.1));
  border: 1px solid rgba(99, 102, 241, 0.35);
}

.advisor-overall__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.advisor-text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--text-primary);
}

.advisor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.advisor-panel {
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.advisor-panel--strengths {
  border-color: rgba(34, 197, 94, 0.35);
}

.advisor-panel--actions {
  border-color: rgba(245, 158, 11, 0.35);
}

.advisor-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.advisor-panel__title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
}

.advisor-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.advisor-empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.health-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.health-card {
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.health-card--full {
  grid-column: 1 / -1;
}

.health-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.health-card__title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.health-card__score {
  font-size: 0.95rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .advisor-grid,
  .health-cards {
    grid-template-columns: 1fr;
  }
}
</style>

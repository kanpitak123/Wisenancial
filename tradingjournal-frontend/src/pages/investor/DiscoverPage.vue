<script setup lang="ts">
/**
 * Discover — หุ้นเติบโตที่ AI คัดให้ พอร์ตมาจาก TradingJournal เดิม (pages/DiscoverPage.vue)
 *
 * ไม่ได้สร้าง endpoint ใหม่: GET /ai/recommendations/growth, aiService.getGrowthRecommendations()
 * และ AiStore.loadGrowthRecommendations() มีครบอยู่แล้ว ขาดแค่หน้าที่เรียกใช้ (orphan)
 *
 * ต่างจากของเดิมหนึ่งจุดโดยตั้งใจ: ของเดิม onMounted() ยิงเลยทันทีที่เปิดหน้า ซึ่งที่นี่
 * แปลว่าเสียเครดิต AI ทุกครั้งที่เข้าหน้านี้แม้แต่กดพลาด — เปลี่ยนเป็นกดปุ่มเอง แล้วบอก
 * เหตุผลเวลาปุ่มกดไม่ได้ ตามแพทเทิร์นเดียวกับ AiPortfolioAdvisorCard
 */
import { computed, onMounted } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { useAiStore } from 'stores/AiStore';
import { WsAiLoader, WsBadge, WsCard } from 'src/components/ui';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';

const languageStore = useLanguageStore();
const aiStore = useAiStore();

// โหลดรายชื่อโมเดล + ยอดเครดิตไว้ก่อน ทั้งคู่ไม่คิดเครดิต
onMounted(() => {
  void aiStore.fetchModels().catch(() => undefined);
});

const recommendations = computed(() => aiStore.growthRecommendations);

const canGenerate = computed(() => aiStore.canAfford && !aiStore.loadingRecommendations);

/** ทำไมปุ่มถึงกดไม่ได้ — ปุ่ม disable เฉยๆ โดยไม่บอกอะไรคือสิ่งที่ผู้ใช้เดาไม่ถูก */
const disabledReason = computed(() => {
  if (aiStore.loadingRecommendations) return '';

  if (!aiStore.canAfford) {
    return languageStore.isThai
      ? `เครดิต AI ไม่พอ (มี ${aiStore.credits} ต้องมีอย่างน้อย ${aiStore.minBalance}) — เติมเครดิตก่อนใช้งาน`
      : `Not enough AI credits (${aiStore.credits} of ${aiStore.minBalance} required). Top up to continue.`;
  }

  return '';
});

const generate = async () => {
  try {
    await aiStore.loadGrowthRecommendations();
  } catch {
    // AiStore.handleError ตั้ง error/insufficientCredits ให้แล้ว เทมเพลตอ่านจากตรงนั้น
  }
};

/**
 * 4 หัวข้อเหตุผลของแบบเดิม — จัดเป็นหมวดพร้อมไอคอนแทนพารากราฟยาว
 * key ต้องตรงกับ StockRecommendation['reasoning'] ใน types/ai.types.ts
 */
const REASON_META = [
  { key: 'growth', icon: 'trending_up', color: 'positive', th: 'การเติบโต', en: 'Growth' },
  {
    key: 'profit',
    icon: 'attach_money',
    color: 'warning',
    th: 'ความสามารถทำกำไร',
    en: 'Profitability',
  },
  { key: 'customerBase', icon: 'people', color: 'info', th: 'ฐานลูกค้า', en: 'Customer Base' },
  { key: 'liquidity', icon: 'water_drop', color: 'primary', th: 'สภาพคล่อง', en: 'Liquidity' },
] as const;
</script>

<template>
  <q-page class="discover-page q-pa-md q-pa-sm-lg">
    <header class="discover-header">
      <div>
        <WsBadge kind="ai" color="primary" value="AI PICKS" outline class="q-mb-sm" />
        <h1 class="discover-title">
          {{ languageStore.isThai ? 'หุ้นเติบโตที่ AI คัดให้' : 'AI Market Picks' }}
        </h1>
        <p class="discover-subtitle">
          {{
            languageStore.isThai
              ? 'ให้ AI สแกนหาหุ้นเติบโต พร้อมเหตุผลแยกเป็นหมวด'
              : 'Let AI scan for growth stocks and explain each pick by category.'
          }}
        </p>
      </div>

      <div class="discover-actions">
        <span class="discover-credits" data-test="discover-credits">
          <q-icon name="bolt" size="15px" />
          {{ aiStore.credits }}
          <q-tooltip>
            {{ languageStore.isThai ? 'เครดิต AI คงเหลือ' : 'AI credits remaining' }}
          </q-tooltip>
        </span>
        <q-btn
          unelevated
          no-caps
          icon="auto_awesome"
          class="discover-generate text-white text-weight-bold"
          data-test="discover-generate"
          :disable="!canGenerate"
          :loading="aiStore.loadingRecommendations"
          :label="
            recommendations.length
              ? languageStore.isThai
                ? 'สแกนใหม่'
                : 'Rescan'
              : languageStore.isThai
                ? 'ให้ AI สแกนหุ้น'
                : 'Scan with AI'
          "
          @click="generate"
        />
      </div>
    </header>

    <div v-if="disabledReason" class="discover-hint" data-test="discover-hint">
      <q-icon name="info" size="16px" class="q-mr-xs" />
      {{ disabledReason }}
    </div>

    <!-- กำลังสแกน -->
    <div v-if="aiStore.loadingRecommendations" class="discover-state" data-test="discover-loading">
      <WsAiLoader />
      <div class="text-subtitle1 text-weight-bolder q-mt-md">
        {{ languageStore.isThai ? 'AI กำลังสแกนตลาดโลก…' : 'AI is scanning global markets…' }}
      </div>
      <div class="text-body2 text-muted q-mt-xs">
        {{
          languageStore.isThai
            ? 'กำลังวิเคราะห์หุ้นจำนวนมากเพื่อหาศักยภาพการเติบโต'
            : 'Analysing thousands of stocks for growth potential.'
        }}
      </div>
    </div>

    <!-- เครดิตไม่พอ (ตั้งโดย AiStore หลังยิงแล้วโดนปฏิเสธ) -->
    <div
      v-else-if="aiStore.insufficientCredits"
      class="discover-state"
      data-test="discover-credits-empty"
    >
      <q-icon name="bolt" size="40px" class="q-mb-sm text-warning" />
      <div class="text-subtitle1 text-weight-bolder">
        {{ languageStore.isThai ? 'เครดิต AI ไม่พอ' : 'Not enough AI credits' }}
      </div>
      <q-btn
        flat
        no-caps
        color="primary"
        class="q-mt-sm text-weight-bold"
        data-test="discover-topup"
        :label="languageStore.isThai ? 'เติมเครดิต' : 'Top up credits'"
        to="/AiCredits"
      />
    </div>

    <!-- error อื่นๆ -->
    <div v-else-if="aiStore.error" class="discover-state" data-test="discover-error">
      <q-icon name="error_outline" size="40px" class="q-mb-sm text-negative" />
      <div class="text-subtitle1 text-weight-bolder">
        {{ languageStore.isThai ? 'โหลดคำแนะนำไม่สำเร็จ' : 'Unable to load recommendations' }}
      </div>
      <div class="text-body2 text-muted q-mt-xs">{{ aiStore.error }}</div>
      <q-btn
        flat
        no-caps
        color="primary"
        icon="refresh"
        class="q-mt-sm text-weight-bold"
        data-test="discover-retry"
        :label="languageStore.isThai ? 'ลองใหม่' : 'Try again'"
        @click="generate"
      />
    </div>

    <!-- ยังไม่เคยสแกน -->
    <div v-else-if="recommendations.length === 0" class="discover-state" data-test="discover-empty">
      <q-icon name="auto_awesome" size="40px" class="q-mb-sm" />
      <div class="text-subtitle1 text-weight-bolder">
        {{ languageStore.isThai ? 'ยังไม่ได้สแกน' : 'Nothing scanned yet' }}
      </div>
      <div class="text-body2 text-muted q-mt-xs">
        {{
          languageStore.isThai
            ? 'กด "ให้ AI สแกนหุ้น" เพื่อดูหุ้นเติบโตที่ AI คัดให้'
            : 'Hit “Scan with AI” to see the growth stocks AI picks out.'
        }}
      </div>
    </div>

    <div v-else class="discover-grid" data-test="discover-grid">
      <WsCard
        v-for="rec in recommendations"
        :key="rec.symbol"
        class="discover-card"
        :data-test="`discover-card-${rec.symbol}`"
      >
        <template #header>
          <div class="discover-card-head">
            <div class="discover-card-id">
              <!-- ป้ายตัวย่อแทนโลโก้ — logo.clearbit.com โดน ad blocker บล็อกบ่อย
                   ถ้าไม่มีตัวสำรองจะเหลือช่องว่างเปล่า -->
              <span
                class="discover-avatar"
                :style="{ background: symbolAvatarColor(rec.symbol) }"
                >{{ symbolAvatarInitials(rec.symbol) }}</span
              >
              <div class="discover-card-text">
                <div class="discover-symbol">{{ rec.symbol }}</div>
                <div class="discover-name">{{ rec.name }}</div>
              </div>
            </div>
            <q-badge class="discover-sector" :label="rec.sector" />
          </div>
        </template>

        <div class="discover-reasons">
          <div v-for="meta in REASON_META" :key="meta.key" class="discover-reason">
            <div class="discover-reason-head">
              <q-icon :name="meta.icon" :color="meta.color" size="18px" />
              <span>{{ languageStore.isThai ? meta.th : meta.en }}</span>
            </div>
            <p class="discover-reason-text">{{ rec.reasoning[meta.key] }}</p>
          </div>
        </div>

        <div class="discover-summary">
          <div class="discover-summary-label">
            {{ languageStore.isThai ? 'สรุปโดย AI' : 'AI Summary' }}
          </div>
          <p class="discover-summary-text">{{ rec.aiSummary }}</p>
        </div>
      </WsCard>
    </div>
  </q-page>
</template>

<style scoped>
.discover-page {
  --bg-page: #f6f9f9;
  --bg-card-soft: #f0f5f4;
  --border-color: #dae7e5;
  --text-main: #1b3636;
  --text-muted: #789191;

  --accent-100: #e7f4f2;
  --accent-500: #85b6b0;
  --accent-800: #336160;
  --accent-900: #1b3636;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
}

.body--dark .discover-page {
  --bg-page: #151819;
  --bg-card-soft: #282e2e;
  --border-color: #394141;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --accent-100: rgba(133, 182, 176, 0.18);
}

.discover-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}

.discover-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-main);
}

.discover-subtitle {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.discover-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.discover-credits {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  font-weight: 700;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--accent-100);
  color: var(--accent-800);
}

.body--dark .discover-credits {
  color: var(--text-main);
}

.discover-generate {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  border-radius: 11px;
  padding: 0 18px;
  height: 40px;
}

.discover-hint {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  border-radius: 10px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.discover-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  color: var(--text-muted);
  text-align: center;
}

.discover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}

.discover-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.discover-card-id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.discover-card-text {
  min-width: 0;
}

.discover-avatar {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.discover-symbol {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--accent-800);
}

.body--dark .discover-symbol {
  color: var(--text-main);
}

.discover-name {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.discover-sector {
  background: var(--accent-100) !important;
  color: var(--accent-800) !important;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 10.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.body--dark .discover-sector {
  color: var(--text-main) !important;
}

/* เหตุผล 4 หมวดวางเป็น 2x2 — อ่านง่ายกว่าพารากราฟยาวก้อนเดียวแบบต้นฉบับ */
.discover-reasons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

@media (max-width: 599px) {
  .discover-reasons {
    grid-template-columns: 1fr;
  }
}

.discover-reason-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-main);
}

.discover-reason-text {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.discover-summary {
  margin-top: 16px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
}

.discover-summary-label {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent-800);
}

.body--dark .discover-summary-label {
  color: var(--text-muted);
}

.discover-summary-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-main);
}
</style>

<template>
  <button type="button" class="ai-quota-badge" data-test="ai-quota-badge" :class="stateClass">
    <q-icon name="auto_awesome" size="14px" class="ai-quota-icon" />
    <span class="ai-quota-value">{{ compactCredits }}</span>

    <q-tooltip anchor="bottom middle" self="top middle" class="bg-grey-9 text-white shadow-4">
      {{ tooltipText }}
    </q-tooltip>

    <q-menu anchor="bottom right" self="top right" :offset="[0, 8]" class="ai-quota-menu">
      <div class="ai-quota-pop" data-test="ai-quota-pop">
        <div class="ai-quota-pop-head">
          <q-icon name="auto_awesome" size="16px" class="ai-quota-icon" />
          <span>{{ copy.title }}</span>
        </div>

        <div class="ai-quota-figure" data-test="ai-quota-figure">
          {{ aiStore.credits.toLocaleString('en-US') }}
          <span class="ai-quota-figure-unit">{{ copy.unit }}</span>
        </div>

        <!-- แถบนี้เทียบกับ "ยอดเริ่มต้นสูงสุดที่เคยเห็น" ไม่ใช่โควตารายเดือน เพราะ
             หลังบ้านคืนมาแค่ยอดคงเหลือ ไม่มีเพดานให้อ้างอิง — ตั้ง 0 = หมด,
             เต็มแถบ = ยังไม่เคยใช้ อย่างน้อยผู้ใช้ยังเห็นแนวโน้มว่าเหลือน้อยลง -->
        <q-linear-progress
          :value="progress"
          size="6px"
          rounded
          :color="barColor"
          track-color="grey-4"
          class="ai-quota-bar"
          data-test="ai-quota-bar"
        />

        <div class="ai-quota-note" :class="{ 'ai-quota-note--warn': !aiStore.canAfford }">
          {{ noteText }}
        </div>

        <q-btn
          unelevated
          dense
          no-caps
          class="ai-quota-cta full-width"
          :label="copy.topUp"
          :to="UPGRADE_ROUTE"
        />
      </div>
    </q-menu>
  </button>
</template>

<script setup lang="ts">
/**
 * ป้ายเครดิต AI บนหัวเว็บ — กดแล้วกางรายละเอียด
 *
 * เดิมไม่มีตัวนี้อยู่บน layout เลย (เครดิตโผล่เฉพาะตอนหน้าที่ใช้ AI ฟ้องว่าไม่พอ)
 * พอ sidebar ถูกถอดออก หัวเว็บกลายเป็นที่เดียวที่เห็นได้ตลอดทุกหน้า จึงมาอยู่ที่นี่
 * และย่อเหลือแค่ตัวเลข ไม่กินที่ toolbar ส่วนแถบ/ปุ่มเติมไปอยู่ใน popover แทน
 */
import { computed, ref, watch } from 'vue';
import { useAiStore } from 'stores/AiStore';
import { useLanguageStore } from 'stores/LanguageStore';
import { UPGRADE_ROUTE } from 'src/constants/portfolio.constants';

const aiStore = useAiStore();
const languageStore = useLanguageStore();

/**
 * ยอดสูงสุดที่เคยเห็นในเซสชันนี้ — ใช้เป็นตัวหารของแถบความคืบหน้า
 * เริ่มที่ยอดปัจจุบัน เพื่อไม่ให้ผู้ใช้ที่เพิ่งเปิดแอพเห็นแถบเต็ม 100% ทั้งที่เครดิตเหลือน้อย
 */
const peakCredits = ref(Math.max(aiStore.credits, aiStore.minBalance));

watch(
  () => aiStore.credits,
  (value) => {
    if (value > peakCredits.value) peakCredits.value = value;
  },
);

const progress = computed(() => {
  if (peakCredits.value <= 0) return 0;
  return Math.min(1, Math.max(0, aiStore.credits / peakCredits.value));
});

const compactCredits = computed(() => {
  const credits = aiStore.credits;
  if (credits >= 1_000_000) return `${(credits / 1_000_000).toFixed(1)}M`;
  if (credits >= 10_000) return `${Math.round(credits / 1000)}k`;
  if (credits >= 1_000) return `${(credits / 1000).toFixed(1)}k`;
  return String(credits);
});

const copy = computed(() =>
  languageStore.isThai
    ? { title: 'เครดิต AI', unit: 'เครดิต', topUp: 'เติมเครดิต' }
    : { title: 'AI credits', unit: 'credits', topUp: 'Top up credits' },
);

const stateClass = computed(() => (aiStore.canAfford ? '' : 'ai-quota-badge--low'));
const barColor = computed(() => (aiStore.canAfford ? 'primary' : 'negative'));

const tooltipText = computed(() =>
  languageStore.isThai
    ? `เครดิต AI คงเหลือ ${aiStore.credits.toLocaleString('en-US')}`
    : `${aiStore.credits.toLocaleString('en-US')} AI credits left`,
);

const noteText = computed(() => {
  if (aiStore.canAfford) {
    return languageStore.isThai
      ? 'ใช้กับการวิเคราะห์กราฟ รีวิวพอร์ต และคำแนะนำหุ้น'
      : 'Spent on chart analysis, portfolio reviews and stock picks.';
  }
  return languageStore.isThai
    ? `เครดิตไม่พอ (ต้องมีอย่างน้อย ${aiStore.minBalance})`
    : `Not enough credits (minimum ${aiStore.minBalance}).`;
});
</script>

<style scoped>
.ai-quota-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--item-hover);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}
.ai-quota-badge:hover {
  border-color: var(--accent-500);
  color: var(--text-main);
}

.ai-quota-icon {
  color: var(--accent-700);
}

.ai-quota-badge--low,
.ai-quota-badge--low .ai-quota-icon {
  color: var(--q-negative);
  border-color: var(--q-negative);
}

.ai-quota-value {
  font-variant-numeric: tabular-nums;
}

.ai-quota-pop {
  padding: 14px;
  width: 232px;
}

.ai-quota-pop-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ai-quota-figure {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}
.ai-quota-figure-unit {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-left: 4px;
}

.ai-quota-bar {
  margin: 10px 0 8px;
}

.ai-quota-note {
  font-size: 10.5px;
  line-height: 1.35;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.ai-quota-note--warn {
  color: var(--q-negative);
  font-weight: 600;
}

.ai-quota-cta {
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  color: #ffffff;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
}
</style>

<style>
/* teleport ออกนอก component เหมือน .bottom-nav-sheet — สไตล์การ์ดอยู่ใน scoped ไม่ได้ */
.ai-quota-menu {
  border-radius: 14px;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 32px -8px rgba(15, 42, 40, 0.28);
}
.body--dark .ai-quota-menu {
  box-shadow: 0 10px 32px -8px rgba(0, 0, 0, 0.6);
}
</style>

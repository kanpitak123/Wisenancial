<script setup lang="ts">
import { ref, computed } from 'vue';

// ==============================
// State
// ==============================
interface Topic {
  id: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  title: string;
  subtitle: string;
  content: string;
  isDone: boolean;
}

const currentTab = ref('beginner');

// แบ่งเนื้อหาออกเป็น 3 Level ด้วยการเพิ่ม field `level`
const topics = ref<Topic[]>([
  // --- Beginner ---
  {
    id: 1,
    level: 'beginner',
    title: 'What is Forex?',
    subtitle: 'Introduction to the foreign exchange market',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 2,
    level: 'beginner',
    title: 'Currency Pairs Explained',
    subtitle: 'Understanding base and quote currencies',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 3,
    level: 'beginner',
    title: 'Pips & Lots',
    subtitle: 'Understanding price movements and position sizes',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 4,
    level: 'beginner',
    title: 'How to Read Charts',
    subtitle: 'Candlestick charts and basic patterns',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 5,
    level: 'beginner',
    title: 'Technical Analysis Basics',
    subtitle: 'Chart patterns, trends, and indicators',
    content: 'Content coming soon...',
    isDone: false,
  },
  // --- Intermediate ---
  {
    id: 6,
    level: 'intermediate',
    title: 'Support & Resistance',
    subtitle: 'Key price levels and how to identify them',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 7,
    level: 'intermediate',
    title: 'Technical Indicators',
    subtitle: 'RSI, MACD, Moving Averages, and more',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 8,
    level: 'intermediate',
    title: 'Risk Management',
    subtitle: 'Position sizing, stop losses, and risk/reward',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 9,
    level: 'intermediate',
    title: 'Price Action Trading',
    subtitle: 'Reading raw price movements without indicators',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 10,
    level: 'intermediate',
    title: 'Order Flow & Liquidity',
    subtitle: 'Understanding market microstructure',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 11,
    level: 'intermediate',
    title: 'Multi-Timeframe Analysis',
    subtitle: 'Combining timeframes for better entries',
    content: 'Content coming soon...',
    isDone: false,
  },
  // --- Advanced ---
  {
    id: 12,
    level: 'advanced',
    title: 'Trading Psychology',
    subtitle: 'Mastering emotions and discipline',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 13,
    level: 'advanced',
    title: 'Building a Trading Plan',
    subtitle: 'Creating a systematic approach',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 14,
    level: 'advanced',
    title: 'Backtesting Strategies',
    subtitle: 'Testing your strategy on historical data',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 15,
    level: 'advanced',
    title: 'Journal Analysis Mastery',
    subtitle: 'Using your journal data to improve',
    content: 'Content coming soon...',
    isDone: false,
  },
  {
    id: 16,
    level: 'advanced',
    title: 'Professional Mindset',
    subtitle: 'Thinking and acting like a professional trader',
    content: 'Content coming soon...',
    isDone: false,
  },
]);

// ==============================
// Computed Logic
// ==============================

// ฟังก์ชันสำหรับคำนวณ Progress ของแต่ละ Level
const getLevelStats = (level: string) => {
  const filteredTopics = topics.value.filter((t) => t.level === level);
  const total = filteredTopics.length;
  const completed = filteredTopics.filter((t) => t.isDone).length;
  const progressValue = total === 0 ? 0 : completed / total;
  const progressPercentage = Math.round(progressValue * 100);

  return {
    items: filteredTopics,
    total,
    completed,
    progressValue,
    progressPercentage,
  };
};

// รวมข้อมูลแต่ละ Tab ไว้ในตัวแปรเดียวเพื่อให้ใช้ลูปสร้าง UI ได้ง่าย
const levelTabs = computed(() => [
  { name: 'beginner', label: 'Beginner', stats: getLevelStats('beginner') },
  { name: 'intermediate', label: 'Intermediate', stats: getLevelStats('intermediate') },
  { name: 'advanced', label: 'Advanced', stats: getLevelStats('advanced') },
]);

// ==============================
// Functions
// ==============================
const toggleMarkDone = (id: number) => {
  const topic = topics.value.find((t) => t.id === id);
  if (topic) {
    topic.isDone = !topic.isDone;
  }
};
</script>

<template>
  <q-page class="classroom-page q-pa-md q-pa-sm-md">
    <div class="row items-center justify-between q-mb-md q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none text-main tracking-tight">Classroom</h1>
        <div class="text-subtitle2 text-muted q-mt-xs">Master your trading skills step-by-step</div>
      </div>
    </div>

    <div class="dashboard-card q-pa-sm q-mb-md">
      <q-tabs
        v-model="currentTab"
        dense
        no-caps
        indicator-color="primary"
        active-color="primary"
        align="left"
        class="text-muted"
      >
        <q-tab v-for="tab in levelTabs" :key="tab.name" :name="tab.name" :label="tab.label" />
      </q-tabs>
    </div>

    <q-tab-panels v-model="currentTab" animated class="bg-transparent">
      <q-tab-panel v-for="tab in levelTabs" :key="tab.name" :name="tab.name" class="q-pa-none">
        <q-card class="dashboard-card summary-card q-pa-md q-mb-lg flex column justify-center">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold text-main flex items-center">
              <q-icon name="school" color="primary" size="sm" class="q-mr-sm" />
              {{ tab.label }} Progress
            </div>
            <div class="text-subtitle2 text-muted text-weight-bold">
              <span class="text-primary">{{ tab.stats.completed }}</span> /
              {{ tab.stats.total }} Completed
            </div>
          </div>

          <div class="row items-center q-col-gutter-md q-mt-xs">
            <div class="col">
              <q-linear-progress
                rounded
                size="10px"
                :value="tab.stats.progressValue"
                color="primary"
                track-color="var(--border-color)"
              />
            </div>
            <div class="col-auto text-h6 text-weight-bolder text-main tracking-tight">
              {{ tab.stats.progressPercentage }}%
            </div>
          </div>
        </q-card>

        <div class="q-pb-xl">
          <q-expansion-item
            v-for="(topic, index) in tab.stats.items"
            :key="topic.id"
            group="classroom-accordion"
            class="dashboard-card summary-card q-mb-md overflow-hidden custom-expansion"
            header-class="q-pa-md custom-expansion-header"
          >
            <template v-slot:header>
              <q-item-section avatar>
                <div
                  class="icon-box"
                  :class="
                    topic.isDone ? 'bg-icon-positive text-positive' : 'bg-icon-primary text-primary'
                  "
                >
                  <q-icon :name="topic.isDone ? 'emoji_events' : 'menu_book'" size="20px" />
                </div>
              </q-item-section>

              <q-item-section>
                <q-item-label
                  class="text-subtitle1 text-weight-bold text-main transition-color"
                  :class="{ 'text-strike opacity-50': topic.isDone }"
                >
                  {{ index + 1 }}. {{ topic.title }}
                </q-item-label>
                <q-item-label caption class="text-muted q-mt-xs transition-color">
                  {{ topic.subtitle }}
                </q-item-label>
              </q-item-section>

              <q-item-section side v-if="topic.isDone">
                <q-icon name="check_circle" color="positive" size="sm" />
              </q-item-section>
            </template>

            <q-card class="bg-transparent">
              <q-separator class="custom-separator" />
              <q-card-section class="bg-card-soft text-body1 q-pa-lg">
                <div v-if="topic.content !== 'Content coming soon...'">
                  <p class="text-main">{{ topic.content }}</p>
                </div>
                <div v-else class="flex flex-center column q-py-md opacity-50">
                  <q-icon name="construction" size="48px" class="text-muted q-mb-sm" />
                  <p class="text-muted text-weight-medium q-mb-none italic">
                    Content is currently being updated...
                  </p>
                </div>

                <div class="q-mt-lg flex justify-end">
                  <q-btn
                    :color="topic.isDone ? 'grey-5' : 'primary'"
                    :icon="topic.isDone ? 'undo' : 'check'"
                    :label="topic.isDone ? 'Mark as Incomplete' : 'Mark Complete'"
                    :outline="topic.isDone"
                    unelevated
                    class="text-weight-bold border-radius-8"
                    @click="toggleMarkDone(topic.id)"
                  />
                </div>
              </q-card-section>
            </q-card>
          </q-expansion-item>
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<style scoped>
/* ==========================================================
   1. CSS Variables for Light & Dark Mode
========================================================== */
.classroom-page {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --text-main: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.03), 0 2px 6px -2px rgba(0, 0, 0, 0.02);
  --shadow-hover: 0 10px 20px -3px rgba(0, 0, 0, 0.05), 0 4px 8px -2px rgba(0, 0, 0, 0.03);

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

.body--dark .classroom-page {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --bg-card-soft: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #23314b;
  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.3);
  --shadow-hover: 0 10px 20px -3px rgba(0, 0, 0, 0.4);

  --bg-icon-primary: rgba(59, 130, 246, 0.15);
  --bg-icon-positive: rgba(34, 197, 94, 0.15);
  --bg-icon-warning: rgba(245, 158, 11, 0.15);
  --bg-icon-negative: rgba(239, 68, 68, 0.15);
  --bg-icon-purple: rgba(168, 85, 247, 0.15);
}

/* ==========================================================
   2. Typography & Utilities
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
.opacity-50 {
  opacity: 0.5;
}
.transition-color {
  transition:
    color 0.3s ease,
    opacity 0.3s ease;
}
.text-strike {
  text-decoration: line-through;
}
.border-radius-8 {
  border-radius: 8px;
}

.bg-icon-primary {
  background-color: var(--bg-icon-primary);
}
.bg-icon-positive {
  background-color: var(--bg-icon-positive);
}

.icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

/* ==========================================================
   3. Cards & Structure (Summary Card Style)
========================================================== */
.dashboard-card {
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  position: relative;
}

.summary-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.summary-card:hover {
  transform: translateY(0px);
  box-shadow: var(--shadow-hover);
  border-color: rgba(255, 255, 255, 0.15); /* สว่างขึ้นตอน Hover สำหรับ Dark Mode */
}

.body--light .summary-card:hover {
  border-color: rgba(0, 0, 0, 0.15); /* เข้มขึ้นตอน Hover สำหรับ Light Mode */
}

.bg-card-soft {
  background-color: var(--bg-card-soft);
}

.custom-separator {
  background-color: var(--border-color);
}

/* ==========================================================
   4. Expansion Item Overrides
========================================================== */
.custom-expansion :deep(.q-item) {
  transition: background-color 0.3s ease;
}
.custom-expansion :deep(.q-item:hover) {
  background-color: var(--bg-card-soft);
}
.custom-expansion :deep(.q-focus-helper) {
  display: none !important;
}
</style>

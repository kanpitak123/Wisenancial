<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useNewsStore } from 'stores/NewsStore';
import type { UnifiedNewsItem } from 'src/types/news.types';

const newsStore = useNewsStore();

// ==========================================
// 🎛️ Filter Options
// ==========================================
interface FilterOption {
  label: string;
  value: string;
}

const allCurrencies: FilterOption = { label: 'All Currencies', value: '' };
const allImpacts: FilterOption = { label: 'All Impacts', value: '' };

const currencyOptions: FilterOption[] = [
  allCurrencies,
  { label: 'USD (US Dollar)', value: 'USD' },
  { label: 'EUR (Euro)', value: 'EUR' },
  { label: 'GBP (Pound)', value: 'GBP' },
  { label: 'JPY (Yen)', value: 'JPY' },
  { label: 'XAU (Gold)', value: 'XAU' },
];

const impactOptions: FilterOption[] = [
  allImpacts,
  { label: '🔴 High Impact', value: 'High' },
  { label: '🟠 Medium Impact', value: 'Medium' },
  { label: '🟡 Low Impact', value: 'Low' },
];

const selectedCurrency = ref<FilterOption>(allCurrencies);
const selectedImpact = ref<FilterOption>(allImpacts);

// ==========================================
// 📖 Pagination & Expand Logic
// ==========================================
const currentPage = ref(1);
const itemsPerPage = 10;
const expandedRow = ref<string | null>(null); // เก็บ ID ข่าวที่กำลังกดอ่านรายละเอียด

// คำนวณจำนวนหน้าทั้งหมด
const totalPages = computed(() => {
  return Math.ceil(newsStore.filteredNews.length / itemsPerPage);
});

// ตัดข้อมูลข่าวมาแสดงเฉพาะหน้าที่เลือก
const paginatedNews = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return newsStore.filteredNews.slice(start, end);
});

const { safeLoad } = useSafeLoad();

onMounted(async () => {
  await safeLoad(() => newsStore.fetchNews(), 'โหลดข่าวไม่สำเร็จ');
  newsStore.connectSocket();
});

onUnmounted(() => {
  newsStore.disconnectSocket();
});

// 🔄 เมื่อเปลี่ยนตัวกรอง ให้รีเซ็ตหน้ากลับไปที่ 1 และปิดรายละเอียด
const applyFilters = async () => {
  currentPage.value = 1;
  expandedRow.value = null;
  newsStore.setFilters({
    country: selectedCurrency.value.value,
    impact: selectedImpact.value.value,
  });
  await safeLoad(() => newsStore.fetchNews(), 'โหลดข่าวไม่สำเร็จ');
};

// 🖱️ สลับเปิด-ปิด อ่านรายละเอียดข่าว
const toggleDetails = (newsId: string) => {
  expandedRow.value = expandedRow.value === newsId ? null : newsId;
};

// 📌 ปักหมุด
const handlePin = async (item: UnifiedNewsItem) => {
  await newsStore.togglePin(item);
};

// ==========================================
// 🎨 Formatters & Helpers
// ==========================================
const getImpactColor = (impact: string | null) => {
  if (impact === 'High') return '#ef4444'; // Red
  if (impact === 'Medium') return '#f97316'; // Orange
  if (impact === 'Low') return '#eab308'; // Yellow
  return '#94a3b8'; // Grey
};

const formatTime = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
</script>

<template>
  <q-page class="calendar-page q-pa-md q-pa-lg-xl">
    <div class="row items-center justify-between q-mb-lg">
      <div>
        <div class="text-h4 text-weight-bold" style="color: var(--text-main)">News & Calendar</div>
        <div class="text-subtitle2 text-positive flex items-center q-mt-xs">
          <div class="online-dot q-mr-sm"></div>
          Live Market Updates
        </div>
      </div>

      <div class="row q-gutter-sm items-center q-mt-md q-mt-md-none">
        <q-select
          v-model="selectedCurrency"
          :options="currencyOptions"
          outlined
          dense
          options-dense
          bg-color="input-bg"
          class="filter-select"
          @update:model-value="applyFilters"
        />
        <q-select
          v-model="selectedImpact"
          :options="impactOptions"
          outlined
          dense
          options-dense
          bg-color="input-bg"
          class="filter-select"
          @update:model-value="applyFilters"
        />
        <q-btn outline color="primary" icon="refresh" class="refresh-btn" @click="applyFilters">
          <q-tooltip>Refresh News</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div v-if="newsStore.isLoading" class="flex flex-center q-py-xl">
      <q-spinner-dots color="primary" size="50px" />
    </div>

    <div
      v-else-if="newsStore.filteredNews.length === 0"
      class="flex flex-center column q-py-xl text-grey-6"
    >
      <q-icon name="event_busy" size="60px" class="q-mb-md opacity-50" />
      <div class="text-h6">No news events match your criteria</div>
    </div>

    <div v-else class="news-list-container">
      <div v-for="news in paginatedNews" :key="news.id" class="q-mb-md">
        <q-card
          class="news-card cursor-pointer shadow-sm"
          :class="{ 'pinned-card': news.isPinned, 'active-card': expandedRow === news.id }"
          @click="toggleDetails(news.id)"
        >
          <q-card-section class="q-pa-md row items-center no-wrap">
            <div class="col-3 col-sm-2 column q-pr-sm">
              <span class="text-weight-bold text-primary" style="font-size: 15px">{{
                formatTime(news.publishedAt)
              }}</span>
              <span class="text-caption text-grey-6">{{ formatDate(news.publishedAt) }}</span>
            </div>

            <div class="col-auto column items-center q-px-sm hidden-mobile">
              <q-badge color="grey-3" text-color="dark" class="text-weight-bold q-mb-xs">
                {{ news.country || 'ALL' }}
              </q-badge>
              <div class="impact-box" :style="{ backgroundColor: getImpactColor(news.impact) }">
                <q-tooltip class="bg-grey-9 text-white"
                  >{{ news.impact || 'Low' }} Impact</q-tooltip
                >
              </div>
            </div>

            <div class="col q-px-md column justify-center">
              <div
                class="text-weight-bold event-title row items-center no-wrap"
                style="color: var(--text-main)"
              >
                <q-icon
                  name="article"
                  :style="{ color: getImpactColor(news.impact) }"
                  size="18px"
                  class="q-mr-sm"
                />
                <span class="ellipsis">{{ news.title }}</span>
                <q-badge
                  v-if="$q.screen.lt.sm"
                  color="grey-3"
                  text-color="dark"
                  class="q-ml-sm show-only-mobile"
                >
                  {{ news.country || 'ALL' }}
                </q-badge>
              </div>
              <div
                v-if="news.isPinned"
                class="text-caption text-warning flex items-center q-mt-xs"
                style="font-weight: 600"
              >
                <q-icon name="push_pin" size="14px" class="q-mr-xs" /> Pinned Event
              </div>
            </div>

            <div class="col-auto row q-gutter-x-lg q-px-md hidden-mobile text-right">
              <div class="column">
                <span class="text-caption text-grey-6 text-uppercase" style="font-size: 10px"
                  >Actual</span
                >
                <span
                  class="text-weight-bold"
                  :class="news.actual ? 'text-positive' : 'text-grey-5'"
                  >{{ news.actual || '--' }}</span
                >
              </div>
              <div class="column">
                <span class="text-caption text-grey-6 text-uppercase" style="font-size: 10px"
                  >Forecast</span
                >
                <span class="text-weight-bold" style="color: var(--text-main)">{{
                  news.forecast || '--'
                }}</span>
              </div>
              <div class="column">
                <span class="text-caption text-grey-6 text-uppercase" style="font-size: 10px"
                  >Previous</span
                >
                <span class="text-weight-bold" style="color: var(--text-muted)">{{
                  news.previous || '--'
                }}</span>
              </div>
            </div>

            <div class="col-auto q-pl-sm" @click.stop>
              <q-btn
                flat
                round
                dense
                :icon="news.isPinned ? 'star' : 'star_border'"
                :color="news.isPinned ? 'warning' : 'grey-5'"
                class="pin-btn"
                @click="handlePin(news)"
              >
                <q-tooltip class="bg-grey-9">{{
                  news.isPinned ? 'Unpin' : 'Pin to Top'
                }}</q-tooltip>
              </q-btn>
            </div>
          </q-card-section>

          <q-slide-transition>
            <div v-if="expandedRow === news.id">
              <q-separator />
              <q-card-section class="news-detail-section q-pa-md">
                <div class="row q-col-gutter-md">
                  <div
                    class="col-12 show-only-mobile row justify-around q-mb-sm bg-white q-pa-sm rounded-borders border-solid border-grey-3"
                  >
                    <div class="column items-center">
                      <span class="text-caption text-grey-6">Actual</span>
                      <span
                        class="text-weight-bold"
                        :class="news.actual ? 'text-positive' : 'text-grey-5'"
                        >{{ news.actual || '--' }}</span
                      >
                    </div>
                    <div class="column items-center">
                      <span class="text-caption text-grey-6">Forecast</span>
                      <span class="text-weight-bold text-dark">{{ news.forecast || '--' }}</span>
                    </div>
                    <div class="column items-center">
                      <span class="text-caption text-grey-6">Previous</span>
                      <span class="text-weight-bold text-grey-8">{{ news.previous || '--' }}</span>
                    </div>
                  </div>

                  <div class="col-12 col-md-6 column q-gutter-y-sm text-body2">
                    <div>
                      <span class="text-weight-bold text-primary">Source:</span>
                      <span class="q-ml-xs text-grey-8">Official Economic Data Provider</span>
                    </div>
                    <div>
                      <span class="text-weight-bold text-primary">Usual Effect:</span>
                      <span class="q-ml-xs text-grey-9"
                        >Actual > Forecast is generally good for the currency.</span
                      >
                    </div>
                  </div>

                  <div class="col-12 col-md-6 text-body2">
                    <div class="text-weight-bold text-primary q-mb-xs">Why Traders Care:</div>
                    <p class="text-grey-8" style="line-height: 1.5; margin-bottom: 0">
                      This data serves as a key indicator of economic health. Central banks often
                      use it to adjust interest rates, directly impacting market volatility and
                      currency strength.
                    </p>
                  </div>
                </div>
              </q-card-section>
            </div>
          </q-slide-transition>
        </q-card>
      </div>

      <div class="row justify-center q-mt-xl q-mb-lg" v-if="totalPages > 1">
        <q-pagination
          v-model="currentPage"
          :max="totalPages"
          :max-pages="5"
          boundary-numbers
          direction-links
          color="primary"
          active-color="primary"
          active-text-color="white"
          class="custom-pagination"
        />
      </div>
    </div>
  </q-page>
</template>

<style scoped>
.calendar-page {
  background: var(--bg-page);
  min-height: 100dvh;
}

.filter-select {
  width: 180px;
}
.filter-select :deep(.q-field__control) {
  border-radius: 8px;
  background: var(--bg-card);
}
.refresh-btn {
  height: 40px;
  border-radius: 8px;
}

/* ==========================================================
   News Card Styles
========================================================== */
.news-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}
.news-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.active-card {
  border: 1px solid #3b82f6 !important;
}

.pinned-card {
  background-color: #fffbeb !important;
  border-left: 4px solid #f59e0b;
}
.body--dark .pinned-card {
  background-color: rgba(245, 158, 11, 0.08) !important;
}

.event-title {
  font-size: 15px;
}

/* 📂 แถบสไลด์รายละเอียดข่าว */
.news-detail-section {
  background-color: #f8fafc;
}
.body--dark .news-detail-section {
  background-color: #0f172a;
  color: #cbd5e1;
}
.body--dark .news-detail-section .text-grey-8 {
  color: #94a3b8 !important;
}
.body--dark .news-detail-section .bg-white {
  background-color: #1e293b !important;
}

/* Elements */
.impact-box {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}
.online-dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.pin-btn {
  transition: transform 0.2s;
}
.pin-btn:active {
  transform: scale(0.7);
}

/* Pagination Override */
.custom-pagination :deep(.q-btn) {
  border-radius: 8px;
}

/* =========================================
   📱 Mobile Responsive
========================================= */
.show-only-mobile {
  display: none;
}

@media (max-width: 768px) {
  .hidden-mobile {
    display: none !important;
  }
  .show-only-mobile {
    display: flex;
  }
  .filter-select {
    width: 100%;
  }

  .event-title {
    font-size: 14px;
    white-space: normal;
  }
}
</style>

<script setup lang="ts">
/**
 * News — ฟีดข่าวตลาดผสม AI enrichment (เศรษฐกิจ + หุ้น) พร้อมอัปเดตเรียลไทม์ผ่าน WebSocket
 *
 * โครง 3 คอลัมน์ (อ้างอิงแนวทางจากหน้า NewsPage ของโปรเจกต์เก่า แต่ปรับใหม่ทั้งเลย์เอาต์และ
 * ต่อกับระบบจริงของโปรเจกต์นี้ ไม่ได้ก็อปโค้ดเดิมมา):
 *   - ซ้าย  = ตัวกรองขอบเขต (ทั้งหมด/ฟอเร็กซ์-เศรษฐกิจ/หุ้น) + ปักหมุด + สถานะ live socket
 *   - กลาง  = แถบตัวกรอง (ค้นหา/ระดับความสำคัญ/อารมณ์ตลาด) + ฟีดข่าว
 *   - ขวา   = หุ้นที่ถูกพูดถึงมากสุด (คำนวณจากข่าวที่โหลดมา) + ข่าวปักหมุด + ปฏิทินผลประกอบการ
 *
 * ทุกจุดต่อ store/service ที่มีอยู่แล้วจริงในโปรเจกต์นี้ ไม่มี mock data เลย:
 *   - useNews() ห่อ NewsStore ที่มี fetch/filter/pin/pagination/socket ครบอยู่แล้ว
 *   - marketService.getEarningsCalendar() เรียก GET /market/earnings-calendar จริง
 *     (backend EarningsCalendarService ตอนนี้ยัง return items: [] เสมอ — ยังไม่ implement
 *     จริง จึงเห็น empty state ในการ์ดปฏิทินจนกว่าฝั่ง backend จะเติมข้อมูล)
 *
 * ตัวกรอง importance/search เป็น client-side ล้วน (ดู NewsStore.filteredNews) จึงกรองทันที
 * ไม่ยิง API ซ้ำ ส่วน sentiment เป็น server-side (อยู่ใน buildServerQuery) จึงต้อง refetch
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLanguageStore } from 'stores/LanguageStore';
import { useNews } from 'src/composables/useNews';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { marketService } from 'src/services/market.service';
import { symbolAvatarColor } from 'src/utils/symbol-avatar';
import type { NewsScope, UnifiedNewsItem } from 'src/types/news.types';
import type { EarningsCalendarItem } from 'src/types/market.types';

const languageStore = useLanguageStore();
const router = useRouter();
const { safeLoad } = useSafeLoad();

const {
  scope,
  language,
  news,
  displayedNews,
  filters,
  isLoading,
  isPinning,
  hasNews,
  canLoadMore,
  initialize,
  changeScope,
  changeLanguage,
  updateFilters,
  applyFilters,
  togglePin,
  clearFilters,
  refresh,
  loadMore,
} = useNews();

/* -------------------------------------------------------------- */
/* Left rail — scope + pinned quick filter                         */
/* -------------------------------------------------------------- */
const scopeOptions = computed(() => [
  {
    value: 'ALL' as NewsScope,
    label: languageStore.isThai ? 'ทั้งหมด' : 'All',
    icon: 'dynamic_feed',
  },
  {
    value: 'TRADER' as NewsScope,
    label: languageStore.isThai ? 'ฟอเร็กซ์ / เศรษฐกิจ' : 'Forex / Economic',
    icon: 'currency_exchange',
  },
  {
    value: 'INVESTOR' as NewsScope,
    label: languageStore.isThai ? 'หุ้น' : 'Stocks',
    icon: 'show_chart',
  },
]);

const onScopeChange = (value: NewsScope) => {
  void safeLoad(() => changeScope(value), 'โหลดข่าวไม่สำเร็จ');
};

const pinnedOnly = ref(false);
const pinnedCount = computed(() => news.value.filter((item) => item.isPinned).length);

const onToggleLanguage = () => {
  void safeLoad(
    () => changeLanguage(language.value === 'th' ? 'en' : 'th'),
    'เปลี่ยนภาษาไม่สำเร็จ',
  );
};

/* -------------------------------------------------------------- */
/* Center — filter row                                             */
/* -------------------------------------------------------------- */
const importanceOptions = computed(() => [
  { value: 'all', label: languageStore.isThai ? 'ทุกระดับ' : 'All' },
  { value: 'LOW', label: languageStore.isThai ? 'ต่ำ' : 'Low' },
  { value: 'MEDIUM', label: languageStore.isThai ? 'ปานกลาง' : 'Medium' },
  { value: 'HIGH', label: languageStore.isThai ? 'สูง' : 'High' },
  { value: 'CRITICAL', label: languageStore.isThai ? 'วิกฤต' : 'Critical' },
]);

const setImportance = (value: string) => {
  updateFilters({ importance: value });
};

const sentimentOptions = computed(() => [
  { value: 'all', label: languageStore.isThai ? 'ทุกอารมณ์' : 'All' },
  { value: 'POSITIVE', label: languageStore.isThai ? 'เชิงบวก' : 'Positive' },
  { value: 'NEUTRAL', label: languageStore.isThai ? 'เป็นกลาง' : 'Neutral' },
  { value: 'NEGATIVE', label: languageStore.isThai ? 'เชิงลบ' : 'Negative' },
]);

const setSentiment = (value: string) => {
  void safeLoad(() => applyFilters({ sentiment: value }), 'โหลดข่าวไม่สำเร็จ');
};

const searchInput = ref('');
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const onSearchInput = (value: string | number | null) => {
  searchInput.value = String(value ?? '');

  if (searchDebounce) clearTimeout(searchDebounce);

  searchDebounce = setTimeout(() => {
    updateFilters({ search: searchInput.value });
  }, 250);
};

const hasActiveFilters = computed(
  () =>
    filters.value.importance !== 'all' ||
    filters.value.sentiment !== 'all' ||
    Boolean(filters.value.search) ||
    pinnedOnly.value,
);

const onClearFilters = () => {
  pinnedOnly.value = false;
  searchInput.value = '';
  clearFilters();
  void safeLoad(() => refresh(), 'โหลดข่าวไม่สำเร็จ');
};

const onRefresh = () => {
  void safeLoad(() => refresh(), 'โหลดข่าวไม่สำเร็จ');
};

const onLoadMore = () => {
  void safeLoad(() => loadMore(), 'โหลดข่าวเพิ่มเติมไม่สำเร็จ');
};

const feedItems = computed(() =>
  pinnedOnly.value ? displayedNews.value.filter((item) => item.isPinned) : displayedNews.value,
);

/* -------------------------------------------------------------- */
/* Feed card helpers                                                */
/* -------------------------------------------------------------- */
const IMPORTANCE_COLOR: Record<string, string> = {
  LOW: 'grey-6',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'negative',
};

const importanceColor = (importance: string) => IMPORTANCE_COLOR[importance] ?? 'grey-6';

const IMPORTANCE_LABEL: Record<string, [string, string]> = {
  LOW: ['Low', 'ต่ำ'],
  MEDIUM: ['Medium', 'ปานกลาง'],
  HIGH: ['High', 'สูง'],
  CRITICAL: ['Critical', 'วิกฤต'],
};

const importanceLabel = (importance: string) => {
  const pair = IMPORTANCE_LABEL[importance] ?? [importance, importance];

  return languageStore.isThai ? pair[1] : pair[0];
};

const trendIcon = (item: UnifiedNewsItem) => {
  if (item.aiTrend === 'BULLISH' || item.sentiment === 'POSITIVE') return 'trending_up';
  if (item.aiTrend === 'BEARISH' || item.sentiment === 'NEGATIVE') return 'trending_down';

  return 'trending_flat';
};

const trendColor = (item: UnifiedNewsItem) => {
  if (item.aiTrend === 'BULLISH' || item.sentiment === 'POSITIVE') return 'positive';
  if (item.aiTrend === 'BEARISH' || item.sentiment === 'NEGATIVE') return 'negative';

  return 'grey-6';
};

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  const locale = languageStore.isThai ? 'th-TH' : 'en-GB';
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const isSameDay = date.toDateString() === new Date().toDateString();

  if (isSameDay) return timeStr;

  const dateStr = date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });

  return `${dateStr} · ${timeStr}`;
};

const goToSymbol = (symbol: string) => {
  void router.push(`/stock/${symbol.toUpperCase()}`);
};

const onTogglePin = (item: UnifiedNewsItem) => {
  void safeLoad(() => togglePin(item), 'ไม่สามารถอัปเดตการปักหมุดได้');
};

/* -------------------------------------------------------------- */
/* Right rail — trending symbols + pinned preview + earnings        */
/* -------------------------------------------------------------- */
const trendingSymbols = computed(() => {
  const counts = new Map<string, number>();

  for (const item of news.value) {
    for (const symbol of item.relatedSymbols) {
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([symbol, count]) => ({ symbol, count }));
});

const pinnedPreview = computed(() => news.value.filter((item) => item.isPinned).slice(0, 4));

const earningsItems = ref<EarningsCalendarItem[]>([]);
const earningsLoading = ref(false);

const loadEarnings = async () => {
  earningsLoading.value = true;

  const result = await safeLoad(
    () => marketService.getEarningsCalendar(14),
    'โหลดปฏิทินผลประกอบการไม่สำเร็จ',
  );

  earningsItems.value = result?.items ?? [];
  earningsLoading.value = false;
};

const formatEarningsDate = (iso: string) =>
  new Date(iso).toLocaleDateString(languageStore.isThai ? 'th-TH' : 'en-GB', {
    day: '2-digit',
    month: 'short',
  });

onMounted(() => {
  void safeLoad(() => initialize(), 'โหลดข่าวไม่สำเร็จ');
  void loadEarnings();
});
</script>

<template>
  <q-page class="news-page" data-test="news-page">
    <div class="news-grid">
      <!-- ============ LEFT RAIL ============ -->
      <aside class="news-rail">
        <div class="rail-section">
          <div class="rail-label">{{ languageStore.isThai ? 'ขอบเขตข่าว' : 'Scope' }}</div>
          <button
            v-for="opt in scopeOptions"
            :key="opt.value"
            type="button"
            class="scope-item"
            :class="{ 'scope-item--active': scope === opt.value }"
            @click="onScopeChange(opt.value)"
          >
            <q-icon :name="opt.icon" size="18px" />
            <span>{{ opt.label }}</span>
          </button>
        </div>

        <div class="rail-section">
          <button
            type="button"
            class="scope-item"
            :class="{ 'scope-item--active': pinnedOnly }"
            @click="pinnedOnly = !pinnedOnly"
          >
            <q-icon name="push_pin" size="17px" />
            <span>{{ languageStore.isThai ? 'ข่าวปักหมุด' : 'Pinned' }}</span>
            <q-badge
              v-if="pinnedCount"
              rounded
              color="warning"
              text-color="dark"
              :label="pinnedCount"
              class="q-ml-auto"
            />
          </button>
        </div>

        <div class="rail-live">
          <span class="live-dot" />
          <span>{{ languageStore.isThai ? 'อัปเดตเรียลไทม์' : 'Live updates' }}</span>
        </div>

        <q-btn flat dense no-caps size="sm" class="lang-toggle" @click="onToggleLanguage">
          <q-icon name="translate" size="15px" class="q-mr-xs" />
          {{ language === 'th' ? 'TH' : 'EN' }} ·
          {{ languageStore.isThai ? 'สลับภาษา' : 'Switch language' }}
        </q-btn>
      </aside>

      <!-- ============ CENTER — FEED ============ -->
      <section class="news-main">
        <header class="news-header">
          <div>
            <h1 class="news-title">{{ languageStore.isThai ? 'ข่าวตลาด' : 'Market News' }}</h1>
            <p class="news-subtitle">
              {{
                languageStore.isThai
                  ? 'ข่าวเศรษฐกิจและหุ้นเสริม AI พร้อมอัปเดตเรียลไทม์'
                  : 'AI-enhanced economic and market news, updated in real time'
              }}
            </p>
          </div>
          <q-btn round flat icon="refresh" :loading="isLoading" @click="onRefresh">
            <q-tooltip>{{ languageStore.isThai ? 'รีเฟรช' : 'Refresh' }}</q-tooltip>
          </q-btn>
        </header>

        <div class="filter-row">
          <q-input
            :model-value="searchInput"
            dense
            outlined
            class="search-input"
            :placeholder="
              languageStore.isThai ? 'ค้นหาข่าว สัญลักษณ์ แหล่งข่าว...' : 'Search headline, symbol, source...'
            "
            @update:model-value="onSearchInput"
          >
            <template #prepend><q-icon name="search" size="18px" /></template>
          </q-input>

          <div class="pill-group">
            <button
              v-for="opt in importanceOptions"
              :key="opt.value"
              type="button"
              class="filter-pill"
              :class="{ 'filter-pill--active': filters.importance === opt.value }"
              @click="setImportance(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <div class="pill-group">
            <button
              v-for="opt in sentimentOptions"
              :key="opt.value"
              type="button"
              class="filter-pill"
              :class="{ 'filter-pill--active': filters.sentiment === opt.value }"
              @click="setSentiment(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <q-btn
            v-if="hasActiveFilters"
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            @click="onClearFilters"
          >
            {{ languageStore.isThai ? 'ล้างตัวกรอง' : 'Clear' }}
          </q-btn>
        </div>

        <!-- Loading skeleton (first load only) -->
        <div v-if="isLoading && !hasNews" class="news-skeleton">
          <div v-for="n in 5" :key="n" class="skeleton-card" />
        </div>

        <!-- Empty state -->
        <div v-else-if="!feedItems.length" class="news-empty">
          <q-icon name="event_busy" size="52px" />
          <p class="news-empty__title">
            {{ languageStore.isThai ? 'ไม่พบข่าวที่ตรงเงื่อนไข' : 'No news match your filters' }}
          </p>
          <q-btn
            v-if="hasActiveFilters"
            no-caps
            unelevated
            color="primary"
            @click="onClearFilters"
          >
            {{ languageStore.isThai ? 'ล้างตัวกรอง' : 'Clear filters' }}
          </q-btn>
        </div>

        <!-- Feed -->
        <div v-else class="news-feed">
          <article
            v-for="item in feedItems"
            :key="item.id"
            class="news-card"
            :class="{ 'news-card--pinned': item.isPinned }"
          >
            <div class="news-card__top">
              <div class="news-card__source">
                <template v-if="item.kind === 'ECONOMIC_EVENT'">
                  <span class="source-chip">{{ item.country || 'ALL' }}</span>
                  <span
                    class="impact-dot"
                    :class="`impact-dot--${(item.impact || 'low').toLowerCase()}`"
                  />
                </template>
                <template v-else>
                  <span
                    class="source-avatar"
                    :style="{ background: symbolAvatarColor(item.source || item.title) }"
                  >
                    {{ (item.source || '?').slice(0, 2).toUpperCase() }}
                  </span>
                  <span class="source-name">
                    {{ item.source || (languageStore.isThai ? 'ไม่ทราบแหล่งข่าว' : 'Unknown source') }}
                  </span>
                </template>
              </div>
              <span class="news-time">{{ formatDateTime(item.publishedAt) }}</span>
            </div>

            <h3 class="news-card__title">{{ item.title }}</h3>
            <p v-if="item.summary" class="news-card__summary">{{ item.summary }}</p>

            <div v-if="item.aiSummary" class="ai-snapshot">
              <q-icon name="auto_awesome" size="14px" />
              <span>{{ item.aiSummary }}</span>
            </div>

            <div v-if="item.kind === 'ECONOMIC_EVENT'" class="econ-trio">
              <div>
                <span class="econ-label">{{ languageStore.isThai ? 'จริง' : 'Actual' }}</span>
                <span class="econ-value" :class="{ 'econ-value--set': item.actual }">
                  {{ item.actual || '--' }}
                </span>
              </div>
              <div>
                <span class="econ-label">{{ languageStore.isThai ? 'คาดการณ์' : 'Forecast' }}</span>
                <span class="econ-value">{{ item.forecast || '--' }}</span>
              </div>
              <div>
                <span class="econ-label">{{ languageStore.isThai ? 'ครั้งก่อน' : 'Previous' }}</span>
                <span class="econ-value econ-value--muted">{{ item.previous || '--' }}</span>
              </div>
            </div>

            <div class="news-card__bottom">
              <div class="news-card__chips">
                <q-badge
                  :color="importanceColor(item.importance)"
                  :label="importanceLabel(item.importance)"
                  class="importance-badge"
                />
                <q-icon
                  v-if="item.kind === 'MARKET_ARTICLE'"
                  :name="trendIcon(item)"
                  :color="trendColor(item)"
                  size="16px"
                />
                <span
                  v-for="symbol in item.relatedSymbols.slice(0, 4)"
                  :key="symbol"
                  class="symbol-chip"
                  @click="goToSymbol(symbol)"
                >
                  {{ symbol }}
                </span>
              </div>
              <q-btn
                flat
                round
                dense
                :icon="item.isPinned ? 'star' : 'star_border'"
                :color="item.isPinned ? 'warning' : 'grey-6'"
                :loading="isPinning.includes(item.id)"
                @click="onTogglePin(item)"
              >
                <q-tooltip>
                  {{
                    item.isPinned
                      ? languageStore.isThai
                        ? 'เลิกปักหมุด'
                        : 'Unpin'
                      : languageStore.isThai
                        ? 'ปักหมุด'
                        : 'Pin'
                  }}
                </q-tooltip>
              </q-btn>
            </div>
          </article>

          <div v-if="canLoadMore" class="load-more">
            <q-btn
              outline
              no-caps
              color="primary"
              :loading="isLoading"
              :label="languageStore.isThai ? 'โหลดข่าวเพิ่มเติม' : 'Load more'"
              @click="onLoadMore"
            />
          </div>
        </div>
      </section>

      <!-- ============ RIGHT RAIL — WIDGETS ============ -->
      <aside class="news-side">
        <div class="side-card">
          <div class="side-card__title">
            <q-icon name="local_fire_department" size="16px" color="warning" />
            {{ languageStore.isThai ? 'หุ้นที่ถูกพูดถึงมากสุด' : 'Trending symbols' }}
          </div>
          <div v-if="trendingSymbols.length" class="trending-list">
            <button
              v-for="t in trendingSymbols"
              :key="t.symbol"
              type="button"
              class="trending-row"
              @click="goToSymbol(t.symbol)"
            >
              <span class="trending-symbol">{{ t.symbol }}</span>
              <span class="trending-count">
                {{ t.count }} {{ languageStore.isThai ? 'ข่าว' : 'mentions' }}
              </span>
            </button>
          </div>
          <p v-else class="side-empty">{{ languageStore.isThai ? 'ยังไม่มีข้อมูล' : 'No data yet' }}</p>
        </div>

        <div v-if="pinnedPreview.length" class="side-card">
          <div class="side-card__title">
            <q-icon name="push_pin" size="16px" color="warning" />
            {{ languageStore.isThai ? 'ข่าวปักหมุด' : 'Pinned news' }}
          </div>
          <div class="pinned-list">
            <div v-for="item in pinnedPreview" :key="item.id" class="pinned-row">
              <span class="pinned-dot" />
              <span class="pinned-title">{{ item.title }}</span>
            </div>
          </div>
        </div>

        <div class="side-card">
          <div class="side-card__title">
            <q-icon name="event" size="16px" color="primary" />
            {{ languageStore.isThai ? 'ปฏิทินผลประกอบการ' : 'Earnings calendar' }}
          </div>
          <div v-if="earningsLoading" class="side-loading">
            <q-spinner-dots size="22px" color="primary" />
          </div>
          <div v-else-if="earningsItems.length" class="earnings-list">
            <div
              v-for="item in earningsItems"
              :key="`${item.symbol}-${item.earningsDate}`"
              class="earnings-row"
            >
              <span class="earnings-date">{{ formatEarningsDate(item.earningsDate) }}</span>
              <span class="earnings-symbol">{{ item.symbol }}</span>
              <span class="earnings-eps">EPS {{ item.epsEstimate ?? '--' }}</span>
            </div>
          </div>
          <p v-else class="side-empty">
            {{
              languageStore.isThai
                ? 'ยังไม่มีกำหนดการประกาศผลประกอบการในช่วง 14 วันข้างหน้า'
                : 'No earnings scheduled in the next 14 days'
            }}
          </p>
        </div>
      </aside>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.news-page {
  padding: 20px 24px 60px;
  max-width: 1440px;
  margin: 0 auto;
}

.news-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}

/* ===== Left rail ===== */
.news-rail {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 20px;
}

.rail-label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.rail-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scope-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.scope-item:hover {
  background: var(--bg-card-soft);
  color: var(--text-primary);
}

.scope-item--active {
  background: rgba(133, 182, 176, 0.16);
  color: var(--accent-800);
  font-weight: 700;
}

.body--dark .scope-item--active {
  color: var(--accent-400);
}

.rail-live {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 600;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  animation: news-pulse 2s infinite;
  flex-shrink: 0;
}

@keyframes news-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

.lang-toggle {
  align-self: flex-start;
  color: var(--text-secondary);
}

/* ===== Center ===== */
.news-main {
  min-width: 0;
}

.news-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.news-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.news-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin: 4px 0 0;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.search-input {
  flex: 1 1 220px;
  min-width: 200px;
}

.search-input :deep(.q-field__control) {
  border-radius: 10px;
  background: var(--bg-card);
}

.pill-group {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.filter-pill {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
}

.filter-pill--active {
  background: var(--accent-800);
  color: #fff;
  border-color: var(--accent-800);
}

.body--dark .filter-pill--active {
  background: var(--accent-400);
  color: var(--accent-900);
  border-color: var(--accent-400);
}

/* ===== Skeleton / empty ===== */
.news-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-card {
  height: 128px;
  border-radius: 16px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.08) 25%,
    rgba(148, 163, 184, 0.18) 50%,
    rgba(148, 163, 184, 0.08) 75%
  );
  background-size: 200% 100%;
  animation: news-shimmer 1.4s ease-in-out infinite;
}

@keyframes news-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.news-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--text-muted);
  text-align: center;
}

.news-empty__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

/* ===== Feed cards ===== */
.news-feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.news-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px 18px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.news-card:hover {
  border-color: var(--accent-400);
  box-shadow: 0 8px 22px -10px rgba(27, 54, 54, 0.18);
  transform: translateY(-1px);
}

.body--dark .news-card:hover {
  box-shadow: 0 10px 26px -8px rgba(0, 0, 0, 0.5);
}

.news-card--pinned {
  border-left: 3px solid var(--accent-600);
}

.news-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.news-card__source {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.source-chip {
  font-size: 10.5px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-card-soft);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.impact-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}

.impact-dot--high,
.impact-dot--critical {
  background: var(--q-negative, #c10015);
}

.impact-dot--medium {
  background: var(--q-warning, #f2c037);
}

.impact-dot--low {
  background: var(--q-info, #31ccec);
}

.source-avatar {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 9.5px;
  font-weight: 800;
  flex-shrink: 0;
}

.source-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.news-card__title {
  font-size: 14.5px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text-primary);
  line-height: 1.4;
}

.news-card__summary {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin: 0 0 8px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ai-snapshot {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  background: var(--bg-card-soft);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  line-height: 1.5;
}

.ai-snapshot :deep(.q-icon) {
  color: var(--accent-700);
  flex-shrink: 0;
  margin-top: 2px;
}

.body--dark .ai-snapshot :deep(.q-icon) {
  color: var(--accent-400);
}

.econ-trio {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}

.econ-trio > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.econ-label {
  font-size: 9.5px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
}

.econ-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.econ-value--set {
  color: var(--accent-700);
}

.body--dark .econ-value--set {
  color: var(--accent-400);
}

.econ-value--muted {
  color: var(--text-muted);
}

.news-card__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.news-card__chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.importance-badge {
  font-size: 9.5px;
  font-weight: 800;
  text-transform: uppercase;
}

.symbol-chip {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-card-soft);
  color: var(--accent-800);
  cursor: pointer;
  border: 1px solid transparent;
}

.symbol-chip:hover {
  border-color: var(--accent-400);
}

.body--dark .symbol-chip {
  color: var(--accent-400);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 8px 0 16px;
}

/* ===== Right rail ===== */
.news-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 20px;
}

.side-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 14px 16px;
}

.side-card__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.side-empty {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.side-loading {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

.trending-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.trending-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: transparent;
  font: inherit;
  padding: 7px 4px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
}

.trending-row:hover {
  background: var(--bg-card-soft);
}

.trending-symbol {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--text-primary);
}

.trending-count {
  font-size: 11px;
  color: var(--text-muted);
}

.pinned-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pinned-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.pinned-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-600);
  margin-top: 6px;
  flex-shrink: 0;
}

.pinned-title {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.earnings-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.earnings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 5px 0;
  border-bottom: 1px solid var(--border-color);
}

.earnings-row:last-child {
  border-bottom: none;
}

.earnings-date {
  font-weight: 700;
  color: var(--accent-700);
  width: 44px;
  flex-shrink: 0;
}

.body--dark .earnings-date {
  color: var(--accent-400);
}

.earnings-symbol {
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
}

.earnings-eps {
  color: var(--text-muted);
  font-size: 11px;
}

/* ===== Responsive ===== */
@media (max-width: 1180px) {
  .news-grid {
    grid-template-columns: 1fr;
  }

  .news-rail {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .rail-section {
    flex-direction: row;
  }

  .scope-item {
    width: auto;
  }

  .rail-live {
    border-top: none;
    padding-top: 0;
  }

  .news-side {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .side-card {
    flex: 1 1 260px;
  }
}

@media (max-width: 640px) {
  .news-page {
    padding: 14px;
  }

  .econ-trio {
    gap: 12px;
  }
}
</style>

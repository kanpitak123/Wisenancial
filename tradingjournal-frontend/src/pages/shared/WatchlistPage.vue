<script setup lang="ts">
/**
 * Watchlist — ฟีดคำแนะนำหุ้นจาก AI (ต้นฉบับคือหน้า StockRadar ของโปรเจกต์เก่า)
 *
 * ของเดิมที่ path นี้เป็นรายการที่ผู้ใช้กดเพิ่มเอง ซึ่งไม่ใช่หน้าต้นฉบับ — ตัวจริงคือฟีด
 * AI stock-recommendations 4 หมวด ที่ backend มีให้อยู่แล้วที่ GET /stocks/radar
 *
 * ⚠️ route /Watchlist ใช้ร่วมกันทั้งโหมด Forex และ Stock แต่ฟีด radar เป็นข้อมูลหุ้นล้วน
 * โหมด Forex จึงเห็นเฉพาะส่วน "ติดตามเอง" ด้านล่าง ไม่งั้นเมนู Watchlist ของ Forex จะพัง
 *
 * ฟีเจอร์เพิ่ม/ลบสัญลักษณ์เอง (WatchlistStore + /watchlist CRUD จริง) ไม่ได้ถูกลบทิ้ง
 * แค่ย้ายลงไปเป็น section เสริมท้ายหน้า
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useWatchlist } from 'src/composables/useWatchlist';
import { useWorkspace } from 'src/composables/useWorkspace';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useLanguageStore } from 'stores/LanguageStore';
import {
  useAiRecommendationsStore,
  type RadarCategory,
  type RadarDateBucket,
  type RadarStock,
} from 'stores/AiRecommendationsStore';
import { SECTOR_OPTIONS } from 'src/services/stocks.service';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';
import type { StockSector } from 'src/types/stocks.types';
import type { WatchlistItem } from 'src/types/watchlist.types';

const $q = useQuasar();
const router = useRouter();
const portStore = usePortfolioStore();
const languageStore = useLanguageStore();
const recStore = useAiRecommendationsStore();
const { meta: workspaceMeta, isInvestor } = useWorkspace();
const { safeLoad } = useSafeLoad();

const { currentItems, isLoading, isSubmitting, loadForPortfolio, addAsset, removeAsset } =
  useWatchlist();

/* ------------------------------------------------------------------ */
/* AI radar feed                                                       */
/* ------------------------------------------------------------------ */
onMounted(() => {
  if (isInvestor.value) void recStore.loadRecommendations();
});

// สลับจาก Forex มา Stock ระหว่างอยู่หน้านี้ก็ต้องได้ฟีด ไม่ต้องรีเฟรชเอง
watch(isInvestor, (investor) => {
  if (investor) void recStore.loadRecommendations();
});

const sectorOptions = computed(() => [
  { label: languageStore.isThai ? 'ทุกกลุ่ม' : 'All sectors', value: 'ALL' as const },
  ...SECTOR_OPTIONS.map((s) => ({ label: s, value: s })),
]);

const dateOptions = computed(() => [
  { label: languageStore.isThai ? 'ทุกช่วงเวลา' : 'All Dates', value: 'ALL' as const },
  { label: languageStore.isThai ? 'วันนี้' : 'Today', value: 'TODAY' as RadarDateBucket },
  {
    label: languageStore.isThai ? 'สัปดาห์นี้' : 'This Week',
    value: 'THIS_WEEK' as RadarDateBucket,
  },
  {
    label: languageStore.isThai ? 'เดือนนี้' : 'This Month',
    value: 'THIS_MONTH' as RadarDateBucket,
  },
]);

const changeMagnitudeOptions = computed(() => [
  { label: languageStore.isThai ? 'ทุกขนาด' : 'Any Change', value: 0 },
  { label: '5%+', value: 5 },
  { label: '10%+', value: 10 },
  { label: '20%+', value: 20 },
]);

interface SectionMeta {
  category: RadarCategory;
  icon: string;
  /** class ที่ถือสี accent ของ section (ดู <style>) */
  iconClass: string;
  titleEn: string;
  titleTh: string;
}

const SECTION_META: Record<RadarCategory, SectionMeta> = {
  Upside: {
    category: 'Upside',
    icon: 'trending_up',
    iconClass: 'is-upside',
    titleEn: 'Upside',
    titleTh: 'ขาขึ้น',
  },
  Downside: {
    category: 'Downside',
    icon: 'trending_down',
    iconClass: 'is-downside',
    titleEn: 'Downside',
    titleTh: 'ขาลง',
  },
  'Near-recommended': {
    category: 'Near-recommended',
    icon: 'star',
    iconClass: 'is-near-recommended',
    titleEn: 'Near Recommended',
    titleTh: 'ใกล้เกณฑ์แนะนำ',
  },
  'Not-recommended': {
    category: 'Not-recommended',
    icon: 'highlight_off',
    iconClass: 'is-not-recommended',
    titleEn: 'Not Recommended',
    titleTh: 'ไม่แนะนำ',
  },
};

const sectionTitle = (meta: SectionMeta) => (languageStore.isThai ? meta.titleTh : meta.titleEn);

// Upside / Downside — มีแถวตัวกรองของตัวเอง ไม่จำกัดจำนวนผลลัพธ์ (ตัวกรองคุมจำนวนเอง)
const filterableSections = computed(() => [
  {
    meta: SECTION_META.Upside,
    items: recStore.upsideSection,
    filters: recStore.upsideFilters,
    setSector: (sector: StockSector | 'ALL') => recStore.setUpsideSector(sector),
    setDateBucket: (bucket: RadarDateBucket | 'ALL') => recStore.setUpsideDateBucket(bucket),
    setMinChange: (value: number) => recStore.setUpsideMinChange(value),
  },
  {
    meta: SECTION_META.Downside,
    items: recStore.downsideSection,
    filters: recStore.downsideFilters,
    setSector: (sector: StockSector | 'ALL') => recStore.setDownsideSector(sector),
    setDateBucket: (bucket: RadarDateBucket | 'ALL') => recStore.setDownsideDateBucket(bucket),
    setMinChange: (value: number) => recStore.setDownsideMinChange(value),
  },
]);

// Near-recommended / Not-recommended — ไม่มีตัวกรอง แต่ตัดเหลือ 4 อันแรกจนกว่าจะกดดูทั้งหมด
const VISIBLE_LIMIT = 4;
const expandedSections = reactive(new Set<RadarCategory>());

const toggleSection = (category: RadarCategory) => {
  if (expandedSections.has(category)) {
    expandedSections.delete(category);
  } else {
    expandedSections.add(category);
  }
};

const expandableSections = computed(() => {
  const configs: { meta: SectionMeta; items: RadarStock[] }[] = [
    { meta: SECTION_META['Near-recommended'], items: recStore.nearRecommendedSection },
    { meta: SECTION_META['Not-recommended'], items: recStore.notRecommendedSection },
  ];

  return configs.map(({ meta, items }) => {
    const expanded = expandedSections.has(meta.category);

    return {
      meta,
      items,
      visibleItems: expanded ? items : items.slice(0, VISIBLE_LIMIT),
      hasMore: items.length > VISIBLE_LIMIT,
      expanded,
    };
  });
});

const radarIsEmpty = computed(
  () => recStore.loaded && !recStore.loading && recStore.recommendations.length === 0,
);

/* ------------------------------------------------------------------ */
/* Card helpers                                                        */
/* ------------------------------------------------------------------ */
// ย้ายไป src/utils/symbol-avatar.ts เพื่อให้หน้าอื่น (รวมถึง fallback ของโลโก้ Clearbit)
// ใช้สี/ตัวย่อชุดเดียวกัน
const avatarColor = symbolAvatarColor;
const avatarInitials = symbolAvatarInitials;

const displaySymbol = (symbol: string) => symbol.replace('.BK', '');

const formatMoney = (value: number, currency: 'THB' | 'USD') =>
  `${currency === 'THB' ? '฿' : '$'}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPrice = (symbol: string, price: number) =>
  formatMoney(price, symbol.endsWith('.BK') ? 'THB' : 'USD');

const formatStartDate = (iso: string) =>
  new Date(iso).toLocaleDateString(languageStore.isThai ? 'th-TH' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const goToAnalysis = (symbol: string) => {
  void router.push(`/stock/${symbol}`);
};

/* ------------------------------------------------------------------ */
/* Manual watchlist (section เสริมท้ายหน้า)                            */
/* ------------------------------------------------------------------ */
const newSymbol = ref('');
const search = ref('');
const manualOpen = ref(false);

const load = async () => {
  if (portStore.activePortfolioId === null) return;
  await safeLoad(() => loadForPortfolio(), 'โหลด Watchlist ไม่สำเร็จ');
};

onMounted(async () => {
  if (portStore.portfolios.length === 0) {
    await safeLoad(() => portStore.loadPortfolios(), 'โหลดพอร์ตโฟลิโอไม่สำเร็จ');
  }

  await load();
});

// สลับโหมด/เปลี่ยนพอร์ต -> โหลดใหม่ (store กรองตาม portfolio_type ให้เอง)
watch(
  () => portStore.activePortfolio,
  () => void load(),
);

const manualItems = computed(() => {
  const keyword = search.value.trim().toUpperCase();

  if (!keyword) return currentItems.value;

  return currentItems.value.filter(
    (item) =>
      item.symbol.toUpperCase().includes(keyword) ||
      (item.name ?? '').toUpperCase().includes(keyword),
  );
});

const formatItemPrice = (item: WatchlistItem) => {
  if (item.current_price === null) return '—';

  return formatMoney(Number(item.current_price), item.market_region === 'TH' ? 'THB' : 'USD');
};

const formatAdded = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

/** หน้าวิเคราะห์เชิงลึกมีเฉพาะฝั่งหุ้น — โหมด Forex ไปหน้า Asset Explorer แทน */
const openDetail = (item: WatchlistItem) => {
  void router.push(isInvestor.value ? `/stock/${item.symbol}` : '/AssetExplorer');
};

const handleAdd = async () => {
  const symbol = newSymbol.value.trim();

  if (!symbol) return;

  try {
    await addAsset(symbol);
    newSymbol.value = '';
    $q.notify({ type: 'positive', message: `เพิ่ม ${symbol.toUpperCase()} แล้ว`, position: 'top' });
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : 'เพิ่มลง Watchlist ไม่สำเร็จ',
      position: 'top',
    });
  }
};

const handleRemove = async (item: WatchlistItem) => {
  try {
    await removeAsset(item.symbol);
    $q.notify({ type: 'positive', message: `ลบ ${item.symbol} แล้ว`, position: 'top' });
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : 'ลบออกจาก Watchlist ไม่สำเร็จ',
      position: 'top',
    });
  }
};
</script>

<template>
  <q-page class="watchlist-page q-pa-md q-pa-sm-lg" :class="{ 'dark-theme': $q.dark.isActive }">
    <!-- ── Header ────────────────────────────────────────────────────────────── -->
    <div class="row items-end justify-between q-mb-lg q-mt-xs">
      <div>
        <h1 class="text-h5 text-weight-bolder q-my-none tracking-tight">
          Watchlist
          <q-badge :color="workspaceMeta.color" class="q-ml-sm" :label="workspaceMeta.label" />
        </h1>
        <div class="text-subtitle2 q-mt-xs watch-subtitle">
          {{
            isInvestor
              ? languageStore.isThai
                ? 'หุ้นที่ AI คัดมาให้ พร้อมผลตอบแทนตั้งแต่วันที่เริ่มแนะนำ'
                : 'AI-selected stocks with return since the recommendation started.'
              : `สัญลักษณ์ที่ติดตามอยู่ในพอร์ต${workspaceMeta.label}ที่เลือก`
          }}
        </div>
      </div>
      <q-btn
        v-if="isInvestor"
        flat
        dense
        no-caps
        icon="refresh"
        :label="languageStore.isThai ? 'รีเฟรช' : 'Refresh'"
        :loading="recStore.loading"
        data-test="radar-refresh"
        @click="recStore.loadRecommendations(true)"
      />
    </div>

    <!-- ══ AI radar (โหมด Stock เท่านั้น) ══════════════════════════════════════ -->
    <template v-if="isInvestor">
      <div
        v-if="recStore.loading && recStore.recommendations.length === 0"
        class="flex flex-center q-py-xl column"
        data-test="radar-loading"
      >
        <q-spinner-dots size="40px" color="primary" class="q-mb-sm" />
        <div class="text-caption watch-subtitle">
          {{ languageStore.isThai ? 'กำลังโหลดคำแนะนำจาก AI…' : 'Loading AI recommendations…' }}
        </div>
      </div>

      <section v-else-if="recStore.error" class="state-card" data-test="radar-error">
        <q-icon name="cloud_off" size="48px" class="state-icon" />
        <h3 class="state-title">
          {{ languageStore.isThai ? 'โหลดคำแนะนำไม่สำเร็จ' : 'Could not load recommendations' }}
        </h3>
        <p class="state-text">{{ recStore.error }}</p>
        <q-btn
          flat
          no-caps
          color="primary"
          :label="languageStore.isThai ? 'ลองใหม่' : 'Retry'"
          class="q-mt-sm"
          @click="recStore.loadRecommendations(true)"
        />
      </section>

      <section v-else-if="radarIsEmpty" class="state-card" data-test="radar-empty">
        <q-icon name="radar" size="48px" class="state-icon" />
        <h3 class="state-title">
          {{ languageStore.isThai ? 'ยังไม่มีคำแนะนำในตอนนี้' : 'No recommendations yet' }}
        </h3>
        <p class="state-text">
          {{
            languageStore.isThai
              ? 'AI ยังไม่พบหุ้นที่เข้าเกณฑ์ ลองกลับมาดูใหม่ภายหลัง'
              : 'The AI has not surfaced any picks yet. Check back later.'
          }}
        </p>
      </section>

      <template v-else>
        <!-- Upside / Downside: แถวตัวกรองแทนปุ่มดูทั้งหมด -->
        <section
          v-for="section in filterableSections"
          :key="section.meta.category"
          class="watch-section"
          :data-test="`radar-section-${section.meta.category}`"
        >
          <div class="watch-section__header watch-section__header--filterable">
            <div class="watch-section__title">
              <q-icon
                :name="section.meta.icon"
                :class="section.meta.iconClass"
                class="watch-section__icon"
                size="20px"
              />
              <h2>{{ sectionTitle(section.meta) }}</h2>
              <span class="watch-section__count">{{ section.items.length }}</span>
            </div>
            <div class="watch-section__filters">
              <q-select
                :model-value="section.filters.sector"
                :options="sectorOptions"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                dense
                outlined
                :dark="$q.dark.isActive"
                class="watch-filter-field"
                :label="languageStore.isThai ? 'หมวดหมู่หุ้น' : 'Sector'"
                @update:model-value="section.setSector"
              />
              <q-select
                :model-value="section.filters.dateBucket"
                :options="dateOptions"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                dense
                outlined
                :dark="$q.dark.isActive"
                class="watch-filter-field"
                :label="languageStore.isThai ? 'ระยะเวลา' : 'Date'"
                @update:model-value="section.setDateBucket"
              />
              <q-select
                :model-value="section.filters.minChangeMagnitude"
                :options="changeMagnitudeOptions"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                dense
                outlined
                :dark="$q.dark.isActive"
                class="watch-filter-field"
                :label="languageStore.isThai ? 'การเปลี่ยนแปลง' : 'Change'"
                @update:model-value="section.setMinChange"
              />
            </div>
          </div>

          <section v-if="section.items.length === 0" class="state-card" data-test="radar-no-match">
            <q-icon name="search_off" size="48px" class="state-icon" />
            <h3 class="state-title">
              {{
                languageStore.isThai ? 'ไม่พบหุ้นที่ตรงเงื่อนไข' : 'No stocks match these filters'
              }}
            </h3>
            <p class="state-text">
              {{
                languageStore.isThai
                  ? 'ลองปรับตัวกรองด้านบนเพื่อดูคำแนะนำเพิ่มเติม'
                  : 'Try loosening the filters above to see more recommendations.'
              }}
            </p>
          </section>

          <div v-else class="watch-grid">
            <article
              v-for="rec in section.items"
              :key="rec.symbol"
              class="watch-card"
              data-test="radar-card"
              @click="goToAnalysis(rec.symbol)"
            >
              <div class="watch-card__head">
                <div class="watch-logo" :style="{ background: avatarColor(rec.symbol) }">
                  {{ avatarInitials(rec.symbol) }}
                </div>
                <div class="watch-id">
                  <div class="watch-ticker">{{ displaySymbol(rec.symbol) }}</div>
                  <div class="watch-name">{{ rec.name }}</div>
                </div>
              </div>

              <div class="watch-card__prices">
                <div class="watch-price-line">
                  <span class="watch-price-label">
                    {{ languageStore.isThai ? 'ปัจจุบัน' : 'Current' }}
                  </span>
                  <span class="watch-price watch-price--current">
                    {{ formatPrice(rec.symbol, rec.currentPrice) }}
                  </span>
                </div>
                <div class="watch-price-line">
                  <span class="watch-price-label">
                    {{ languageStore.isThai ? 'เริ่มต้น' : 'Initial' }}
                  </span>
                  <span class="watch-price watch-price--initial">
                    {{ formatPrice(rec.symbol, rec.initialPrice) }}
                  </span>
                </div>
              </div>

              <div class="watch-card__footer">
                <span class="watch-date">{{ formatStartDate(rec.startDate) }}</span>
                <span class="watch-return" :class="rec.returnPercent >= 0 ? 'is-up' : 'is-down'">
                  {{ rec.returnPercent >= 0 ? '+' : '' }}{{ rec.returnPercent.toFixed(2) }}%
                </span>
              </div>
            </article>
          </div>
        </section>

        <!-- Near-recommended / Not-recommended: ปุ่มดูทั้งหมด ไม่มีตัวกรอง -->
        <section
          v-for="group in expandableSections"
          :key="group.meta.category"
          class="watch-section"
          :data-test="`radar-section-${group.meta.category}`"
        >
          <div class="watch-section__header">
            <div class="watch-section__title">
              <q-icon
                :name="group.meta.icon"
                :class="group.meta.iconClass"
                class="watch-section__icon"
                size="20px"
              />
              <h2>{{ sectionTitle(group.meta) }}</h2>
              <span class="watch-section__count">{{ group.items.length }}</span>
            </div>
            <button
              v-if="group.hasMore"
              type="button"
              class="watch-section__view-all"
              :data-test="`radar-view-all-${group.meta.category}`"
              @click="toggleSection(group.meta.category)"
            >
              {{
                group.expanded
                  ? languageStore.isThai
                    ? 'ย่อ'
                    : 'Show less'
                  : languageStore.isThai
                    ? 'ดูทั้งหมด'
                    : 'View all'
              }}
              <q-icon name="chevron_right" size="16px" />
            </button>
          </div>

          <div class="watch-grid">
            <article
              v-for="rec in group.visibleItems"
              :key="rec.symbol"
              class="watch-card"
              data-test="radar-card"
              @click="goToAnalysis(rec.symbol)"
            >
              <div class="watch-card__head">
                <div class="watch-logo" :style="{ background: avatarColor(rec.symbol) }">
                  {{ avatarInitials(rec.symbol) }}
                </div>
                <div class="watch-id">
                  <div class="watch-ticker">{{ displaySymbol(rec.symbol) }}</div>
                  <div class="watch-name">{{ rec.name }}</div>
                </div>
              </div>

              <div class="watch-card__prices">
                <div class="watch-price-line">
                  <span class="watch-price-label">
                    {{ languageStore.isThai ? 'ปัจจุบัน' : 'Current' }}
                  </span>
                  <span class="watch-price watch-price--current">
                    {{ formatPrice(rec.symbol, rec.currentPrice) }}
                  </span>
                </div>
                <div class="watch-price-line">
                  <span class="watch-price-label">
                    {{ languageStore.isThai ? 'เริ่มต้น' : 'Initial' }}
                  </span>
                  <span class="watch-price watch-price--initial">
                    {{ formatPrice(rec.symbol, rec.initialPrice) }}
                  </span>
                </div>
              </div>

              <div class="watch-card__footer">
                <span class="watch-date">{{ formatStartDate(rec.startDate) }}</span>
                <span class="watch-return" :class="rec.returnPercent >= 0 ? 'is-up' : 'is-down'">
                  {{ rec.returnPercent >= 0 ? '+' : '' }}{{ rec.returnPercent.toFixed(2) }}%
                </span>
              </div>
            </article>
          </div>
        </section>
      </template>
    </template>

    <!-- ══ รายการที่ติดตามเอง (section เสริม — มีทั้งสองโหมด) ══════════════════ -->
    <section class="watch-section manual-section" data-test="manual-section">
      <div class="watch-section__header">
        <div class="watch-section__title">
          <q-icon name="bookmark_added" class="watch-section__icon is-manual" size="20px" />
          <h2>{{ languageStore.isThai ? 'ติดตามเอง' : 'My watchlist' }}</h2>
          <span class="watch-section__count">{{ currentItems.length }}</span>
        </div>
        <button
          type="button"
          class="watch-section__view-all"
          data-test="manual-toggle"
          @click="manualOpen = !manualOpen"
        >
          {{
            manualOpen
              ? languageStore.isThai
                ? 'ย่อ'
                : 'Hide'
              : languageStore.isThai
                ? 'จัดการ'
                : 'Manage'
          }}
          <q-icon :name="manualOpen ? 'expand_less' : 'expand_more'" size="16px" />
        </button>
      </div>

      <q-slide-transition>
        <div v-show="manualOpen || !isInvestor">
          <div class="row q-col-gutter-sm q-mb-md items-center">
            <div class="col-12 col-sm-5">
              <q-input
                v-model="newSymbol"
                dense
                outlined
                :dark="$q.dark.isActive"
                placeholder="เพิ่มสัญลักษณ์ เช่น AAPL, PTT.BK, XAU/USD"
                :disable="isSubmitting || portStore.activePortfolioId === null"
                @keyup.enter="handleAdd"
              >
                <template v-slot:append>
                  <q-btn
                    flat
                    dense
                    round
                    icon="add"
                    color="primary"
                    :loading="isSubmitting"
                    @click="handleAdd"
                  />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model="search"
                dense
                outlined
                :dark="$q.dark.isActive"
                placeholder="ค้นหาในรายการ"
                clearable
              >
                <template v-slot:prepend><q-icon name="search" /></template>
              </q-input>
            </div>
            <div class="col-12 col-sm-3 text-right">
              <q-btn
                flat
                dense
                no-caps
                icon="refresh"
                label="รีเฟรช"
                :loading="isLoading"
                @click="load"
              />
            </div>
          </div>

          <q-banner v-if="portStore.activePortfolioId === null" class="state-card">
            <template v-slot:avatar><q-icon name="warning" size="sm" /></template>
            กรุณาเลือกหรือสร้างพอร์ต{{ workspaceMeta.label }}ก่อนจึงจะใช้ Watchlist ได้
          </q-banner>

          <div
            v-else-if="isLoading && currentItems.length === 0"
            class="flex flex-center q-py-lg column"
          >
            <q-spinner-dots size="32px" color="primary" class="q-mb-sm" />
            <div class="text-caption watch-subtitle">กำลังโหลด Watchlist…</div>
          </div>

          <section v-else-if="manualItems.length === 0" class="state-card" data-test="manual-empty">
            <q-icon name="star_border" size="48px" class="state-icon" />
            <h3 class="state-title">ยังไม่มีสัญลักษณ์ในรายการ</h3>
            <p class="state-text">พิมพ์สัญลักษณ์ในช่องด้านบนเพื่อเริ่มติดตาม</p>
          </section>

          <div v-else class="watch-grid">
            <article
              v-for="item in manualItems"
              :key="item.id"
              class="watch-card"
              data-test="manual-card"
              @click="openDetail(item)"
            >
              <div class="watch-card__head">
                <div class="watch-logo" :style="{ background: avatarColor(item.symbol) }">
                  {{ avatarInitials(item.symbol) }}
                </div>
                <div class="watch-id">
                  <div class="watch-ticker">{{ displaySymbol(item.symbol) }}</div>
                  <div class="watch-name">{{ item.name ?? item.asset_type }}</div>
                </div>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="close"
                  class="watch-remove"
                  :disable="isSubmitting"
                  @click.stop="handleRemove(item)"
                >
                  <q-tooltip>ลบออกจาก Watchlist</q-tooltip>
                </q-btn>
              </div>

              <div class="watch-card__prices">
                <div class="watch-price-line">
                  <span class="watch-price-label">ราคาปัจจุบัน</span>
                  <span class="watch-price watch-price--current">{{ formatItemPrice(item) }}</span>
                </div>
                <div class="watch-price-line">
                  <span class="watch-price-label">ประเภท</span>
                  <span class="watch-price">{{ item.asset_type }}</span>
                </div>
              </div>

              <div class="watch-card__footer">
                <span class="watch-date">เพิ่มเมื่อ {{ formatAdded(item.created_at) }}</span>
                <q-icon name="chevron_right" size="16px" class="watch-chevron" />
              </div>
            </article>
          </div>
        </div>
      </q-slide-transition>
    </section>
  </q-page>
</template>

<style scoped>
/* ==================================================================
   Light theme (default) with dark-mode overrides
================================================================== */
.watchlist-page {
  --bg-card: #ffffff;
  --bg-subtle: #f8f9fb;
  --text-primary: #101828;
  --text-secondary: #667085;
  --border-color: #e7eaf0;
  --primary-accent: #2563eb;
  --profit-color: #16a34a;
  --loss-color: #dc2626;
  --shadow-hover: 0 4px 8px rgba(16, 24, 40, 0.06), 0 12px 30px rgba(16, 24, 40, 0.1);

  color: var(--text-primary);
}

.watchlist-page.dark-theme {
  --bg-card: #131c29;
  --bg-subtle: #0f151d;
  --text-primary: #e8edf4;
  --text-secondary: #8b9cb3;
  --border-color: #2a3544;
  --profit-color: #22c55e;
  --loss-color: #ef4444;
  --shadow-hover: 0 4px 8px rgba(0, 0, 0, 0.35), 0 12px 30px rgba(0, 0, 0, 0.45);
}

.watch-subtitle {
  color: var(--text-secondary) !important;
}

/* ------------------------------------------------------------------
   Radar sections
------------------------------------------------------------------ */
.watch-section {
  margin-bottom: 32px;
}

.manual-section {
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.watch-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.watch-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.watch-section__title h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.4;
}

.watch-section__count {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary) !important;
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 1px 8px;
}

.watch-section__icon.is-upside {
  color: #22c55e !important;
}

.watch-section__icon.is-downside {
  color: #ef4444 !important;
}

.watch-section__icon.is-near-recommended {
  color: #3b82f6 !important;
}

.watch-section__icon.is-not-recommended {
  color: #94a3b8 !important;
}

.watch-section__icon.is-manual {
  color: #f59e0b !important;
}

.watch-section__view-all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary) !important;
  cursor: pointer;
  transition: color 0.15s ease;
}

.watch-section__view-all:hover {
  color: var(--primary-accent) !important;
}

/* ------------------------------------------------------------------
   Upside / Downside per-section filter row
------------------------------------------------------------------ */
.watch-section__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.watch-filter-field {
  width: 150px;
}

.watch-filter-field :deep(.q-field__control) {
  background: var(--bg-card);
  border-radius: 10px;
  color: var(--text-primary);
  min-height: 38px;
}

/* ------------------------------------------------------------------
   Card grid
------------------------------------------------------------------ */
.watch-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.watch-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  min-height: 160px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.watch-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
  border-color: var(--primary-accent);
}

.watch-card__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.watch-logo {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff !important;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.watch-id {
  min-width: 0;
  flex: 1 1 auto;
}

.watch-ticker {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.3;
}

.watch-name {
  font-size: 13px;
  color: var(--text-secondary) !important;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.watch-remove {
  color: var(--text-secondary) !important;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.watch-card:hover .watch-remove {
  opacity: 1;
}

.watch-card__prices {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.watch-price-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.watch-price-label {
  font-size: 11px;
  color: var(--text-secondary) !important;
}

.watch-price {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary) !important;
}

.watch-price--current {
  color: var(--profit-color) !important;
}

.watch-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.watch-date,
.watch-chevron {
  font-size: 11px;
  color: var(--text-secondary) !important;
}

.watch-return {
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.watch-return.is-up {
  color: var(--profit-color) !important;
}

.watch-return.is-down {
  color: var(--loss-color) !important;
}

/* ------------------------------------------------------------------
   Empty / error states
------------------------------------------------------------------ */
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
}

.state-icon {
  color: var(--text-secondary) !important;
  margin-bottom: 12px;
}

.state-title {
  font-size: 17px;
  font-weight: 800;
  margin: 0 0 6px;
  line-height: 1.5;
}

.state-text {
  margin: 0;
  color: var(--text-secondary) !important;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
}

/* ------------------------------------------------------------------
   Responsive
------------------------------------------------------------------ */
@media (max-width: 900px) {
  .watch-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .watch-section__header--filterable {
    align-items: stretch;
  }

  .watch-section__filters {
    width: 100%;
  }

  .watch-filter-field {
    width: 100%;
  }

  .watch-grid {
    grid-template-columns: 1fr;
  }

  .watch-remove {
    opacity: 1;
  }
}
</style>

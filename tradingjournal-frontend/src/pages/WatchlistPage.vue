<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAssetStore } from 'stores/AssetStore';
import AssetInfoCard from 'components/AssetInfoCard.vue';

const assetStore = useAssetStore();

// ==========================================
// Filter State
// ==========================================
const upsideTimeframe = ref<'1wk' | '1mo' | '3mo' | '6mo' | '1y'>('1mo');
const upsideGrowth = ref<number>(0);

const downsideTimeframe = ref<'1wk' | '1mo' | '3mo' | '6mo' | '1y'>('1mo');
const downsideGrowth = ref<number>(0);

const timeframeOptions = [
  { label: '1 Week', value: '1wk' },
  { label: '1 Month', value: '1mo' },
  { label: '3 Months', value: '3mo' },
  { label: '6 Months', value: '6mo' },
  { label: '1 Year', value: '1y' },
];

const growthOptions = [
  { label: 'All Growth', value: 0 },
  { label: '> 5%', value: 5 },
  { label: '> 10%', value: 10 },
  { label: '> 20%', value: 20 },
  { label: '> 50%', value: 50 },
];

// ==========================================
// Lifecycle & Watchers
// ==========================================
onMounted(() => {
  assetStore.fetchUpside(upsideTimeframe.value);
  assetStore.fetchDownside(downsideTimeframe.value);
  assetStore.fetchGeneral('1mo');
});

watch(upsideTimeframe, (newValue) => {
  assetStore.fetchUpside(newValue);
});

watch(downsideTimeframe, (newValue) => {
  assetStore.fetchDownside(newValue);
});

// ==========================================
// Computed Lists
// ==========================================
const upsideList = computed(() => {
  return assetStore.upsideWatchlist.filter(
    (item) => item.growthPercent > 0 && item.growthPercent >= upsideGrowth.value,
  );
});

const downsideList = computed(() => {
  return assetStore.downsideWatchlist.filter(
    (item) => item.growthPercent < 0 && item.growthPercent <= -downsideGrowth.value,
  );
});

const recommendedList = computed(() => {
  return assetStore.generalWatchlist.filter((item) => item.isRecommended);
});

const notRecommendedList = computed(() => {
  return assetStore.generalWatchlist.filter((item) => item.isNotRecommended);
});

// ==========================================
// Horizontal Scroll: Wheel & Drag
// ==========================================
let isDragging = false;
let hasDragged = false;
let startX = 0;
let scrollLeft = 0;

const handleWheel = (event: WheelEvent) => {
  const element = event.currentTarget as HTMLElement;

  if (event.deltaY !== 0) {
    event.preventDefault();
    element.scrollLeft += event.deltaY;
  }
};

const startDrag = (event: MouseEvent) => {
  isDragging = true;
  hasDragged = false;

  const element = event.currentTarget as HTMLElement;
  startX = event.pageX - element.offsetLeft;
  scrollLeft = element.scrollLeft;
};

const doDrag = (event: MouseEvent) => {
  if (!isDragging) return;

  event.preventDefault();
  hasDragged = true;

  const element = event.currentTarget as HTMLElement;
  const currentX = event.pageX - element.offsetLeft;
  const distance = (currentX - startX) * 1.5;

  element.scrollLeft = scrollLeft - distance;
};

const stopDrag = () => {
  isDragging = false;

  setTimeout(() => {
    hasDragged = false;
  }, 50);
};

const handleCardClick = (symbol: string) => {
  if (hasDragged) return;

  console.log('Navigate to:', symbol);
  // router.push({ name: 'explorer', query: { symbol } });
};
</script>

<template>
  <q-page class="watchlist-page q-pa-md q-pa-sm-lg">
    <!-- Upside -->
    <section class="section-wrapper q-mb-xl">
      <div class="header-box bg-card border-standard">
        <div class="section-title">
          <div class="section-icon section-icon--positive">
            <q-icon name="north_east" size="20px" />
          </div>

          <div>
            <div class="section-title__text">Upside</div>
            <div class="section-title__subtitle">Assets with positive price momentum</div>
          </div>

          <q-badge v-if="!assetStore.loadingUpside" class="count-badge">
            {{ upsideList.length }}
          </q-badge>
        </div>

        <div class="filter-group">
          <q-select
            v-model="upsideTimeframe"
            :options="timeframeOptions"
            outlined
            dense
            emit-value
            map-options
            hide-bottom-space
            class="rounded-input filter-dropdown"
            label="Period"
          />
          <q-select
            v-model="upsideGrowth"
            :options="growthOptions"
            outlined
            dense
            emit-value
            map-options
            hide-bottom-space
            class="rounded-input filter-dropdown"
            label="Growth"
          />
        </div>
      </div>

      <div v-if="assetStore.loadingUpside" class="loading-state">
        <q-spinner-dots color="positive" size="2em" />
      </div>

      <div
        v-else
        class="horizontal-scroll"
        @wheel="handleWheel"
        @mousedown="startDrag"
        @mousemove="doDrag"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
      >
        <AssetInfoCard
          v-for="coin in upsideList"
          :key="coin.id"
          :coin="coin"
          variant="positive"
          @select="handleCardClick"
        />

        <div v-if="upsideList.length === 0" class="empty-state">
          <q-icon name="filter_alt_off" size="24px" />
          <span>No assets match your filter.</span>
        </div>
      </div>
    </section>

    <!-- Downside -->
    <section class="section-wrapper q-mb-xl">
      <div class="header-box bg-card border-standard">
        <div class="section-title">
          <div class="section-icon section-icon--negative">
            <q-icon name="south_east" size="20px" />
          </div>

          <div>
            <div class="section-title__text">Downside</div>
            <div class="section-title__subtitle">Assets with negative price momentum</div>
          </div>

          <q-badge v-if="!assetStore.loadingDownside" class="count-badge">
            {{ downsideList.length }}
          </q-badge>
        </div>

        <div class="filter-group">
          <q-select
            v-model="downsideTimeframe"
            :options="timeframeOptions"
            outlined
            dense
            emit-value
            map-options
            hide-bottom-space
            class="rounded-input filter-dropdown"
            label="Period"
          />
          <q-select
            v-model="downsideGrowth"
            :options="growthOptions"
            outlined
            dense
            emit-value
            map-options
            hide-bottom-space
            class="rounded-input filter-dropdown"
            label="Decline"
          />
        </div>
      </div>

      <div v-if="assetStore.loadingDownside" class="loading-state">
        <q-spinner-dots color="negative" size="2em" />
      </div>

      <div
        v-else
        class="horizontal-scroll"
        @wheel="handleWheel"
        @mousedown="startDrag"
        @mousemove="doDrag"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
      >
        <AssetInfoCard
          v-for="coin in downsideList"
          :key="coin.id"
          :coin="coin"
          variant="negative"
          @select="handleCardClick"
        />

        <div v-if="downsideList.length === 0" class="empty-state">
          <q-icon name="filter_alt_off" size="24px" />
          <span>No assets match your filter.</span>
        </div>
      </div>
    </section>

    <!-- Recommended -->
    <section class="section-wrapper q-mb-xl">
      <div class="header-box bg-card border-standard">
        <div class="section-title">
          <div class="section-icon section-icon--primary">
            <q-icon name="verified" size="20px" />
          </div>

          <div>
            <div class="section-title__text">Recommended</div>
            <div class="section-title__subtitle">Assets currently highlighted by the system</div>
          </div>

          <q-badge v-if="!assetStore.loadingGeneral" class="count-badge">
            {{ recommendedList.length }}
          </q-badge>
        </div>
      </div>

      <div v-if="assetStore.loadingGeneral" class="loading-state">
        <q-spinner-dots color="primary" size="2em" />
      </div>

      <div
        v-else
        class="horizontal-scroll"
        @wheel="handleWheel"
        @mousedown="startDrag"
        @mousemove="doDrag"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
      >
        <AssetInfoCard
          v-for="coin in recommendedList"
          :key="coin.id"
          :coin="coin"
          variant="primary"
          @select="handleCardClick"
        />

        <div v-if="recommendedList.length === 0" class="empty-state">
          <q-icon name="search_off" size="24px" />
          <span>No recommended assets currently.</span>
        </div>
      </div>
    </section>

    <!-- Not Recommended -->
    <section class="section-wrapper q-mb-xl">
      <div class="header-box bg-card border-standard">
        <div class="section-title">
          <div class="section-icon section-icon--warning">
            <q-icon name="warning_amber" size="20px" />
          </div>

          <div>
            <div class="section-title__text">Not Recommended</div>
            <div class="section-title__subtitle">Assets that currently require extra caution</div>
          </div>

          <q-badge v-if="!assetStore.loadingGeneral" class="count-badge">
            {{ notRecommendedList.length }}
          </q-badge>
        </div>
      </div>

      <div v-if="assetStore.loadingGeneral" class="loading-state">
        <q-spinner-dots color="warning" size="2em" />
      </div>

      <div
        v-else
        class="horizontal-scroll"
        @wheel="handleWheel"
        @mousedown="startDrag"
        @mousemove="doDrag"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
      >
        <AssetInfoCard
          v-for="coin in notRecommendedList"
          :key="coin.id"
          :coin="coin"
          variant="warning"
          @select="handleCardClick"
        />

        <div v-if="notRecommendedList.length === 0" class="empty-state">
          <q-icon name="health_and_safety" size="24px" />
          <span>No high-risk assets detected.</span>
        </div>
      </div>
    </section>
  </q-page>
</template>

<style scoped>
.watchlist-page {
  --page-background: #f6f8fc;
  --surface-background: #ffffff;
  --soft-background: #f8fafc;
  --text-main: #172033;
  --text-muted: #6b778c;
  --border-color: #e3e8f1;

  min-height: 100vh;
  background: var(--page-background);
}

.body--dark .watchlist-page {
  --page-background: #0c1220;
  --surface-background: #141d2e;
  --soft-background: #101827;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #26334a;
}

.bg-card {
  background: var(--surface-background);
}

.header-box {
  min-height: 76px;
  margin-bottom: 16px;
  padding: 14px 18px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.035);
}

.border-standard {
  border: 1px solid var(--border-color);
}

.section-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-title__text {
  color: var(--text-main);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
}

.section-title__subtitle {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.section-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}

.section-icon--positive {
  color: #059669;
  background: rgba(16, 185, 129, 0.12);
}

.section-icon--negative {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.12);
}

.section-icon--primary {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
}

.section-icon--warning {
  color: #d97706;
  background: rgba(245, 158, 11, 0.14);
}

.count-badge {
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--soft-background);
  border: 1px solid var(--border-color);
  font-weight: 700;
}

.filter-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-dropdown {
  width: 152px;
}

.rounded-input :deep(.q-field__control) {
  height: 44px;
  border-radius: 12px !important;
  background: var(--soft-background);
}

.rounded-input :deep(.q-field__native),
.rounded-input :deep(.q-field__input),
.rounded-input :deep(.q-field__label),
.rounded-input :deep(.q-field__marginal) {
  color: var(--text-main);
}

.rounded-input :deep(.q-field__control::before) {
  border-color: var(--border-color);
}

.horizontal-scroll {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  padding: 4px 2px 16px;
  cursor: grab;
  scroll-snap-type: x proximity;
  overscroll-behavior-inline: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.horizontal-scroll::-webkit-scrollbar {
  display: none;
}

.horizontal-scroll:active {
  cursor: grabbing;
}

.loading-state {
  min-height: 170px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  min-width: 300px;
  min-height: 170px;
  padding: 24px;
  border: 1px dashed var(--border-color);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--text-muted);
  background: var(--surface-background);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 700px) {
  .header-box {
    align-items: stretch;
    flex-direction: column;
    padding: 14px;
  }

  .section-title__subtitle {
    display: none;
  }

  .filter-group {
    width: 100%;
    justify-content: stretch;
  }

  .filter-dropdown {
    flex: 1 1 140px;
    width: auto;
    min-width: 0;
  }
}
</style>

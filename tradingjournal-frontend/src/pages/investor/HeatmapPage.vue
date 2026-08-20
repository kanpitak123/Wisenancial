<script setup lang="ts">
/**
 * แผนที่ความร้อนตลาด — พอร์ตมาจาก TradingJournal เดิม (pages/HeatmapPage.vue)
 *
 * ต่อกับ GET /market-insights/heatmap ที่มีอยู่แล้วในหลังบ้าน ไม่ได้สร้าง endpoint ใหม่
 * คอนโทรลเลอร์ตัวเดียวกับ /market-insights/movers จึงติด PaidTierGuard เหมือนกัน —
 * แพ็กฟรีจะได้ 403 ต้องโชว์การ์ดอัปเกรด ไม่ใช่ปล่อยหน้าว่างเงียบๆ
 * (แพทเทิร์นเดียวกับ MonthlyMoversPage)
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useLanguageStore } from 'stores/LanguageStore';
import { WsBadge, WsCard, WsUpgradeNotice } from 'src/components/ui';
import { heatmapService } from 'src/services/heatmap.service';
import { isPaidTierError } from 'src/utils/paid-tier';
import type { HeatmapMarket, HeatmapResponse, HeatmapTile } from 'src/types/heatmap.types';

const router = useRouter();
const languageStore = useLanguageStore();
const { safeLoad } = useSafeLoad();

const loading = ref(false);
const data = ref<HeatmapResponse | null>(null);
const market = ref<HeatmapMarket>('GLOBAL');
const requiresUpgrade = ref(false);

const marketOptions = computed(() => [
  { label: languageStore.isThai ? 'โลก' : 'Global', value: 'GLOBAL' as HeatmapMarket },
  { label: languageStore.isThai ? 'ไทย (SET)' : 'Thai (SET)', value: 'TH' as HeatmapMarket },
]);

const load = async () => {
  loading.value = true;
  requiresUpgrade.value = false;

  try {
    data.value = await heatmapService.getHeatmap({ market: market.value });
  } catch (error) {
    if (isPaidTierError(error)) {
      requiresUpgrade.value = true;
      data.value = null;
      return;
    }

    await safeLoad(() => {
      throw error;
    }, 'โหลดแผนที่ความร้อนตลาดไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
};

const onMarketChange = (value: HeatmapMarket) => {
  market.value = value;
  void load();
};

// เส้นทางในโปรเจกต์นี้ไม่มี prefix /app เหมือนของเดิม
const goToAnalysis = (symbol: string) => {
  void router.push(`/stock/${symbol}`);
};

/**
 * แปลง % เปลี่ยนแปลงเป็นสีพื้นของช่อง — ตัดที่ ±3% เพราะเกินจากนั้นสีอิ่มตัวจนแยก
 * ไม่ออกอยู่ดี และหุ้นเด้งแรงตัวเดียวไม่ควรทำให้ทั้งกริดที่เหลือดูจืดไปหมด
 */
const tileColor = (change: number): string => {
  const capped = Math.max(-3, Math.min(3, change));
  const alpha = (0.18 + (Math.abs(capped) / 3) * 0.55).toFixed(2);

  return capped >= 0 ? `rgba(23, 130, 48, ${alpha})` : `rgba(193, 0, 21, ${alpha})`;
};

/** flex-grow ตามน้ำหนักหุ้น ช่องหุ้นใหญ่จะกว้างกว่า (treemap แบบ flexbox ล้วน) */
const tileFlex = (tile: HeatmapTile): number => Math.max(1, tile.weight);

const changeClass = (change: number) => (change >= 0 ? 'is-up' : 'is-down');

const formatPct = (value: number, digits = 2) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

const asOfLabel = computed(() => {
  if (!data.value) return '';

  return new Date(data.value.asOf).toLocaleString(languageStore.isThai ? 'th-TH' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
});

const sectors = computed(() => data.value?.sectors ?? []);

onMounted(load);
</script>

<template>
  <q-page class="heatmap-page q-pa-md q-pa-sm-lg">
    <header class="heatmap-header">
      <div>
        <WsBadge kind="ai" color="primary" value="LIVE MAP" outline class="q-mb-sm" />
        <h1 class="heatmap-title">
          {{ languageStore.isThai ? 'แผนที่ความร้อนตลาด' : 'Global Trading Heatmap' }}
        </h1>
        <p class="heatmap-subtitle">
          {{
            languageStore.isThai
              ? 'ภาพรวมการเคลื่อนไหวของตลาดแยกตามกลุ่มอุตสาหกรรม'
              : "A bird's-eye view of market moves grouped by sector."
          }}
          <span v-if="asOfLabel" class="heatmap-asof">· {{ asOfLabel }}</span>
        </p>
      </div>
      <q-btn-toggle
        :model-value="market"
        toggle-color="primary"
        unelevated
        no-caps
        class="heatmap-market-toggle"
        :options="marketOptions"
        @update:model-value="onMarketChange"
      />
    </header>

    <WsUpgradeNotice
      v-if="requiresUpgrade"
      data-test="heatmap-upgrade"
      message-th="แผนที่ความร้อนตลาดใช้ข้อมูลตลาดแบบเจาะลึก เปิดให้เฉพาะสมาชิกแบบชำระเงิน"
      message-en="The market heatmap uses premium market data and is available on paid plans."
    />

    <template v-else>
      <div v-if="loading" class="heatmap-sectors" data-test="heatmap-loading">
        <div v-for="n in 4" :key="n" class="heatmap-skeleton" />
      </div>

      <div v-else-if="sectors.length === 0" class="heatmap-empty" data-test="heatmap-empty">
        <q-icon name="grid_view" size="40px" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-bolder">
          {{ languageStore.isThai ? 'ยังไม่มีข้อมูลแผนที่ตลาด' : 'No heatmap data yet' }}
        </div>
        <div class="text-body2 q-mt-xs">
          {{
            languageStore.isThai
              ? 'ลองสลับตลาดหรือกลับมาใหม่อีกครั้งภายหลัง'
              : 'Try switching markets or check back later.'
          }}
        </div>
      </div>

      <div v-else class="heatmap-sectors" data-test="heatmap-grid">
        <WsCard v-for="sector in sectors" :key="sector.sector" class="heatmap-sector">
          <template #header>
            <div class="heatmap-sector-header">
              <span class="heatmap-sector-name">{{ sector.sector }}</span>
              <span class="heatmap-sector-change" :class="changeClass(sector.avgChangePercent)">
                {{ formatPct(sector.avgChangePercent) }}
              </span>
            </div>
          </template>

          <div class="heatmap-tiles">
            <button
              v-for="tile in sector.tiles"
              :key="tile.symbol"
              type="button"
              class="heatmap-tile"
              :data-test="`heatmap-tile-${tile.symbol}`"
              :style="{ backgroundColor: tileColor(tile.changePercent), flexGrow: tileFlex(tile) }"
              @click="goToAnalysis(tile.symbol)"
            >
              <span class="heatmap-tile-symbol">{{ tile.symbol.replace('.BK', '') }}</span>
              <span class="heatmap-tile-change">{{ formatPct(tile.changePercent, 1) }}</span>
              <q-tooltip>{{ tile.name }} · {{ formatPct(tile.changePercent) }}</q-tooltip>
            </button>
          </div>
        </WsCard>
      </div>

      <div v-if="!loading && sectors.length > 0" class="heatmap-legend">
        <span class="heatmap-legend-item">
          <span class="heatmap-legend-swatch" :style="{ backgroundColor: tileColor(-3) }" />
          -3%
        </span>
        <span class="heatmap-legend-item">
          <span class="heatmap-legend-swatch" :style="{ backgroundColor: tileColor(0) }" />
          0%
        </span>
        <span class="heatmap-legend-item">
          <span class="heatmap-legend-swatch" :style="{ backgroundColor: tileColor(3) }" />
          +3%
        </span>
      </div>
    </template>
  </q-page>
</template>

<style scoped>
/* palette teal/sage ชุดกลางเดียวกับหน้าอื่นที่ทำใน Phase 3 — ตัวช่อง heatmap ยังเป็น
   เขียว/แดงตามความหมายของข้อมูล ไม่ใช่สีแบรนด์ */
.heatmap-page {
  --bg-page: #f6f9f9;
  --bg-card-soft: #f0f5f4;
  --border-color: #dae7e5;
  --text-main: #1b3636;
  --text-muted: #789191;
  --positive: #178230;
  --negative: #c10015;

  background-color: var(--bg-page);
  min-height: 100vh;
  color: var(--text-main);
}

.body--dark .heatmap-page {
  --bg-page: #151819;
  --bg-card-soft: #282e2e;
  --border-color: #394141;
  --text-main: #f4f6f5;
  --text-muted: #7d8c89;
  --positive: #4ade80;
  --negative: #f87171;
}

.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.heatmap-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-main);
}

.heatmap-subtitle {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.heatmap-asof {
  font-weight: 600;
  color: var(--text-main);
}

.heatmap-sectors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.heatmap-sector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
}

.heatmap-sector-name {
  font-size: 15px;
  color: var(--text-main);
}

.heatmap-sector-change {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.heatmap-sector-change.is-up {
  color: var(--positive);
}

.heatmap-sector-change.is-down {
  color: var(--negative);
}

.heatmap-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* flex-basis:0 + flex-grow ตามน้ำหนัก = treemap แบบ flexbox ล้วน ไม่ต้องพึ่งไลบรารีกราฟ */
.heatmap-tile {
  flex-basis: 0;
  min-width: 72px;
  min-height: 64px;
  padding: 4px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #fff;
  font-weight: 700;
  transition:
    transform 0.12s ease,
    filter 0.12s ease;
}

.heatmap-tile:hover {
  transform: scale(1.04);
  filter: brightness(1.1);
}

.heatmap-tile-symbol {
  font-size: 13px;
}

.heatmap-tile-change {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  opacity: 0.95;
}

.heatmap-legend {
  display: flex;
  gap: 18px;
  justify-content: center;
  margin-top: 24px;
  color: var(--text-muted);
  font-size: 12px;
}

.heatmap-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.heatmap-legend-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.heatmap-empty {
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

.heatmap-skeleton {
  height: 180px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    var(--bg-card-soft) 25%,
    var(--border-color) 50%,
    var(--bg-card-soft) 75%
  );
  background-size: 200% 100%;
  animation: heatmap-shimmer 1.4s ease-in-out infinite;
}

@keyframes heatmap-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>

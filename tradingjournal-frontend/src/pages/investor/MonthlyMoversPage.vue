<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useRouter } from 'vue-router';
import { useLanguageStore } from 'stores/LanguageStore';
import { WsBadge, WsCard, WsUpgradeNotice } from 'src/components/ui';
import { volatilityService } from 'src/services/volatility.service';
import { isPaidTierError } from 'src/utils/paid-tier';
import type {
  MonthlyMoversResponse,
  VolatilityMarket,
  VolatilityMover,
} from 'src/types/volatility.types';

const router = useRouter();
const languageStore = useLanguageStore();

const loading = ref(false);
const data = ref<MonthlyMoversResponse | null>(null);
const market = ref<VolatilityMarket>('GLOBAL');

const marketOptions = computed(() => [
  { label: languageStore.isThai ? 'โลก' : 'Global', value: 'GLOBAL' as VolatilityMarket },
  { label: languageStore.isThai ? 'ไทย (SET)' : 'Thai (SET)', value: 'TH' as VolatilityMarket },
]);

const periodLabel = computed(() => {
  if (!data.value) return '';
  const [y, m] = data.value.period.split('-');
  const monthNames = languageStore.isThai
    ? [
        'ม.ค.',
        'ก.พ.',
        'มี.ค.',
        'เม.ย.',
        'พ.ค.',
        'มิ.ย.',
        'ก.ค.',
        'ส.ค.',
        'ก.ย.',
        'ต.ค.',
        'พ.ย.',
        'ธ.ค.',
      ]
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(m) - 1;
  return `${monthNames[idx] ?? m} ${y}`;
});

const { safeLoad } = useSafeLoad();

/**
 * /market-insights/movers ยัง gate ด้วย PaidTierGuard อยู่ (ใช้ข้อมูลตลาดภายนอก)
 * แพ็กฟรีจะได้ 403 — ต้องโชว์การ์ด "ต้องอัปเกรด" ไม่ใช่ปล่อยตารางว่างโดยไม่บอกอะไร
 */
const requiresUpgrade = ref(false);

// try/finally เดิมไม่มี catch — error เลยยังหลุดออกไปจาก onMounted(load)
const load = async () => {
  loading.value = true;
  requiresUpgrade.value = false;

  try {
    data.value = await volatilityService.getMonthlyMovers({ market: market.value });
  } catch (error) {
    if (isPaidTierError(error)) {
      requiresUpgrade.value = true;
      data.value = null;
      return;
    }

    // error อื่นๆ ให้ safeLoad จัดการแจ้งเตือนตามปกติ
    await safeLoad(() => {
      throw error;
    }, 'โหลดหุ้นผันผวนรายเดือนไม่สำเร็จ');
  } finally {
    loading.value = false;
  }
};

const onMarketChange = (value: VolatilityMarket) => {
  market.value = value;
  void load();
};

const goToAnalysis = (symbol: string) => {
  void router.push(`/stock/${symbol}`);
};

const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const formatValue = (value: number): string => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
};

const columns = computed(() => [
  {
    key: 'gainers',
    icon: 'trending_up',
    color: 'positive',
    titleEn: 'Top Gainers',
    titleTh: 'หุ้นบวกแรงสุด',
    rows: data.value?.gainers ?? [],
  },
  {
    key: 'losers',
    icon: 'trending_down',
    color: 'negative',
    titleEn: 'Top Losers',
    titleTh: 'หุ้นลบแรงสุด',
    rows: data.value?.losers ?? [],
  },
  {
    key: 'volatile',
    icon: 'bolt',
    color: 'warning',
    titleEn: 'Most Volatile',
    titleTh: 'ผันผวนสูงสุด',
    rows: data.value?.mostVolatile ?? [],
  },
]);

const moverChangeClass = (mover: VolatilityMover) =>
  mover.monthChangePercent >= 0 ? 'positive' : 'negative';

onMounted(load);
</script>

<template>
  <q-page class="movers-page">
    <header class="movers-header">
      <div>
        <WsBadge kind="ai" color="warning" value="MONTHLY" outline class="q-mb-sm" />
        <h1 class="movers-title">
          {{ languageStore.isThai ? 'หุ้นผันผวนรายเดือน' : 'Monthly Volatility Movers' }}
        </h1>
        <p class="movers-subtitle">
          {{
            languageStore.isThai
              ? 'จัดอันดับหุ้นที่เคลื่อนไหวแรงที่สุดในเดือนที่ผ่านมา'
              : 'The biggest movers and most volatile names over the trailing month.'
          }}
          <span v-if="periodLabel" class="movers-period">· {{ periodLabel }}</span>
        </p>
      </div>
      <q-btn-toggle
        :model-value="market"
        toggle-color="primary"
        unelevated
        no-caps
        class="movers-market-toggle"
        :options="marketOptions"
        @update:model-value="onMarketChange"
      />
    </header>

    <WsUpgradeNotice
      v-if="requiresUpgrade"
      data-test="movers-upgrade"
      message-th="อันดับหุ้นผันผวนรายเดือนใช้ข้อมูลตลาดแบบเจาะลึก เปิดให้เฉพาะสมาชิกแบบชำระเงิน"
      message-en="Monthly volatility rankings use premium market data and are available on paid plans."
    />

    <div v-else class="movers-grid">
      <WsCard v-for="col in columns" :key="col.key" class="movers-col">
        <template #header>
          <div class="movers-col-header">
            <q-icon :name="col.icon" :color="col.color" size="20px" />
            <span>{{ languageStore.isThai ? col.titleTh : col.titleEn }}</span>
          </div>
        </template>

        <div v-if="loading" class="movers-skeleton">
          <div v-for="n in 5" :key="n" class="movers-skeleton-row" />
        </div>

        <ul v-else class="movers-list">
          <li
            v-for="(mover, idx) in col.rows"
            :key="mover.symbol"
            class="movers-row"
            @click="goToAnalysis(mover.symbol)"
          >
            <span class="movers-rank">{{ idx + 1 }}</span>
            <div class="movers-symbol">
              <span class="movers-symbol-ticker">{{ mover.symbol }}</span>
              <span class="movers-symbol-name">{{ mover.name }}</span>
            </div>
            <div class="movers-metrics">
              <span class="movers-change" :class="moverChangeClass(mover)">
                {{ formatPct(mover.monthChangePercent) }}
              </span>
              <span class="movers-vol">
                <q-icon name="bolt" size="11px" />{{ mover.volatility }}
                <q-tooltip>
                  {{ languageStore.isThai ? 'ความผันผวน (proxy)' : 'Volatility (proxy)' }}
                </q-tooltip>
              </span>
              <span class="movers-liq">
                {{ formatValue(mover.avgDailyValue) }}
                <q-tooltip>
                  {{
                    languageStore.isThai ? 'มูลค่าซื้อขายเฉลี่ยต่อวัน' : 'Avg daily traded value'
                  }}
                </q-tooltip>
              </span>
            </div>
          </li>
          <li v-if="!col.rows.length" class="movers-empty" data-test="movers-empty">
            {{ languageStore.isThai ? 'ไม่มีข้อมูล' : 'No data' }}
          </li>
        </ul>
      </WsCard>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.movers-page {
  padding: 24px;
  max-width: 1280px;
  margin: 0 auto;
}

.movers-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.movers-title {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
}

.movers-subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.movers-period {
  font-weight: 700;
  color: var(--text-primary);
}

.movers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.movers-col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
}

.movers-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.movers-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.movers-row:hover {
  background: rgba(99, 102, 241, 0.08);
}

.movers-rank {
  width: 20px;
  font-weight: 700;
  color: var(--text-secondary);
  font-size: 13px;
}

.movers-symbol {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.movers-symbol-ticker {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-primary);
}

.movers-symbol-name {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movers-metrics {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.movers-change {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.movers-change.positive {
  color: #22c55e;
}

.movers-change.negative {
  color: #ef4444;
}

.movers-vol,
.movers-liq {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.movers-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.movers-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.movers-skeleton-row {
  height: 44px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.08) 25%,
    rgba(148, 163, 184, 0.18) 50%,
    rgba(148, 163, 184, 0.08) 75%
  );
  background-size: 200% 100%;
  animation: movers-shimmer 1.4s ease-in-out infinite;
}

@keyframes movers-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>

<template>
  <div class="popular-panel" data-test="popular-panel" :data-market="market">
    <div v-if="loading" class="popular-state" data-test="popular-loading">
      <q-spinner-dots size="26px" color="primary" />
    </div>

    <div v-else-if="error" class="popular-state" data-test="popular-error">
      <q-icon name="cloud_off" size="30px" class="popular-state__icon" />
      <p class="popular-state__text">{{ copy.error }}</p>
      <q-btn flat dense no-caps size="sm" color="primary" :label="copy.retry" @click="load" />
    </div>

    <div v-else-if="rows.length === 0" class="popular-state" data-test="popular-empty">
      <q-icon name="search_off" size="30px" class="popular-state__icon" />
      <p class="popular-state__text">{{ copy.empty }}</p>
    </div>

    <ul v-else class="popular-list">
      <li v-for="row in rows" :key="row.symbol">
        <button
          type="button"
          class="popular-row"
          data-test="popular-row"
          :class="{ 'popular-row--active': isActive(row.symbol) }"
          @click="emit('select', row.symbol)"
        >
          <span class="popular-logo" :style="{ background: avatarColor(row.symbol) }">
            {{ avatarInitials(row.symbol) }}
          </span>

          <span class="popular-id">
            <span class="popular-symbol">{{ displaySymbol(row.symbol) }}</span>
            <span class="popular-name">{{ row.name }}</span>
          </span>

          <span class="popular-figures">
            <span class="popular-price">{{ formatPrice(row) }}</span>
            <span
              class="popular-change"
              :class="changeClass(row.changePercent)"
              data-test="popular-change"
            >
              {{ formatChange(row.changePercent) }}
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * แผงหุ้นยอดนิยมของแผงซ้าย Stock Terminal (โหมด "หุ้นไทย" / "หุ้นสหรัฐ")
 *
 * ต่อกับ endpoint ที่มีอยู่จริงทั้งคู่ — /stocks/popular-th กับ /stocks/popular
 * (ดูหมายเหตุใน stocksService.getPopular) ราคามาจาก Yahoo จริง ไม่มี mock
 *
 * โหลดครั้งเดียวต่อการ mount และจำผลไว้ใน keep-alive ของหน้าแม่ — สลับแท็บไปมา
 * จึงไม่ยิงซ้ำทุกครั้ง ส่วนปุ่มลองใหม่มีไว้เผื่อ Yahoo ล่มชั่วคราว
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';
import { stocksService } from 'src/services/stocks.service';
import { symbolAvatarColor, symbolAvatarInitials } from 'src/utils/symbol-avatar';
import type { PopularMarket, PopularStockRow } from 'src/types/stocks.types';

const props = defineProps<{
  market: PopularMarket;
  selectedSymbol?: string | null;
}>();

const emit = defineEmits<{ (event: 'select', symbol: string): void }>();

const languageStore = useLanguageStore();

const rows = ref<PopularStockRow[]>([]);
const loading = ref(false);
const error = ref(false);

const avatarColor = symbolAvatarColor;
const avatarInitials = symbolAvatarInitials;

const copy = computed(() =>
  languageStore.isThai
    ? {
        error: 'ดึงราคาไม่สำเร็จ',
        retry: 'ลองใหม่',
        empty: 'ยังไม่มีข้อมูลหุ้นยอดนิยม',
      }
    : {
        error: 'Could not load quotes',
        retry: 'Retry',
        empty: 'No popular stocks yet',
      },
);

const displaySymbol = (symbol: string) => symbol.replace('.BK', '');

const isActive = (symbol: string) =>
  Boolean(props.selectedSymbol) &&
  props.selectedSymbol!.toUpperCase() === symbol.toUpperCase();

/** ไทยเป็นบาท สหรัฐเป็นดอลลาร์ — ตัดสินจากนามสกุลสัญลักษณ์ ไม่ใช่ prop market
    เพราะ endpoint ฝั่งไทยอาจคืนหุ้นที่ไม่ลงท้าย .BK ในอนาคต */
const formatPrice = (row: PopularStockRow) => {
  if (row.price === null) return '--';

  const sign = row.symbol.endsWith('.BK') ? '฿' : '$';
  return `${sign}${row.price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatChange = (value: number | null) =>
  value === null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const changeClass = (value: number | null) => {
  if (value === null) return 'is-flat';
  return value >= 0 ? 'is-up' : 'is-down';
};

async function load() {
  loading.value = true;
  error.value = false;

  try {
    rows.value = await stocksService.getPopular(props.market);
  } catch {
    // ปล่อยให้ผู้ใช้เห็นสถานะพลาดจริงพร้อมปุ่มลองใหม่ ดีกว่าโชว์รายการว่างเงียบๆ
    error.value = true;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.market, load);

onMounted(load);
</script>

<style scoped>
.popular-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.popular-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
}

.popular-state__icon {
  color: var(--text-muted);
  opacity: 0.6;
}

.popular-state__text {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.popular-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.popular-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.popular-row:hover {
  background: var(--bg-card-soft);
}

/* accent โปร่ง ชุดเดียวกับแถวที่เลือกอยู่ในตารางของ StockExplorerRail */
.popular-row--active {
  background: rgba(133, 182, 176, 0.18);
}

.popular-logo {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
}

.popular-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.popular-symbol {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.popular-name {
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popular-figures {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: 0 0 auto;
}

.popular-price {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.popular-change {
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.popular-change.is-up {
  color: var(--q-positive);
}
.popular-change.is-down {
  color: var(--q-negative);
}
.popular-change.is-flat {
  color: var(--text-muted);
}
</style>

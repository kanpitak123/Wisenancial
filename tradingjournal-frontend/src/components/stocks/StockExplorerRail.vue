<script setup lang="ts">
/**
 * แถบสำรวจหุ้นด้านซ้ายของหน้า Stock Terminal
 *
 * ย้ายเนื้อมาจาก StockExplorerPage.vue เดิมทั้งก้อน (ค้นหา / ฟิลเตอร์ตลาด-กลุ่ม /
 * ตารางที่แบ่งหน้าและเรียงลำดับฝั่ง backend) ต่างกันที่เดิมเป็นหน้าเต็มจอ 10 คอลัมน์
 * พอมาอยู่ในแถบแคบจึงแสดงคอลัมน์ที่จำเป็นต่อการเลือกหุ้น แล้วย้ายความสามารถ
 * "เรียงตาม P/E / ปันผล / ปริมาณ" ไปไว้ที่ช่องเลือกการเรียงแทน — ไม่ได้หายไป
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar, type QTableProps } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { useLanguageStore } from 'stores/LanguageStore';
import { EXCHANGE_OPTIONS, SECTOR_OPTIONS, stocksService } from 'src/services/stocks.service';
import { symbolAvatarInitials } from 'src/utils/symbol-avatar';
import type {
  StockExchange,
  StockListing,
  StockListParams,
  StockSector,
} from 'src/types/stocks.types';

const props = defineProps<{ selectedSymbol?: string | null }>();

const emit = defineEmits<{
  (event: 'select', symbol: string): void;
  /** ยิงครั้งแรกที่โหลดรายการได้ เพื่อให้หน้าแม่เลือกหุ้นตั้งต้นได้เองถ้ายังไม่มี symbol */
  (event: 'loaded', symbols: string[]): void;
}>();

const $q = useQuasar();
const languageStore = useLanguageStore();
const { safeLoad } = useSafeLoad();

const isDark = computed(() => $q.dark.isActive);

type MarketContext = 'TH' | 'GLOBAL';
type SortField = NonNullable<StockListParams['sortBy']>;

const activeMarket = ref<MarketContext>('GLOBAL');
const loading = ref(false);
const rows = ref<StockListing[]>([]);
const search = ref('');
const exchange = ref<StockExchange | 'ALL'>('ALL');
const sector = ref<StockSector | 'ALL'>('ALL');
const hasEmittedLoaded = ref(false);

const pagination = ref({
  sortBy: 'marketCap' as SortField,
  descending: true,
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
});

const marketOptions = computed(() => [
  { label: languageStore.isThai ? 'หุ้นไทย' : 'Thai', value: 'TH' as MarketContext },
  { label: languageStore.isThai ? 'หุ้นโลก' : 'Global', value: 'GLOBAL' as MarketContext },
]);

// โหมดหุ้นไทยถูกล็อกไว้ที่ SET ผ่านพารามิเตอร์ market อยู่แล้ว ตัวกรองตลาด
// (NASDAQ/NYSE) จึงมีความหมายเฉพาะโหมดหุ้นโลก
const exchangeOptions = computed(() => [
  { label: languageStore.isThai ? 'ทุกตลาด' : 'All exchanges', value: 'ALL' as const },
  ...EXCHANGE_OPTIONS.filter((item) => item !== 'SET').map((item) => ({
    label: item,
    value: item,
  })),
]);

const sectorOptions = computed(() => [
  { label: languageStore.isThai ? 'ทุกกลุ่ม' : 'All sectors', value: 'ALL' as const },
  ...SECTOR_OPTIONS.map((item) => ({ label: item, value: item })),
]);

/** คงตัวเลือกการเรียงครบชุดเท่าตารางเต็มจอเดิม แม้คอลัมน์ที่โชว์จะน้อยลง */
const sortOptions = computed(() => [
  { label: languageStore.isThai ? 'มูลค่าตลาด' : 'Market cap', value: 'marketCap' as SortField },
  { label: languageStore.isThai ? 'ราคา' : 'Price', value: 'price' as SortField },
  { label: languageStore.isThai ? '% เปลี่ยนแปลง' : 'Change %', value: 'changePercent' as SortField },
  { label: 'P/E', value: 'peRatio' as SortField },
  { label: languageStore.isThai ? 'ปันผล %' : 'Dividend %', value: 'dividendYield' as SortField },
  { label: languageStore.isThai ? 'ปริมาณ' : 'Volume', value: 'volume' as SortField },
  { label: languageStore.isThai ? 'สัญลักษณ์' : 'Symbol', value: 'symbol' as SortField },
]);

const columns = computed<QTableProps['columns']>(() => [
  {
    name: 'symbol',
    label: languageStore.isThai ? 'สัญลักษณ์' : 'Symbol',
    field: 'symbol',
    align: 'left',
    sortable: true,
  },
  {
    name: 'price',
    label: languageStore.isThai ? 'ราคา' : 'Price',
    field: 'price',
    align: 'right',
    sortable: true,
  },
  { name: 'changePercent', label: '%', field: 'changePercent', align: 'right', sortable: true },
  {
    name: 'marketCap',
    label: languageStore.isThai ? 'มูลค่า' : 'Cap',
    field: 'marketCap',
    align: 'right',
    sortable: true,
  },
]);

const fetchRows = async (override?: Partial<typeof pagination.value>) => {
  const current = { ...pagination.value, ...override };

  loading.value = true;

  try {
    const result = await safeLoad(
      () =>
        stocksService.list({
          search: search.value,
          exchange: exchange.value,
          market: activeMarket.value,
          sector: sector.value,
          sortBy: current.sortBy,
          sortDir: current.descending ? 'desc' : 'asc',
          page: current.page,
          pageSize: current.rowsPerPage,
        }),
      'โหลดรายการหุ้นไม่สำเร็จ',
    );

    if (!result) return;

    rows.value = result.rows;
    pagination.value = { ...current, rowsNumber: result.total };

    if (!hasEmittedLoaded.value) {
      hasEmittedLoaded.value = true;
      emit(
        'loaded',
        result.rows.map((row) => row.symbol),
      );
    }
  } finally {
    loading.value = false;
  }
};

const onRequest: QTableProps['onRequest'] = (requestProps) => {
  void fetchRows(requestProps.pagination as Partial<typeof pagination.value>);
};

const onMarketChange = (market: MarketContext) => {
  activeMarket.value = market;
  exchange.value = 'ALL';
};

const onSortChange = (value: SortField) => {
  void fetchRows({ sortBy: value, page: 1 });
};

// เปลี่ยนตัวกรองแล้วกลับไปหน้าแรกเสมอ ไม่งั้นค้างอยู่หน้า 5 ของผลลัพธ์ชุดเก่า
watch([search, exchange, sector, activeMarket], () => {
  void fetchRows({ page: 1 });
});

const isSelected = (symbol: string): boolean =>
  (props.selectedSymbol ?? '').toUpperCase() === symbol.toUpperCase();

const formatCap = (value: number): string => {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toFixed(0);
};

onMounted(() => {
  void fetchRows();
});
</script>

<template>
  <div class="explorer-rail" data-test="stock-explorer-rail">
    <div class="rail-filters">
      <q-btn-toggle
        :model-value="activeMarket"
        toggle-color="primary"
        unelevated
        dense
        no-caps
        spread
        size="sm"
        :options="marketOptions"
        class="rail-market-toggle"
        data-test="rail-market-toggle"
        @update:model-value="onMarketChange"
      />

      <q-input
        v-model="search"
        dense
        outlined
        clearable
        debounce="300"
        :dark="isDark"
        data-test="rail-search"
        :placeholder="languageStore.isThai ? 'ค้นหาสัญลักษณ์/ชื่อ' : 'Search symbol / name'"
      >
        <template #prepend><q-icon name="search" size="18px" /></template>
      </q-input>

      <div class="rail-filter-row">
        <q-select
          v-if="activeMarket === 'GLOBAL'"
          v-model="exchange"
          :options="exchangeOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          dense
          outlined
          options-dense
          :dark="isDark"
          class="rail-filter"
          data-test="rail-exchange"
          :label="languageStore.isThai ? 'ตลาด' : 'Exchange'"
        />
        <q-select
          v-model="sector"
          :options="sectorOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          dense
          outlined
          options-dense
          :dark="isDark"
          class="rail-filter"
          data-test="rail-sector"
          :label="languageStore.isThai ? 'กลุ่ม' : 'Sector'"
        />
      </div>

      <q-select
        :model-value="pagination.sortBy"
        :options="sortOptions"
        option-value="value"
        option-label="label"
        emit-value
        map-options
        dense
        outlined
        options-dense
        :dark="isDark"
        data-test="rail-sort"
        :label="languageStore.isThai ? 'เรียงตาม' : 'Sort by'"
        @update:model-value="onSortChange"
      />
    </div>

    <q-table
      flat
      dense
      :dark="isDark"
      :rows="rows"
      :columns="columns"
      row-key="symbol"
      :loading="loading"
      v-model:pagination="pagination"
      :rows-per-page-options="[20, 50]"
      binary-state-sort
      class="rail-table"
      data-test="rail-table"
      @request="onRequest"
      @row-click="(_evt, row) => emit('select', (row as StockListing).symbol)"
    >
      <template #body-cell-symbol="cellProps">
        <q-td :props="cellProps">
          <div
            class="rail-symbol-cell"
            :class="{ 'rail-symbol-cell--active': isSelected(cellProps.row.symbol) }"
          >
            <span class="rail-badge" aria-hidden="true">
              {{ symbolAvatarInitials(cellProps.row.symbol) }}
            </span>
            <span class="rail-symbol-text">
              <span class="rail-symbol">{{ cellProps.row.symbol.replace('.BK', '') }}</span>
              <span class="rail-name">{{ cellProps.row.name }}</span>
            </span>
          </div>
        </q-td>
      </template>
      <template #body-cell-changePercent="cellProps">
        <q-td :props="cellProps">
          <span :class="cellProps.row.changePercent >= 0 ? 'text-positive' : 'text-negative'">
            {{ cellProps.row.changePercent >= 0 ? '+' : ''
            }}{{ cellProps.row.changePercent.toFixed(2) }}%
          </span>
        </q-td>
      </template>
      <template #body-cell-marketCap="cellProps">
        <q-td :props="cellProps">{{ formatCap(cellProps.row.marketCap) }}</q-td>
      </template>
      <template #no-data>
        <div class="rail-empty">
          {{ languageStore.isThai ? 'ไม่พบหุ้นที่ตรงกับตัวกรอง' : 'No stocks match these filters' }}
        </div>
      </template>
    </q-table>
  </div>
</template>

<style scoped lang="scss">
/**
 * ใช้ตัวแปรกลางชุดเดียวกับที่เหลือของแอป (app.scss / WsCard) — --bg-card,
 * --border-color, --text-primary, --text-secondary — แทนการฮาร์ดโค้ดสีหรือ
 * ใช้ opacity ลอย ๆ ไม่งั้นแถบนี้จะเป็นคนละโทนกับหน้าอื่นเวลาสลับ light/dark
 */
.explorer-rail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-card);
  color: var(--text-primary);
}

.rail-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.rail-market-toggle {
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.rail-filter-row {
  display: flex;
  gap: 8px;
}

.rail-filter {
  flex: 1;
  min-width: 0;
}

/* ตารางต้องโปร่งใส ให้พื้นของแถบ (--bg-card) เป็นตัวกำหนดโทนทั้งสองธีม
   ไม่งั้น q-table จะพกพื้นขาว/ดำของตัวเองมาทับจนไม่เข้ากับหน้าอื่น */
.rail-table {
  flex: 1;
  min-height: 0;
  overflow: auto;
  cursor: pointer;
  background: transparent;
  color: var(--text-primary);
}

.rail-table :deep(.q-table__top),
.rail-table :deep(.q-table__bottom),
.rail-table :deep(thead tr th) {
  background: var(--bg-card);
  color: var(--text-secondary);
  border-color: var(--border-color);
}

.rail-table :deep(tbody td) {
  border-color: var(--border-color);
  color: var(--text-primary);
}

.rail-table :deep(tbody tr:hover) {
  background: var(--bg-card-soft);
}

/* ตามแบบ: ป้ายตัวย่ออยู่หน้าแถว แล้วสัญลักษณ์/ชื่อซ้อนกันสองบรรทัดถัดไป */
.rail-symbol-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.2;
  border-left: 2px solid transparent;
  padding-left: 6px;
  margin-left: -6px;
}

.rail-symbol-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rail-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-color);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--q-primary);
}

.rail-symbol-cell--active {
  border-left-color: var(--q-primary);
}

.rail-symbol-cell--active .rail-badge {
  background: rgba(133, 182, 176, 0.16);
  border-color: transparent;
}

.rail-symbol {
  font-weight: 700;
  color: var(--text-primary);
}

.rail-name {
  font-size: 11px;
  color: var(--text-secondary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-empty {
  width: 100%;
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

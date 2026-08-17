<script setup lang="ts">
/**
 * ส่งออกรายงานกำไร/ขาดทุนเป็น CSV พร้อมตัวเลือกเดือน
 *
 * ต้นฉบับ (PlExportCard ของโปรเจกต์เก่า) อ่านจาก journalStore.trades ซึ่งเป็นข้อมูลฝั่ง
 * Forex — แท็บนี้อยู่ในโหมด Stock จึงอ่าน "ข้อมูล investor ที่เทียบเท่า" แทน คือรายการ
 * ขายหุ้นที่ realize กำไร/ขาดทุนแล้ว (InvestorPortfolioStore.sales)
 *
 * ไม่ได้สร้าง utils/csv.ts ใหม่ตามแผน เพราะ utils/csv-export.ts ที่มีอยู่แล้วมี
 * buildRealizedPnlCsv() + downloadCsv() ที่ทำงานนี้ตรงตัวและมีเทสคุมอยู่แล้ว
 */
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { useInvestorPortfolioStore } from 'stores/InvestorPortfolioStore';
import { WsBadge, WsCard } from 'src/components/ui';
import { buildRealizedPnlCsv, downloadCsv } from 'src/utils/csv-export';
import type { InvestorSale } from 'src/types/investor-portfolio.types';

const $q = useQuasar();
const languageStore = useLanguageStore();
const investorStore = useInvestorPortfolioStore();

const selectedMonth = ref<string>('ALL');

const monthKeyOf = (sale: InvestorSale): string | null => {
  const date = new Date(sale.sold_date);

  if (Number.isNaN(date.getTime())) return null;

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const MONTH_NAMES_TH = [
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
];

const MONTH_NAMES_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** เดือนที่มีรายการขายจริง เรียงใหม่สุดก่อน */
const monthOptions = computed(() => {
  const keys = new Set<string>();

  for (const sale of investorStore.sales) {
    const key = monthKeyOf(sale);
    if (key) keys.add(key);
  }

  const names = languageStore.isThai ? MONTH_NAMES_TH : MONTH_NAMES_EN;

  return [
    { label: languageStore.isThai ? 'ทั้งหมด' : 'All months', value: 'ALL' },
    ...[...keys]
      .sort()
      .reverse()
      .map((key) => {
        const [year, month] = key.split('-');

        return { label: `${names[Number(month) - 1] ?? month} ${year}`, value: key };
      }),
  ];
});

const filteredSales = computed(() => {
  if (selectedMonth.value === 'ALL') return investorStore.sales;

  return investorStore.sales.filter((sale) => monthKeyOf(sale) === selectedMonth.value);
});

const totalPnl = computed(() =>
  filteredSales.value.reduce((sum, sale) => sum + Number(sale.realized_pnl ?? 0), 0),
);

const winCount = computed(
  () => filteredSales.value.filter((sale) => Number(sale.realized_pnl ?? 0) > 0).length,
);

const currency = computed(() => investorStore.dashboard?.portfolio?.currency ?? 'USD');

const exportCsv = () => {
  const sales = filteredSales.value;

  if (!sales.length) {
    $q.notify({
      type: 'warning',
      message: languageStore.isThai
        ? 'ไม่มีรายการในช่วงเวลาที่เลือก'
        : 'No records for the selected period',
      position: 'top',
    });
    return;
  }

  const suffix = selectedMonth.value === 'ALL' ? 'all' : selectedMonth.value;

  downloadCsv(`pl-report-${suffix}.csv`, buildRealizedPnlCsv(sales, currency.value));

  $q.notify({
    type: 'positive',
    message: languageStore.isThai
      ? `ส่งออก ${sales.length} รายการแล้ว`
      : `Exported ${sales.length} records`,
    position: 'top',
  });
};
</script>

<template>
  <WsCard tone="glass" class="pl-export-card" data-test="pl-export-card">
    <template #header>
      <div class="pl-export-header">
        <div class="pl-export-header__title">
          <q-icon name="download" size="22px" class="pl-export-header__icon" />
          <div>
            <h3 class="pl-export-title">
              {{ languageStore.isThai ? 'ส่งออกรายงานกำไร/ขาดทุน' : 'Export P/L Report' }}
            </h3>
            <p class="pl-export-subtitle">
              {{
                languageStore.isThai
                  ? 'ดาวน์โหลดรายการขายที่รับรู้กำไร/ขาดทุนแล้วเป็นไฟล์ CSV'
                  : 'Download your realized-P/L sales as a CSV file'
              }}
            </p>
          </div>
        </div>
        <WsBadge kind="ai" color="primary" value="CSV" outline />
      </div>
    </template>

    <div class="pl-export-body">
      <q-select
        v-model="selectedMonth"
        :options="monthOptions"
        option-value="value"
        option-label="label"
        emit-value
        map-options
        dense
        outlined
        :dark="$q.dark.isActive"
        class="pl-export-month"
        :label="languageStore.isThai ? 'เลือกเดือน' : 'Select month'"
      >
        <template #prepend><q-icon name="calendar_month" /></template>
      </q-select>

      <div class="pl-export-stats">
        <div class="pl-stat">
          <span class="pl-stat-label">{{ languageStore.isThai ? 'รายการ' : 'Records' }}</span>
          <span class="pl-stat-value" data-test="pl-export-count">{{ filteredSales.length }}</span>
        </div>
        <div class="pl-stat">
          <span class="pl-stat-label">{{ languageStore.isThai ? 'กำไร' : 'Wins' }}</span>
          <span class="pl-stat-value">{{ winCount }}</span>
        </div>
        <div class="pl-stat">
          <span class="pl-stat-label">
            {{ languageStore.isThai ? 'กำไร/ขาดทุนรวม' : 'Total P/L' }}
          </span>
          <span class="pl-stat-value" :class="totalPnl >= 0 ? 'positive' : 'negative'">
            {{ totalPnl >= 0 ? '+' : '' }}{{ totalPnl.toFixed(2) }}
          </span>
        </div>
      </div>

      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="file_download"
        class="pl-export-btn"
        data-test="pl-export-btn"
        :disable="!filteredSales.length"
        :label="languageStore.isThai ? 'ส่งออก CSV' : 'Export CSV'"
        @click="exportCsv"
      />
    </div>
  </WsCard>
</template>

<style scoped>
.pl-export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pl-export-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pl-export-header__icon {
  color: var(--q-primary);
}

.pl-export-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.pl-export-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.pl-export-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pl-export-month {
  max-width: 260px;
}

.pl-export-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.pl-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-card-soft);
}

.pl-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.pl-stat-value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.pl-stat-value.positive {
  color: #22c55e;
}

.pl-stat-value.negative {
  color: #ef4444;
}

.pl-export-btn {
  align-self: flex-start;
  border-radius: 10px;
}
</style>

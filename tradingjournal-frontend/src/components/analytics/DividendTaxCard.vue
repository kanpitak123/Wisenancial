<script setup lang="ts">
/**
 * รายงานภาษีเงินปันผลรายปี + ส่งออก CSV
 *
 * ต่อกับ endpoint ที่เพิ่งสร้างใหม่ GET /dividends/portfolio/:id/tax-summary?year=
 * (ของเดิมในโปรเจกต์เก่ายิง /dividends/tax-summary ที่ backend ยังไม่เคยมี แล้ว fallback
 * ไปข้อมูลปลอมฝั่ง client เงียบๆ — ตัวนี้ไม่ fallback แล้ว ล้มเมื่อไหร่ขึ้น error จริง)
 */
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useLanguageStore } from 'stores/LanguageStore';
import { WsBadge, WsCard } from 'src/components/ui';
import { dividendService, getDividendErrorMessage } from 'src/services/dividend.service';
import { downloadCsv, toCsv } from 'src/utils/csv-export';
import type { DividendTaxSummary } from 'src/types/dividend.types';

const props = defineProps<{ portfolioId: number | null }>();

const $q = useQuasar();
const languageStore = useLanguageStore();

const loading = ref(false);
const error = ref<string | null>(null);
const summary = ref<DividendTaxSummary | null>(null);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

const yearOptions = computed(() => Array.from({ length: 5 }, (_, i) => currentYear - i));

const load = async () => {
  if (props.portfolioId === null) {
    summary.value = null;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    summary.value = await dividendService.getTaxSummary(props.portfolioId, selectedYear.value);
  } catch (err) {
    error.value = getDividendErrorMessage(err, 'โหลดรายงานภาษีเงินปันผลไม่สำเร็จ');
    summary.value = null;
  } finally {
    loading.value = false;
  }
};

watch(() => [props.portfolioId, selectedYear.value], () => void load(), { immediate: true });

const fmt = (value: number) =>
  value.toLocaleString(languageStore.isThai ? 'th-TH' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const exportCsv = () => {
  const data = summary.value;

  if (!data || !data.records.length) {
    $q.notify({
      type: 'warning',
      message: languageStore.isThai ? 'ไม่มีข้อมูลเงินปันผล' : 'No dividend data',
      position: 'top',
    });
    return;
  }

  const headers = [
    'Payment Date',
    'Symbol',
    'Name',
    'Shares',
    'Dividend / Share',
    'Gross',
    'WHT Rate',
    'Tax Withheld',
    'Net',
  ];

  const rows: (string | number)[][] = data.records.map((record) => [
    record.paymentDate,
    record.symbol,
    record.name,
    record.shares,
    record.dividendPerShare.toFixed(2),
    record.grossAmount.toFixed(2),
    `${(record.whtRate * 100).toFixed(0)}%`,
    record.taxWithheld.toFixed(2),
    record.netAmount.toFixed(2),
  ]);

  rows.push([
    '',
    '',
    languageStore.isThai ? 'รวม' : 'TOTAL',
    '',
    '',
    data.totalGross.toFixed(2),
    '',
    data.totalTaxWithheld.toFixed(2),
    data.totalNet.toFixed(2),
  ]);

  downloadCsv(`dividend-tax-${data.year}.csv`, toCsv(headers, rows));

  $q.notify({
    type: 'positive',
    message: languageStore.isThai
      ? `ส่งออกรายงานภาษีเงินปันผลปี ${data.year} แล้ว`
      : `Exported ${data.year} dividend tax report`,
    position: 'top',
  });
};
</script>

<template>
  <WsCard tone="glass" class="div-tax-card" data-test="dividend-tax-card">
    <template #header>
      <div class="div-tax-header">
        <div class="div-tax-header__title">
          <q-icon name="receipt_long" size="22px" class="div-tax-header__icon" />
          <div>
            <h3 class="div-tax-title">
              {{ languageStore.isThai ? 'รายงานภาษีเงินปันผล' : 'Dividend Tax Report' }}
            </h3>
            <p class="div-tax-subtitle">
              {{
                languageStore.isThai
                  ? 'สรุปเงินปันผลและภาษีหัก ณ ที่จ่ายรายปี สำหรับใช้ยื่นภาษี'
                  : 'Yearly dividends and withholding tax summary for your tax filing'
              }}
            </p>
          </div>
        </div>
        <WsBadge kind="thai" color="warning" value="WHT" outline />
      </div>
    </template>

    <div class="div-tax-body">
      <q-select
        v-model="selectedYear"
        :options="yearOptions"
        dense
        outlined
        :dark="$q.dark.isActive"
        class="div-tax-year"
        :label="languageStore.isThai ? 'ปีภาษี' : 'Tax year'"
      >
        <template #prepend><q-icon name="event" /></template>
      </q-select>

      <div v-if="loading" class="div-tax-loading" data-test="dividend-tax-loading">
        <q-spinner-dots color="primary" size="28px" />
      </div>

      <div v-else-if="props.portfolioId === null" class="div-tax-state">
        {{ languageStore.isThai ? 'เลือกพอร์ตก่อน' : 'Select a portfolio first' }}
      </div>

      <div v-else-if="error" class="div-tax-state" data-test="dividend-tax-error">
        <q-icon name="cloud_off" size="28px" class="q-mb-sm" />
        <div>{{ error }}</div>
        <q-btn
          flat
          no-caps
          color="primary"
          class="q-mt-sm"
          :label="languageStore.isThai ? 'ลองใหม่' : 'Retry'"
          @click="load"
        />
      </div>

      <div
        v-else-if="!summary || summary.records.length === 0"
        class="div-tax-state"
        data-test="dividend-tax-empty"
      >
        <q-icon name="savings" size="28px" class="q-mb-sm" />
        <div>
          {{
            languageStore.isThai
              ? `ยังไม่มีเงินปันผลในปี ${selectedYear}`
              : `No dividends recorded for ${selectedYear}`
          }}
        </div>
      </div>

      <template v-else>
        <div v-if="summary.byWhtRate.length > 1" class="div-tax-rates">
          <div v-for="bucket in summary.byWhtRate" :key="bucket.whtRate" class="div-tax-rate">
            <span class="div-tax-rate__label">
              {{ (bucket.whtRate * 100).toFixed(0) }}% · {{ bucket.count }}
            </span>
            <span class="div-tax-rate__value">{{ fmt(bucket.taxWithheld) }}</span>
          </div>
        </div>

        <q-markup-table
          flat
          :dark="$q.dark.isActive"
          class="div-tax-table"
          separator="horizontal"
        >
          <thead>
            <tr>
              <th class="text-left">{{ languageStore.isThai ? 'วันที่จ่าย' : 'Date' }}</th>
              <th class="text-left">{{ languageStore.isThai ? 'หุ้น' : 'Symbol' }}</th>
              <th class="text-right">{{ languageStore.isThai ? 'รวม' : 'Gross' }}</th>
              <th class="text-right">{{ languageStore.isThai ? 'ภาษีหัก' : 'WHT' }}</th>
              <th class="text-right">{{ languageStore.isThai ? 'สุทธิ' : 'Net' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in summary.records" :key="record.id" data-test="dividend-tax-row">
              <td class="text-left">{{ record.paymentDate }}</td>
              <td class="text-left">{{ record.symbol.replace('.BK', '') }}</td>
              <td class="text-right">{{ fmt(record.grossAmount) }}</td>
              <td class="text-right text-negative">{{ fmt(record.taxWithheld) }}</td>
              <td class="text-right">{{ fmt(record.netAmount) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="div-tax-total">
              <td class="text-left" colspan="2">
                {{ languageStore.isThai ? 'รวมทั้งปี' : 'Year total' }}
              </td>
              <td class="text-right">{{ fmt(summary.totalGross) }}</td>
              <td class="text-right text-negative">{{ fmt(summary.totalTaxWithheld) }}</td>
              <td class="text-right text-weight-bold">{{ fmt(summary.totalNet) }}</td>
            </tr>
          </tfoot>
        </q-markup-table>

        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="file_download"
          class="div-tax-export"
          data-test="dividend-tax-export"
          :label="languageStore.isThai ? 'ส่งออก CSV' : 'Export CSV'"
          @click="exportCsv"
        />
      </template>
    </div>
  </WsCard>
</template>

<style scoped>
.div-tax-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.div-tax-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.div-tax-header__icon {
  color: var(--q-primary);
}

.div-tax-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.div-tax-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.div-tax-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.div-tax-year {
  max-width: 200px;
}

.div-tax-loading,
.div-tax-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.div-tax-rates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.div-tax-rate {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg-card-soft);
}

.div-tax-rate__label {
  font-size: 11px;
  color: var(--text-secondary);
}

.div-tax-rate__value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.div-tax-table {
  background: transparent;
}

.div-tax-total td {
  font-weight: 700;
  border-top: 2px solid var(--border-color);
}

.div-tax-export {
  align-self: flex-start;
  border-radius: 10px;
}
</style>
